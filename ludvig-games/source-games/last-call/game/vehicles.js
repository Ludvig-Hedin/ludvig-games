import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const luggageColors = [0xf5cb66, 0x7cb8b6, 0xc3b6d9, 0xe88965, 0x8a9fae, 0xc6ce8e, 0xe3bcb1, 0x516b8b];

function roundedBox(w, h, d, r = .08) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
  const p = g.attributes.position;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(clamp(v.x, -inner.x, inner.x), clamp(v.y, -inner.y, inner.y), clamp(v.z, -inner.z, inner.z));
    v.sub(q).normalize().multiplyScalar(r).add(q);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Merge only positions/normals/UVs: enough for all solid components here.
function combine(parts) {
  const positions = [], normals = [], uvs = [];
  for (const [geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]] of parts) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    if (g.attributes.uv) uvs.push(...g.attributes.uv.array);
    else uvs.push(...new Array(g.attributes.position.count * 2).fill(0));
    g.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.computeBoundingSphere();
  return result;
}

function tube(a, b, radius = .045, segments = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(radius, radius, direction.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  g.translate(...start.add(end).multiplyScalar(.5).toArray());
  return g;
}

function shadowTexture() {
  const n = 64, pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot((x + .5 - n / 2) / (n / 2), (y + .5 - n / 2) / (n / 2));
    const i = (y * n + x) * 4;
    pixels[i] = 26; pixels[i + 1] = 36; pixels[i + 2] = 38;
    pixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 2.1) * 210);
  }
  const texture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function disposeTree(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(node => {
    // Instance attributes belong to the mesh, not its shared geometry.
    if (node.isInstancedMesh) node.dispose();
    if (node.geometry) geometries.add(node.geometry);
    for (const m of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
      materials.add(m);
      if (m.map) textures.add(m.map);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  group.removeFromParent();
}

export function createCart({ color = 0xff754c, isBot = false } = {}) {
  const group = new THREE.Group();
  const suspension = new THREE.Group(); group.add(suspension);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .3, metalness: .22 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd6dddd, roughness: .23, metalness: .8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x29363d, roughness: .75 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xf4ead7, roughness: .68 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x212c32, roughness: .95 });
  const skin = new THREE.MeshStandardMaterial({ color: isBot ? 0xc58b6c : 0xe9b58c, roughness: .85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffcf3, roughness: .55 });
  const add = (g, m, parent = suspension, p = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(g, m); mesh.position.set(...p); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };

  add(roundedBox(1.88, .3, 2.65, .11), paint, suspension, [0, .55, -.22]);
  add(roundedBox(1.65, .07, 2.38, .03), dark, suspension, [0, .738, -.22]);
  add(roundedBox(1.74, .12, .16, .045), trim, suspension, [0, .53, -1.6]);
  add(roundedBox(1.42, .16, .43, .055), paint, suspension, [0, .4, 1.25]);

  const railParts = [];
  for (const x of [-.83, .83]) {
    railParts.push([tube([x, .65, -1.4], [x, 1.06, -1.4])]);
    railParts.push([tube([x, 1.06, -1.4], [x, 1.06, .63])]);
    railParts.push([tube([x, .65, .63], [x, 1.44, .63], .055)]);
  }
  railParts.push([tube([-.83, 1.44, .63], [.83, 1.44, .63], .065)]);
  railParts.push([tube([-.83, 1.06, -1.4], [.83, 1.06, -1.4])]);
  const rails = combine(railParts); railParts.forEach(([g]) => g.dispose()); add(rails, trim);
  const gripParts = [-.48, .48].map(x => [tube([x - .14, 1.44, .63], [x + .14, 1.44, .63], .081)]);
  add(combine(gripParts), dark); gripParts.forEach(([g]) => g.dispose());

  const accents = combine([
    [roundedBox(.3, .12, .035, .017), [-.62, .61, -1.555]],
    [roundedBox(.3, .12, .035, .017), [.62, .61, -1.555]],
    [roundedBox(.42, .11, .02, .008), [0, .57, -1.58]]
  ]);
  add(accents, white);
  // Small vertical slats make a cart, instead of a generic racing cube.
  const slat = new THREE.BoxGeometry(.045, .25, .05);
  add(combine(Array.from({ length: 7 }, (_, i) => [slat, [-.66 + i * .22, .86, -1.39]])), trim);
  slat.dispose();

  const wheelGeometry = new THREE.CylinderGeometry(.29, .29, .2, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(.13, .13, .215, 12); hubGeometry.rotateZ(Math.PI / 2);
  const wheels = new THREE.InstancedMesh(wheelGeometry, tire, 4);
  const hubs = new THREE.InstancedMesh(hubGeometry, trim, 4);
  wheels.castShadow = true; hubs.castShadow = true; group.add(wheels, hubs);
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const wheelLocations = [[-.93, .29, -1.04], [.93, .29, -1.04], [-.93, .29, .73], [.93, .29, .73]];

  const driver = new THREE.Group(); suspension.add(driver); driver.position.set(0, 0, 1.01);
  add(roundedBox(.64, .69, .43, .15), isBot ? dark : ivory, driver, [0, 1.39, 0]);
  add(roundedBox(.46, .22, .36, .09), dark, driver, [0, .97, .015]);
  add(roundedBox(.48, .49, .43, .15), skin, driver, [0, 1.98, -.015]);
  const cap = add(new THREE.SphereGeometry(.282, 12, 8, 0, TAU, 0, Math.PI * .5), paint, driver, [0, 2.15, -.02]);
  cap.scale.set(1, .67, .92);
  add(roundedBox(.43, .045, .31, .02), paint, driver, [0, 2.14, -.24]);
  const faceGeom = new THREE.SphereGeometry(.028, 6, 4);
  add(combine([[-.115, 2.01, -.227], [.115, 2.01, -.227]].map(p => [faceGeom, p])), dark, driver);
  faceGeom.dispose();
  const arms = [];
  for (const side of [-1, 1]) {
    arms.push([tube([side * .31, 1.63, -.02], [side * .45, 1.39, -.38], .11)]);
    arms.push([tube([side * .45, 1.39, -.38], [side * .47, 1.44, -.4], .088)]);
  }
  add(combine(arms), isBot ? dark : ivory, driver); arms.forEach(([g]) => g.dispose());
  const hand = new THREE.SphereGeometry(.105, 8, 6);
  add(combine([[-.47, 1.44, -.39], [.47, 1.44, -.39]].map(p => [hand, p])), skin, driver); hand.dispose();
  const legs = [tube([-.19, .93, .01], [-.23, .55, .12], .1), tube([.19, .93, .01], [.23, .55, .12], .1)];
  add(combine(legs.map(g => [g])), dark, driver); legs.forEach(g => g.dispose());
  const shoe = roundedBox(.23, .14, .38, .05);
  add(combine([[-.23, .51, .04], [.23, .51, .04]].map(p => [shoe, p])), white, driver); shoe.dispose();
  add(roundedBox(.45, .47, .18, .08), paint, driver, [0, 1.42, .27]);

  const luggage = new THREE.Group(); suspension.add(luggage);
  const bagGeo = roundedBox(.77, .58, .58, .08);
  const bagMaterial = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .05 });
  const bags = new THREE.InstancedMesh(bagGeo, bagMaterial, 8);
  bags.castShadow = true; bags.receiveShadow = true;
  const handleGeo = combine([
    [tube([-.12, .29, 0], [-.12, .39, 0], .026)],
    [tube([.12, .29, 0], [.12, .39, 0], .026)],
    [tube([-.12, .39, 0], [.12, .39, 0], .026)],
    [new THREE.BoxGeometry(.026, .43, .026), [-.22, 0, -.292]],
    [new THREE.BoxGeometry(.026, .43, .026), [.22, 0, -.292]],
    [new THREE.BoxGeometry(.026, .43, .026), [0, 0, -.292]]
  ]);
  const handles = new THREE.InstancedMesh(handleGeo, dark, 8);
  const tags = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, .17, .012), white, 8);
  luggage.add(bags, handles, tags);
  for (let i = 0; i < 8; i++) bags.setColorAt(i, new THREE.Color(luggageColors[i]));
  for (const instance of [bags, handles, tags]) {
    instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instance.frustumCulled = false;
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: .85 }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(3.6, 4.6, 1); shadow.position.set(0, .018, 0); group.add(shadow);
  const dummy = new THREE.Object3D();
  const tagMatrix = new THREE.Matrix4();
  const tagOffset = new THREE.Matrix4().compose(new THREE.Vector3(.22, .12, -.31), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, .22)), new THREE.Vector3(1, 1, 1));
  let wheelSpin = 0, lean = 0, pitch = 0, lastSpeed = 0;

  function update(p, dt = 1 / 60, time = 0) {
    const speed = Number.isFinite(p.speed) ? p.speed : Math.hypot(p.vx || 0, p.vz || 0);
    const steer = p.steer || 0;
    const air = Math.max(0, p.y || 0);
    group.position.set(p.x || 0, air, p.z || 0);
    group.rotation.y = -(p.angle || 0);
    const velocityForward = (p.vx || 0) * Math.sin(p.angle || 0) - (p.vz || 0) * Math.cos(p.angle || 0);
    wheelSpin += velocityForward * dt / .29;
    lean = damp(lean, -steer * Math.min(speed / 24, 1) * (p.drifting ? .14 : .065), 9, dt);
    pitch = damp(pitch, clamp((lastSpeed - speed) * .018, -.07, .09) + clamp(-(p.vy || 0) * .014, -.11, .11), 7, dt);
    lastSpeed = speed;
    suspension.rotation.z = lean;
    suspension.rotation.x = pitch;
    suspension.position.y = Math.sin(time * (12 + speed * .2)) * Math.min(speed / 800, .035);
    driver.rotation.z = -lean * .65;
    driver.rotation.x = -pitch * .3 + (p.boosting || p.turboTimer > 0 ? -.09 : 0);
    for (let i = 0; i < 4; i++) {
      dummy.position.set(...wheelLocations[i]); dummy.rotation.set(wheelSpin, i < 2 ? -steer * .37 : 0, 0, 'YXZ'); dummy.scale.setScalar(1); dummy.updateMatrix();
      wheels.setMatrixAt(i, dummy.matrix); hubs.setMatrixAt(i, dummy.matrix);
    }
    wheels.instanceMatrix.needsUpdate = true; hubs.instanceMatrix.needsUpdate = true;
    const count = clamp(Math.floor(p.cargo || 0), 0, 8);
    bags.count = count; handles.count = count; tags.count = count;
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      dummy.position.set(side * .41 + Math.sin(time * 6 + i) * .013 * layer * speed / 14, 1.04 + layer * .57, -.48 + (layer % 2 ? -.04 : .04));
      dummy.rotation.set(Math.sin(time * 4.2 + i) * .012 * layer, (layer % 2 ? .13 : -.035) * side, lean * layer * .38 + Math.sin(time * 5 + i * 2) * .012 * layer, 'XYZ');
      dummy.scale.setScalar(1); dummy.updateMatrix();
      bags.setMatrixAt(i, dummy.matrix); handles.setMatrixAt(i, dummy.matrix);
      tags.setMatrixAt(i, tagMatrix.multiplyMatrices(dummy.matrix, tagOffset));
    }
    bags.instanceMatrix.needsUpdate = true; handles.instanceMatrix.needsUpdate = true; tags.instanceMatrix.needsUpdate = true;
    shadow.position.y = .018 - air;
    shadow.scale.set(3.6 + air * .25, 4.6 + air * .35, 1);
    shadow.material.opacity = .85 / (1 + air * .3);
  }
  update({ x: 0, z: 0, cargo: 3 }, 1 / 60, 0);
  return { group, update, dispose: () => disposeTree(group) };
}

export function createPickup({ color = 0xf5cb66 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(roundedBox(.82, 1.06, .49, .095), new THREE.MeshStandardMaterial({ color, roughness: .37, metalness: .12 }));
  body.position.y = .85; body.castShadow = true; group.add(body);
  const dark = new THREE.MeshStandardMaterial({ color: 0x42504e, roughness: .55 });
  const parts = [];
  for (const x of [-.23, 0, .23]) parts.push([new THREE.BoxGeometry(.026, .72, .018), [x, .85, -.251]]);
  parts.push([tube([-.15, 1.38, 0], [-.15, 1.54, 0], .032)]);
  parts.push([tube([.15, 1.38, 0], [.15, 1.54, 0], .032)]);
  parts.push([tube([-.15, 1.54, 0], [.15, 1.54, 0], .032)]);
  parts.push([new THREE.SphereGeometry(.065, 8, 6), [-.26, .29, 0]]);
  parts.push([new THREE.SphereGeometry(.065, 8, 6), [.26, .29, 0]]);
  group.add(new THREE.Mesh(combine(parts), dark)); parts.forEach(([g]) => g.dispose());
  const tag = new THREE.Mesh(new THREE.BoxGeometry(.17, .25, .016), new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: .7 }));
  tag.position.set(.22, 1.14, -.263); tag.rotation.z = -.2; group.add(tag);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.9, .023, 4, 28), new THREE.MeshBasicMaterial({ color: 0xf6d775, transparent: true, opacity: .75, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .065; group.add(ring);
  const core = new THREE.Mesh(new THREE.CircleGeometry(.87, 24), new THREE.MeshBasicMaterial({ color: 0xffd778, transparent: true, opacity: .08, depthWrite: false }));
  core.rotation.x = -Math.PI / 2; core.position.y = .045; group.add(core);
  group.userData.ring = ring;
  return group;
}

export function createEffects(scene) {
  const limit = 300, markLimit = 220;
  const parts = Array.from({ length: limit }, () => ({ life: 0 }));
  const marks = Array.from({ length: markLimit }, () => ({ life: 0 }));
  let cursor = 0, markCursor = 0;
  const geometry = roundedBox(1, 1, 1, .08);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), limit);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 1;
  const tracks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .015, 1), new THREE.MeshBasicMaterial({ color: 0x344248, transparent: true, opacity: .16, depthWrite: false }), markLimit);
  tracks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tracks.frustumCulled = false;
  const dummy = new THREE.Object3D();
  dummy.scale.setScalar(0); dummy.updateMatrix();
  for (let i = 0; i < limit; i++) { mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(0xffffff)); }
  for (let i = 0; i < markLimit; i++) tracks.setMatrixAt(i, dummy.matrix);
  scene.add(mesh, tracks);
  const trailClocks = new Map();
  const color = new THREE.Color();
  function particle(x, y, z, tint, power = 1, kind = 'spark') {
    const p = parts[cursor];
    p.x = x; p.y = y; p.z = z;
    p.vx = (Math.random() - .5) * 5 * power; p.vz = (Math.random() - .5) * 5 * power;
    p.vy = (2 + Math.random() * 3) * power;
    p.life = p.maxLife = kind === 'confetti' ? 1.2 + Math.random() * 1.2 : .35 + Math.random() * .55;
    p.size = kind === 'confetti' ? .12 + Math.random() * .11 : .055 + Math.random() * .09;
    p.gravity = kind === 'confetti' ? 3 : 9;
    p.kind = kind; p.angle = Math.random() * TAU;
    mesh.setColorAt(cursor, color.set(tint));
    cursor = (cursor + 1) % limit;
  }
  function emit(event) {
    const x = event.x || 0, z = event.z || 0, y = Math.max(.6, event.y || 0);
    let count = 0, tint = 0xf5ce76, power = 1, kind = 'spark';
    if (event.type === 'pickup') { count = 12; power = .65; }
    if (event.type === 'delivery') { count = 65; tint = 0x9be8ca; power = 1.5; kind = 'confetti'; }
    if (event.type === 'collision') { count = 22; tint = 0xffae6d; power = .95; }
    if (event.type === 'drift') { count = 15; tint = 0x91e8e8; power = .6; }
    if (event.type === 'jump') { count = 8; tint = 0xffe8b3; power = .6; }
    if (event.type === 'land') { count = 12; tint = 0xddcdb7; power = .5; }
    if (event.type === 'finish') { count = 100; tint = 0x9be8ca; power = 1.7; kind = 'confetti'; }
    for (let i = 0; i < count; i++) particle(x + (Math.random() - .5), y + Math.random() * .6, z + (Math.random() - .5), kind === 'confetti' ? [tint, 0xffa477, 0xf4d77d, 0xfff3d9][i % 4] : tint, power, kind);
    if (count) mesh.instanceColor.needsUpdate = true;
  }
  function trail(player, dt = 1 / 60) {
    const id = player.id ?? 0;
    let elapsed = (trailClocks.get(id) || 0) + dt;
    if (elapsed < .035) { trailClocks.set(id, elapsed); return; }
    trailClocks.set(id, 0);
    if ((player.y || 0) > .12 || (player.speed || Math.hypot(player.vx || 0, player.vz || 0)) < 4) return;
    const angle = player.angle || 0, s = Math.sin(angle), c = Math.cos(angle);
    if (player.drifting) for (const side of [-1, 1]) {
      Object.assign(marks[markCursor], { x: player.x - s * .9 + c * .81 * side, z: player.z + c * .9 + s * .81 * side, angle, life: 3.2 });
      markCursor = (markCursor + 1) % markLimit;
    }
    if (player.boosting || player.turboTimer > 0 || player.drifting) {
      particle(player.x - s * 1.4, .35, player.z + c * 1.4, player.boosting || player.turboTimer > 0 ? 0xa6ece2 : 0xdcc8ab, .18);
      mesh.instanceColor.needsUpdate = true;
    }
  }
  function update(dt) {
    for (let i = 0; i < limit; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt; p.vy -= p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < .05) { p.y = .05; p.vy = Math.abs(p.vy) * .27; p.vx *= .94; p.vz *= .94; }
        const fade = Math.min(1, Math.max(0, p.life * 3));
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.angle + p.life * 3, p.life * 2, p.angle);
        dummy.scale.set(p.size * fade, p.size * fade * (p.kind === 'confetti' ? .12 : 1), p.size * fade);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < markLimit; i++) {
      const m = marks[i];
      if (m.life > 0) {
        m.life -= dt; dummy.position.set(m.x, .021, m.z); dummy.rotation.set(0, -m.angle, 0); dummy.scale.set(.13 * Math.max(0, Math.min(1, m.life)), 1, .48);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); tracks.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; tracks.instanceMatrix.needsUpdate = true;
  }
  return { emit, trail, update, dispose() { mesh.dispose(); tracks.dispose(); geometry.dispose(); mesh.material.dispose(); tracks.geometry.dispose(); tracks.material.dispose(); mesh.removeFromParent(); tracks.removeFromParent(); trailClocks.clear(); } };
}

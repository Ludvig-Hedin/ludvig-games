/**
 * Rounded, procedural expedition characters. No imports, images or external assets.
 *
 * const assets = createCreatureAssets(THREE);
 * const explorer = assets.makeExplorer();
 * scene.add(explorer.group);
 * explorer.animate(elapsedSeconds, normalizedMovementSpeed, alertAmount);
 *
 * Coordinates: +Y up, +Z forward. Every returned root is at ground / feet level.
 * animate() only changes an internal rig: callers own root position, rotation and
 * scale. Speed and extra are 0..1; a bear also accepts extra 1..2 for a lunge pose.
 * All animation smoothing uses elapsed seconds. Blinks use eye scale, not visibility,
 * so an external renderer can batch the individual meshes into instanced geometry.
 * Geometry and materials are shared by all instances created through this factory.
 */
export function createCreatureAssets(THREE) {
  const geometries = new Map();
  const materials = new Map();
  let instance = 0;

  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const sphere = () => {
    if (!geometries.has('sphere')) {
      geometries.set('sphere', new THREE.SphereGeometry(1, 24, 16));
    }
    return geometries.get('sphere');
  };

  // A shared unit cube with genuinely curved edges and continuous normals.
  // This avoids an addon dependency and keeps boots / equipment soft and tactile.
  function roundedBox() {
    if (geometries.has('roundedBox')) return geometries.get('roundedBox');
    const geometry = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const radius = 0.18;
    const inside = 0.5 - radius;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const cx = clamp(x, -inside, inside);
      const cy = clamp(y, -inside, inside);
      const cz = clamp(z, -inside, inside);
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const length = Math.hypot(dx, dy, dz) || 1;
      const nx = dx / length, ny = dy / length, nz = dz / length;
      positions.setXYZ(i, cx + nx * radius, cy + ny * radius, cz + nz * radius);
      normals.setXYZ(i, nx, ny, nz);
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometries.set('roundedBox', geometry);
    return geometry;
  }

  function material(name, color, roughness = 0.85, metalness = 0) {
    if (!materials.has(name)) {
      materials.set(name, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    }
    return materials.get(name);
  }

  const navy = material('navy', 0x243646);
  const rubber = material('rubber', 0x1d2c37, 0.98);
  const fleece = material('fleece', 0xf4e8d2, 1);
  const skin = material('skin', 0xeebc9c);
  const noseSkin = material('noseSkin', 0xdf967d);
  const glass = material('glass', 0x143748, 0.16, 0.32);
  const black = material('eyes', 0x142128, 0.16, 0.06);
  const white = material('white', 0xfaf5e8, 0.97);
  const penguinBlack = material('penguinBlack', 0x263442, 0.76);
  const penguinWhite = material('penguinWhite', 0xfff7de, 0.91);
  const penguinCheek = material('penguinCheek', 0xe2ab8c, 1);
  const orange = material('orange', 0xf5ad52, 0.75);
  const scarfGold = material('scarfGold', 0xe9b952, 1);
  const bearFur = material('bearFur', 0xf0efdf, 1);
  const bearMuzzle = material('bearMuzzle', 0xe8e1cb, 1);
  const ear = material('ear', 0xb5a99a, 0.95);
  const sealFur = material('sealFur', 0x92acb8, 0.77);
  const sealChest = material('sealChest', 0xb1c7cf, 0.91);
  const sealMuzzle = material('sealMuzzle', 0xd4e0db, 0.92);
  const sealFlipper = material('sealFlipper', 0x78929f, 0.86);
  const glint = new THREE.MeshBasicMaterial({ color: 0xc4f5ed });
  materials.set('glint', glint);

  function mesh(parent, mat, x, y, z, sx, sy, sz, box = false, shadow = true) {
    const m = new THREE.Mesh(box ? roundedBox() : sphere(), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  function pivot(parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  // A soft, short blink with an occasional double blink. Absolute time and each
  // character's existing phase offset prevent a colony from blinking in unison.
  // Compressing an eye to a small oval keeps its smile readable when it is shut.
  function blink(t, phase = 0) {
    const time = t + phase;
    const period = 5.37;
    const cycle = Math.floor(time / period);
    const u = time - cycle * period;
    const first = Math.exp(-Math.pow((u - 0.19) / 0.062, 2));
    const second = cycle % 3 === 1
      ? Math.exp(-Math.pow((u - 0.45) / 0.055, 2)) : 0;
    return 1 - 0.92 * Math.max(first, second);
  }

  // Analytical supports keep the lowest paw / boot on the local ground plane.
  // This is independent of the caller's root transform and does not inspect
  // vertices or allocate bounding boxes during animation.
  const contactMatrix = new THREE.Matrix4();
  function contact(rig, object, box = false) {
    const chain = [];
    for (let node = object; node !== rig; node = node.parent) chain.unshift(node);
    return { chain, box };
  }

  function ground(rig, contacts) {
    rig.updateMatrix();
    let lowest = Infinity;
    for (const surface of contacts) {
      contactMatrix.copy(rig.matrix);
      for (const node of surface.chain) {
        node.updateMatrix();
        contactMatrix.multiply(node.matrix);
      }
      const e = contactMatrix.elements;
      const nx = e[1], ny = e[5], nz = e[9];
      const norm = Math.hypot(nx, ny, nz);
      const support = surface.box
        ? 0.32 * (Math.abs(nx) + Math.abs(ny) + Math.abs(nz)) + 0.18 * norm
        : norm;
      lowest = Math.min(lowest, e[13] - support);
    }
    rig.position.y -= lowest;
    rig.updateMatrix();
  }

  function base(kind, height, radius) {
    const group = new THREE.Group();
    group.name = kind;
    group.userData.creature = kind;
    group.userData.height = height;
    group.userData.radius = radius;
    const rig = pivot(group);
    rig.name = `${kind}-rig`;
    const offset = instance++ * 2.399963229728653;
    let lastTime = null, gait = offset, movement = 0, alert = 0;

    function clock(time, speed, extra, cadence) {
      const t = Number.isFinite(time) ? time : 0;
      const dt = lastTime === null ? 0 : clamp(t - lastTime, 0, 0.1);
      lastTime = t;
      const target = clamp(Math.abs(Number(speed) || 0), 0, 1);
      const attention = clamp(Number(extra) || 0, 0, 1);
      const blend = 1 - Math.exp(-dt * 11);
      movement += (target - movement) * blend;
      alert += (attention - alert) * blend;
      // Integrating phase avoids foot pops when the requested speed changes.
      gait += dt * cadence * (0.48 + 0.52 * movement);
      return { t: t + offset, gait, movement, alert };
    }

    function finish(animate, controls = {}) {
      let count = 0;
      group.traverse(object => { if (object.isMesh) count++; });
      group.userData.meshCount = count;
      // Optional pose handles for the game controller. Non-enumerable references
      // do not get recursively copied by Three.js's userData JSON serializer.
      Object.defineProperty(group.userData, 'rig', {
        value: Object.freeze({ root: rig, ...controls }), enumerable: false,
      });
      return { group, animate };
    }
    return { group, rig, clock, finish };
  }

  function makeExplorer(color = 0xff7547) {
    const { rig, clock, finish } = base('explorer', 1.965, 0.44);
    const coatMaterial = material(`parka:${String(color)}`, color, 0.92);
    const torso = pivot(rig);

    mesh(torso, coatMaterial, 0, 0.98, 0, 0.45, 0.52, 0.31);
    mesh(torso, navy, 0, 0.51, 0, 0.83, 0.22, 0.56, true);
    mesh(torso, navy, 0, 1.015, 0.306, 0.023, 0.60, 0.018, true, false);
    mesh(torso, navy, 0, 1.375, 0.025, 0.327, 0.119, 0.265);
    mesh(torso, navy, 0, 1.02, -0.354, 0.56, 0.72, 0.31, true);
    for (const side of [-1, 1]) {
      const strap = mesh(torso, navy, side * 0.285, 1.12, 0.244, 0.072, 0.55, 0.043, true);
      strap.rotation.z = side * -0.105;
    }
    mesh(torso, fleece, 0.185, 1.16, 0.294, 0.115, 0.135, 0.024, true, false);

    // A short, two-joint scarf reads at the game's distant camera, without making
    // the explorer wider or introducing a simulated cloth dependency.
    mesh(torso, scarfGold, 0, 1.369, 0.255, 0.51, 0.105, 0.10, true);
    const scarf = pivot(torso, -0.302, 1.369, 0.112);
    mesh(scarf, scarfGold, 0, -0.137, -0.024, 0.127, 0.31, 0.053, true);
    const scarfTip = pivot(scarf, 0, -0.282, -0.024);
    mesh(scarfTip, scarfGold, 0, -0.082, 0, 0.115, 0.174, 0.051, true);

    const head = pivot(torso, 0, 1.51, 0);
    mesh(head, coatMaterial, 0, 0.09, 0, 0.385, 0.365, 0.335);
    mesh(head, fleece, 0, 0.075, 0.276, 0.303, 0.278, 0.119);
    mesh(head, skin, 0, 0.06, 0.361, 0.250, 0.231, 0.075);
    mesh(head, glass, 0, 0.141, 0.418, 0.257, 0.133, 0.070);
    const reflection = mesh(head, glint, -0.100, 0.175, 0.482, 0.082, 0.015, 0.006, false, false);
    reflection.rotation.z = -0.12;
    mesh(head, noseSkin, 0, -0.015, 0.439, 0.040, 0.033, 0.040);
    mesh(head, navy, 0, -0.088, 0.428, 0.034, 0.008, 0.006, false, false);

    const arms = [];
    const legs = [];
    const contacts = [];
    for (const side of [-1, 1]) {
      const arm = pivot(torso, side * 0.447, 1.185, 0.012);
      arm.rotation.z = side * 0.12;
      mesh(arm, coatMaterial, 0, -0.235, 0, 0.168, 0.30, 0.178);
      mesh(arm, navy, 0, -0.514, 0.025, 0.139, 0.143, 0.154);
      arms.push(arm);

      const leg = pivot(rig, side * 0.197, 0.52, 0);
      mesh(leg, navy, 0, -0.176, 0, 0.153, 0.272, 0.168);
      const boot = mesh(leg, rubber, 0, -0.42, 0.082, 0.33, 0.20, 0.47, true);
      contacts.push(contact(rig, boot, true));
      legs.push(leg);
    }

    ground(rig, contacts);

    return finish((time, speed = 0, extra = 0) => {
      const { t, gait, movement: m, alert: a } = clock(time, speed, extra, 10.9);
      const step = Math.sin(gait);
      torso.position.y = Math.abs(Math.cos(gait)) * 0.026 * m;
      torso.rotation.z = step * 0.028 * m;
      torso.rotation.x = 0.035 * m;
      head.rotation.y = Math.sin(t * 0.72) * 0.065 * (1 - 0.65 * m);
      head.rotation.x = -0.10 * a + Math.sin(t * 1.9) * 0.009;
      head.position.y = 1.51 + Math.sin(t * 2.3) * 0.005 * (1 - m);
      scarf.rotation.x = 0.11 + 0.74 * m + Math.sin(t * 4.3) * (0.09 + 0.08 * m);
      scarf.rotation.z = -0.14 + Math.sin(t * 2.9) * 0.07;
      scarfTip.rotation.x = 0.20 * m + Math.sin(t * 5.1 - 0.9) * (0.15 + 0.10 * m);
      scarfTip.rotation.z = Math.sin(t * 3.7) * 0.07;
      legs[0].rotation.x = step * 0.64 * m;
      legs[1].rotation.x = -step * 0.64 * m;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const swing = i === 0 ? -step : step;
        arms[i].rotation.x = swing * 0.52 * m - a * 0.13;
        arms[i].rotation.z = side * (0.12 + Math.sin(t * 2) * 0.015 + a * 0.09);
        legs[i].position.y = 0.52 + Math.abs(step) * 0.022 * m;
      }
      ground(rig, contacts);
    }, { torso, head, arms, legs, scarf, scarfTip });
  }

  function makePenguin() {
    const { rig, clock, finish } = base('penguin', 1.12, 0.30);
    const body = mesh(rig, penguinBlack, 0, 0.45, -0.017, 0.30, 0.41, 0.255);
    const belly = mesh(rig, penguinWhite, 0, 0.438, 0.158, 0.240, 0.343, 0.130);
    const head = pivot(rig, 0, 0.79, 0.005);
    mesh(head, penguinBlack, 0, 0.03, 0, 0.249, 0.24, 0.231);
    const eyes = [];
    for (const side of [-1, 1]) {
      mesh(head, penguinWhite, side * 0.109, 0.064, 0.185, 0.107, 0.139, 0.052);
      eyes.push(mesh(head, black, side * 0.104, 0.084, 0.237, 0.027, 0.036, 0.025, false, false));
      mesh(head, penguinCheek, side * 0.171, -0.003, 0.217, 0.035, 0.020, 0.014, false, false);
    }
    const tuft = mesh(head, penguinBlack, -0.022, 0.246, -0.011, 0.035, 0.076, 0.039);
    tuft.rotation.z = 0.35;
    mesh(head, orange, 0, -0.003, 0.291, 0.083, 0.044, 0.117);
    const tail = mesh(rig, penguinBlack, 0, 0.225, -0.252, 0.104, 0.118, 0.154);
    tail.rotation.x = -0.26;

    const flippers = [], feet = [], contacts = [];
    for (const side of [-1, 1]) {
      const flipper = pivot(rig, side * 0.277, 0.669, -0.01);
      mesh(flipper, penguinBlack, side * 0.046, -0.191, -0.01, 0.063, 0.243, 0.106);
      flipper.rotation.z = side * 0.15;
      flippers.push(flipper);
      const foot = pivot(rig, side * 0.126, 0.035, 0.083);
      const sole = mesh(foot, orange, 0, 0, 0, 0.113, 0.035, 0.173);
      contacts.push(contact(rig, sole));
      foot.rotation.y = side * 0.13;
      feet.push(foot);
    }

    ground(rig, contacts);

    return finish((time, speed = 0, extra = 0) => {
      const { t, gait, movement: m, alert: a } = clock(time, speed, extra, 12.7);
      const step = Math.sin(gait);
      rig.position.y = Math.abs(step) * 0.022 * m;
      rig.rotation.z = step * 0.115 * m;
      rig.rotation.x = 0.085 * m - 0.05 * a;
      const breath = Math.sin(t * 2.8) * 0.012 * (1 - m);
      body.scale.y = 0.41 * (1 + breath);
      belly.scale.y = 0.343 * (1 + breath);
      head.rotation.y = Math.sin(t * 0.85) * 0.13 * (1 - 0.7 * m);
      head.rotation.x = -0.17 * a + Math.sin(t * 1.6) * 0.016;
      head.rotation.z = Math.sin(t * 0.69) * 0.035 * (1 - m) - step * 0.025 * m;
      const eyeOpen = blink(t, 1.61);
      for (const eye of eyes) eye.scale.y = 0.036 * eyeOpen;
      tail.rotation.y = Math.sin(t * 3.1) * (0.10 + 0.12 * m + 0.20 * a);
      tail.rotation.x = -0.26 + Math.sin(t * 2.8) * 0.065 * (1 - 0.5 * m);
      tuft.rotation.z = 0.35 + Math.sin(t * 4.6) * (0.04 + 0.06 * m);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const stride = step * -side;
        feet[i].position.y = 0.035 + Math.max(0, stride) * 0.062 * m - rig.position.y;
        feet[i].position.z = 0.083 + stride * 0.065 * m;
        feet[i].rotation.x = -stride * 0.21 * m;
        flippers[i].rotation.z = side * (0.15 + m * 0.18 + a * 0.63 + Math.sin(gait + i) * (0.055 + 0.09 * m));
        flippers[i].rotation.x = stride * 0.20 * m;
      }
      ground(rig, contacts);
    }, { head, eyes, flippers, feet, tail, tuft });
  }

  function makePolarBear() {
    const { rig, clock, finish } = base('polar-bear', 1.785, 0.67);
    const body = mesh(rig, bearFur, 0, 1.065, -0.145, 0.641, 0.667, 1.125);
    mesh(rig, bearFur, 0, 1.185, 0.574, 0.565, 0.597, 0.648);
    const head = pivot(rig, 0, 1.267, 0.939);
    mesh(head, bearFur, 0, 0.044, 0.230, 0.45, 0.399, 0.514);
    mesh(head, bearMuzzle, 0, -0.068, 0.635, 0.30, 0.219, 0.357);
    mesh(head, black, 0, -0.011, 0.945, 0.179, 0.111, 0.099);
    const eyes = [], ears = [], brows = [];
    for (const side of [-1, 1]) {
      const earPivot = pivot(head, side * 0.316, 0.344, 0.061);
      mesh(earPivot, bearFur, 0, 0, 0, 0.14, 0.167, 0.100);
      mesh(earPivot, ear, 0, 0, 0.087, 0.078, 0.095, 0.021, false, false);
      ears.push(earPivot);
      eyes.push(mesh(head, black, side * 0.303, 0.156, 0.599, 0.052, 0.056, 0.041, false, false));
      brows.push(mesh(head, bearMuzzle, side * 0.300, 0.232, 0.576, 0.070, 0.023, 0.034, false, false));
    }
    const tail = mesh(rig, bearFur, 0, 1.05, -1.264, 0.172, 0.158, 0.215);

    const legs = [], contacts = [];
    for (const front of [true, false]) {
      for (const side of [-1, 1]) {
        const leg = pivot(rig, side * (front ? 0.397 : 0.427), 1.12, front ? 0.633 : -0.816);
        mesh(leg, bearFur, 0, -0.406, 0, front ? 0.212 : 0.244, 0.576, 0.254);
        const paw = mesh(leg, bearFur, 0, -0.981, 0.090, 0.239, 0.139, 0.331);
        contacts.push(contact(rig, paw));
        if (front) {
          const pad = mesh(leg, ear, 0, -1.096, 0.090, 0.151, 0.014, 0.228, false, false);
          contacts.push(contact(rig, pad));
        }
        legs.push({ pivot: leg, phase: (front ? side : -side), front });
      }
    }

    ground(rig, contacts);

    return finish((time, speed = 0, extra = 0) => {
      const { t, gait, movement: m, alert: a } = clock(time, speed, extra, 7.0);
      const step = Math.sin(gait);
      // Optional 1..2 input lets gameplay telegraph a charge. It affects only the
      // internal pose: the controller retains full ownership of movement / hits.
      const lunge = clamp((Number(extra) || 0) - 1, 0, 1);
      rig.position.y = m * (0.031 + Math.abs(Math.cos(gait)) * 0.021);
      rig.rotation.z = step * 0.020 * m;
      rig.rotation.x = lunge * 0.07;
      body.scale.y = 0.667 * (1 + Math.sin(t * 1.8) * 0.009 * (1 - m));
      head.rotation.y = Math.sin(t * 0.67) * 0.095 * (1 - 0.65 * m);
      head.rotation.x = 0.018 + Math.sin(gait + 0.5) * 0.034 * m - a * 0.18 + lunge * 0.26;
      head.rotation.z = Math.sin(t * 0.56) * 0.018 * (1 - m);
      head.position.y = 1.267 + Math.sin(t * 2.1) * 0.007 * (1 - m) - lunge * 0.048;
      const eyeOpen = blink(t, 3.12);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        eyes[i].scale.y = 0.056 * eyeOpen * (1 - 0.12 * a);
        ears[i].rotation.z = side * (0.025 + 0.14 * a - 0.28 * lunge);
        ears[i].rotation.x = Math.sin(t * 1.37 + i) * 0.035 + 0.08 * a;
        brows[i].rotation.z = side * (-0.05 + 0.15 * a + 0.06 * lunge);
        brows[i].position.y = 0.232 + 0.014 * a;
      }
      tail.rotation.y = Math.sin(t * (1.8 + 1.1 * a)) * (0.20 + 0.08 * a);
      for (const leg of legs) {
        const stride = step * leg.phase;
        leg.pivot.rotation.x = stride * 0.39 * m - (leg.front ? 0.31 : -0.14) * lunge;
        leg.pivot.position.y = 1.12 + Math.max(0, stride) * 0.042 * m;
      }
      ground(rig, contacts);
    }, { head, eyes, ears, brows, legs, tail });
  }

  function whiskers() {
    if (!geometries.has('whiskers')) {
      const vertices = [];
      for (const side of [-1, 1]) {
        for (let row = -1; row <= 1; row++) {
          vertices.push(side * 0.125, row * 0.023, 0,
            side * (0.339 - Math.abs(row) * 0.018), row * 0.057, -0.045);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometries.set('whiskers', geometry);
    }
    if (!materials.has('whiskers')) {
      materials.set('whiskers', new THREE.LineBasicMaterial({ color: 0x526975, transparent: true, opacity: 0.7 }));
    }
    return new THREE.LineSegments(geometries.get('whiskers'), materials.get('whiskers'));
  }

  function makeSeal() {
    const { rig, clock, finish } = base('seal', 0.935, 0.50);
    const body = mesh(rig, sealFur, 0, 0.415, -0.189, 0.502, 0.408, 0.870);
    const contacts = [contact(rig, body)];
    mesh(rig, sealChest, 0, 0.434, 0.343, 0.401, 0.389, 0.505);
    const head = pivot(rig, 0, 0.628, 0.713);
    mesh(head, sealFur, 0, 0.02, 0.065, 0.337, 0.287, 0.355);
    const eyes = [];
    for (const side of [-1, 1]) {
      mesh(head, sealMuzzle, side * 0.095, -0.041, 0.324, 0.176, 0.142, 0.154);
      eyes.push(mesh(head, black, side * 0.197, 0.115, 0.306, 0.035, 0.043, 0.027, false, false));
    }
    mesh(head, black, 0, 0.028, 0.452, 0.094, 0.057, 0.051);
    const whiskerLines = whiskers();
    whiskerLines.position.set(0, -0.048, 0.466);
    head.add(whiskerLines);

    const flippers = [];
    for (const side of [-1, 1]) {
      const flipper = pivot(rig, side * 0.386, 0.133, 0.335);
      const paddle = mesh(flipper, sealFlipper, side * 0.129, -0.045, -0.029, 0.272, 0.075, 0.175);
      contacts.push(contact(rig, paddle));
      flipper.rotation.y = side * -0.34;
      flippers.push(flipper);
    }
    const tail = pivot(rig, 0, 0.111, -0.948);
    for (const side of [-1, 1]) {
      const fin = mesh(tail, sealFlipper, side * 0.151, 0, -0.162, 0.177, 0.055, 0.306);
      fin.rotation.y = side * -0.30;
      contacts.push(contact(rig, fin));
    }

    ground(rig, contacts);

    return finish((time, speed = 0, extra = 0) => {
      const { t, gait, movement: m, alert: a } = clock(time, speed, extra, 8.4);
      const wave = Math.sin(gait);
      rig.position.y = (1 + wave) * 0.012 * m;
      rig.rotation.z = Math.sin(gait + 0.5) * 0.026 * m;
      body.scale.y = 0.408 * (1 + Math.sin(t * 2.0) * 0.012 * (1 - m));
      body.scale.z = 0.870 * (1 + wave * 0.033 * m);
      head.rotation.y = Math.sin(t * 0.71) * 0.16 * (1 - 0.45 * m);
      head.rotation.x = -0.20 * a + Math.sin(gait + 0.7) * 0.048 * m;
      head.rotation.z = Math.sin(t * 0.94) * 0.038 * (1 - m);
      const eyeOpen = blink(t, 0.73);
      for (const eye of eyes) eye.scale.y = 0.043 * eyeOpen;
      whiskerLines.rotation.z = Math.sin(t * 3.1) * (0.016 + 0.024 * a);
      whiskerLines.scale.x = 1 + Math.sin(t * 4.0) * (0.017 + 0.025 * a);
      tail.rotation.x = -0.07 + wave * 0.18 * m - a * 0.19;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        flippers[i].rotation.y = side * (-0.34 + Math.sin(gait + 0.45) * 0.48 * m);
        flippers[i].rotation.z = side * (-0.03 - Math.max(0, wave) * 0.10 * m - a * 0.10);
      }
      ground(rig, contacts);
    }, { head, eyes, tail, flippers, whiskers: whiskerLines });
  }

  // Call only after removing every creature using this asset factory.
  function dispose() {
    for (const geometry of geometries.values()) geometry.dispose();
    for (const mat of materials.values()) mat.dispose();
    geometries.clear();
    materials.clear();
  }

  return { makeExplorer, makePenguin, makePolarBear, makeSeal, dispose };
}

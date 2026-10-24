import * as THREE from './vendor/three.module.min.js';
import { makeHorse } from './horse3d.js';
import { seededRandom } from './runner-model.js';

const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (n, span) => ((n % span) + span) % span;
function followingSample(history, state) {
  if (state.phase === 'countdown') history.length = 0;
  if (!history.length || state.distance > history[history.length - 1].distance + .00001) history.push({ distance: state.distance, x: state.x, y: state.y });
  while (history.length > 2 && history[1].distance < state.distance - 8) history.shift();
  const target = state.distance - 2.6;
  for (let i = 1; i < history.length; i++) if (history[i].distance >= target) {
    const a = history[i - 1], b = history[i], t = Math.max(0, Math.min(1, (target - a.distance) / Math.max(.00001, b.distance - a.distance)));
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }
  return history[0] || state;
}

export function makeRunnerScene(canvas, horse, objects) {
  let renderer;
  try {
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!context) return makeCanvasScene(canvas, horse, objects);
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (_) { return makeCanvasScene(canvas, horse, objects); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#d7c1b4'); scene.fog = new THREE.Fog('#e4c5ac', 35, 145);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 400);
  const sun = new THREE.DirectionalLight('#ffddb0', 3.1); sun.position.set(-18, 28, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -19; sun.shadow.camera.right = 19; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -17; sun.shadow.camera.near = 1; sun.shadow.camera.far = 65; sun.shadow.bias = -.0003; sun.shadow.normalBias = .035;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, -10); scene.add(sun, sun.target, new THREE.HemisphereLight('#e6f0ff', '#7b8051', 2.05));
  const rim = new THREE.DirectionalLight('#f2bca3', .65); rim.position.set(15, 8, 12); scene.add(rim);
  const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const materials = { earth: standard('#b3b77b'), sand: standard('#d8bf96'), rut: standard('#cdb288'), grass: standard('#929d62'), fence: standard('#e8dfc5'), wood: standard('#885938'), bark: standard('#6e6445'), leaf: standard('#879768'), hill: standard('#9fa589'), barn: standard('#a47462'), roof: standard('#615e5d'), flower: standard('#dfb6c4'), gold: standard('#f6d899') };
  function mesh(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
  }
  // A clean gradient sky, with a broad sun and layered hills instead of a flat horizon.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(290, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#7898b3') }, bottom: { value: new THREE.Color('#f4cdab') } },
    vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bottom;varying vec3 p;void main(){float h=clamp(normalize(p).y*.9+.06,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' })); scene.add(sky);
  mesh(new THREE.SphereGeometry(8, 32, 16), new THREE.MeshBasicMaterial({ color: '#fff0cb', fog: false }), -48, 34, -180, false);
  mesh(new THREE.PlaneGeometry(420, 360), materials.earth, 0, -.075, -100, false).rotation.x = -Math.PI / 2;
  mesh(new THREE.BoxGeometry(10.65, .075, 180), materials.sand, 0, -.026, -65, false);
  for (const x of [-3, 0, 3]) mesh(new THREE.BoxGeometry(1.1, .004, 180), materials.rut, x, .014, -65, false);
  const random = seededRandom('sunset-ranch-art-8');
  const hillGeometry = new THREE.SphereGeometry(1, 36, 20);
  for (let i = 0; i < 13; i++) {
    const hill = mesh(hillGeometry, i % 2 ? materials.hill : standard('#aeb39c'), (i - 6) * 26, -4.5, -145 - (i % 3) * 17, false); hill.scale.set(28 + random() * 12, 18 + random() * 17, 30 + random() * 15);
  }
  const moving = [], temp = new THREE.Object3D();
  function batch(geometry, material, entries, span = 145) {
    const m = new THREE.InstancedMesh(geometry, material, entries.length); m.castShadow = material !== materials.flower && material !== materials.rut; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m);
    moving.push({ m, entries, span }); return m;
  }
  const fencePosts = [], fenceRails = [], flowers = [], grass = [], pebbles = [], trunks = [], crowns = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 42; i++) fencePosts.push({ x: side * 5.95, y: .64, z: i * 3.5, sx: 1, sy: 1, sz: 1 });
    for (let i = 0; i < 21; i++) for (const y of [.49, .99]) fenceRails.push({ x: side * 5.95, y, z: i * 7 + 3.5, sx: 1, sy: 1, sz: 1 });
    for (let i = 0; i < 34; i++) {
      const x = side * (8 + random() * 28), z = i * 4.3 + random() * 3, h = 1.7 + random() * 3;
      trunks.push({ x, y: h * .5, z, sx: .16 + random() * .12, sy: h, sz: .16 + random() * .12 });
      for (let j = 0; j < 3; j++) crowns.push({ x: x + (random() - .5) * 1.2, y: h + j * .58, z: z + (random() - .5) * 1.1, sx: 1.5 + random() * .75, sy: 1.05 + random(), sz: 1.5 + random() * .75, shade: random() });
    }
    for (let i = 0; i < 160; i++) {
      const x = side * (5.4 + random() * 5), z = random() * 145, h = .12 + random() * .3;
      grass.push({ x, y: h * .5, z, sx: .14 + random() * .12, sy: h, sz: .14, ry: random() * 6.3 });
      if (i % 2 === 0) flowers.push({ x: x + .13, y: h + .06, z: z + .06, sx: .08, sy: .055, sz: .08, shade: random() });
    }
    for (let i = 0; i < 140; i++) pebbles.push({ x: (random() - .5) * 10.3, y: .024, z: random() * 145, sx: .02 + random() * .04, sy: .014, sz: .03 + random() * .04 });
  }
  batch(new THREE.BoxGeometry(.13, 1.28, .13), materials.fence, fencePosts, 147);
  batch(new THREE.BoxGeometry(.085, .11, 7.02), materials.fence, fenceRails, 147);
  batch(new THREE.CylinderGeometry(.8, 1, 1, 7), materials.bark, trunks);
  const canopy = batch(new THREE.SphereGeometry(1, 12, 9), materials.leaf, crowns);
  crowns.forEach((e, i) => canopy.setColorAt(i, new THREE.Color().setHSL(.18 + e.shade * .06, .23, .53 + e.shade * .12)));
  batch(new THREE.ConeGeometry(1, 1, 4), materials.grass, grass);
  const blooms = batch(new THREE.SphereGeometry(1, 5, 4), materials.flower, flowers);
  flowers.forEach((e, i) => blooms.setColorAt(i, new THREE.Color(e.shade < .4 ? '#f9dfbd' : e.shade < .75 ? '#d8b3cf' : '#e6b4a7')));
  batch(new THREE.SphereGeometry(1, 5, 4), materials.rut, pebbles);
  // The destination ranch sits beyond the play lane, framed by two orchards.
  const barn = new THREE.Group(); barn.position.set(19, 0, -95); scene.add(barn);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 4.6, 10), materials.barn); wall.position.y = 2.3; wall.castShadow = true; wall.receiveShadow = true; barn.add(wall);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-4.15, 0); roofShape.lineTo(0, 3); roofShape.lineTo(4.15, 0); roofShape.closePath();
  const roofMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 11, bevelEnabled: false }), materials.roof); roofMesh.position.set(0, 4.52, -5.5); roofMesh.castShadow = true; barn.add(roofMesh);
  for (const x of [-1.1, 1.1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(2.05, 3.1, .08), materials.wood); door.position.set(x, 1.55, 5.06); barn.add(door); }
  for (const x of [-2.2, 0, 2.2]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(.12, 3.3, .1), materials.fence); trim.position.set(x, 1.65, 5.12); barn.add(trim); }
  const loft = new THREE.Mesh(new THREE.CircleGeometry(.65, 20), materials.fence); loft.position.set(0, 5.3, 5.03); barn.add(loft);
  const heartShape = new THREE.Shape(); heartShape.moveTo(0, -.45); heartShape.bezierCurveTo(-.12, -.33, -.65, .02, -.5, .32); heartShape.bezierCurveTo(-.38, .58, -.1, .52, 0, .33); heartShape.bezierCurveTo(.1, .52, .38, .58, .5, .32); heartShape.bezierCurveTo(.65, .02, .12, -.33, 0, -.45);
  const heartGeometry = new THREE.ExtrudeGeometry(heartShape, { depth: .18, steps: 1, bevelEnabled: true, bevelSegments: 3, bevelSize: .055, bevelThickness: .06, curveSegments: 12 }); heartGeometry.translate(0, 0, -.09);
  const heartMat = standard('#ef7792', { metalness: .18, roughness: .28, emissive: '#8f173d', emissiveIntensity: .16 });
  const logGeometry = new THREE.CylinderGeometry(.29, .34, 2.08, 18), logMat = standard('#927051'), endGeometry = new THREE.CylinderGeometry(.268, .268, .012, 18), endMat = standard('#d1a77a');
  const ringGeometry = new THREE.TorusGeometry(.175, .009, 4, 24), ringMat = standard('#9b7755');
  const objectViews = new Map();
  for (const object of objects) {
    const view = new THREE.Group(); scene.add(view);
    if (object.type === 'heart') {
      const heartMesh = new THREE.Mesh(heartGeometry, heartMat); heartMesh.castShadow = true; view.add(heartMesh); view.position.y = 1.55;
    } else {
      const log = new THREE.Mesh(logGeometry, logMat); log.rotation.z = Math.PI / 2; log.castShadow = true; log.receiveShadow = true; view.add(log); view.position.y = .32;
      for (const side of [-1, 1]) {
        const end = new THREE.Mesh(endGeometry, endMat); end.rotation.z = Math.PI / 2; end.position.x = side * 1.045; view.add(end);
        const ring = new THREE.Mesh(ringGeometry, ringMat); ring.rotation.y = Math.PI / 2; ring.position.x = side * 1.057; view.add(ring);
      }
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, .36, 7), logMat); twig.position.set(.3, .22, .03); twig.rotation.z = -.75; twig.castShadow = true; view.add(twig);
    }
    objectViews.set(object.id, view);
  }
  const player = makeHorse({ color: '#c98d57', mane: '#f0d9ab', accent: '#d96563', blanket: true });
  const companion = makeHorse({ color: typeof horse.color === 'string' ? horse.color : '#ada9a4', mane: typeof horse.mane === 'string' ? horse.mane : '#544650', accent: '#c47d91', scale: .83 });
  scene.add(player.root, companion.root);
  const marker = mesh(new THREE.RingGeometry(.56, .63, 48), new THREE.MeshBasicMaterial({ color: '#d0fff1', transparent: true, opacity: .7, depthWrite: false }), 0, .028, 0, false); marker.rotation.x = -Math.PI / 2; marker.scale.set(1, 1.5, 1);
  const shadowTexture = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30); g.addColorStop(0, 'rgba(46,38,31,.36)'); g.addColorStop(1, 'rgba(46,38,31,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function contactShadow() { const m = mesh(new THREE.PlaneGeometry(2.2, 3.5), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }), 0, .027, 0, false); m.rotation.x = -Math.PI / 2; return m; }
  const shadow = contactShadow(), partnerShadow = contactShadow(); partnerShadow.scale.setScalar(.8);
  const particles = [], particleGeometry = new THREE.IcosahedronGeometry(.055, 0), particleMat = new THREE.MeshBasicMaterial({ color: '#ffe4a5' });
  const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMat, 120); particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); particleMesh.frustumCulled = false; scene.add(particleMesh);
  for (let i = 0; i < 120; i++) { temp.scale.setScalar(0); temp.updateMatrix(); particleMesh.setMatrixAt(i, temp.matrix); }
  const followingHistory = [];
  let clock = 0, previousX = 0, companionX = .93, companionY = 0, hitLife = 0, renderWidth = 0, renderHeight = 0, disposed = false;
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect(), w = Math.max(200, Math.round(rect.width || 800)), h = Math.max(240, Math.round(rect.height || 570));
    if (w !== renderWidth || h !== renderHeight) { renderWidth = w; renderHeight = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < .85 ? 64 : 48; camera.updateProjectionMatrix(); }
  }
  function event(e) {
    if (e.type === 'hit') hitLife = .5;
    if (e.type === 'collect') for (let i = 0; i < 8; i++) {
      if (particles.length >= 120) particles.shift();
      const angle = random() * Math.PI * 2, velocity = 1 + random() * 1.9;
      particles.push({ x: e.x, y: e.y, z: e.z, vx: Math.cos(angle) * velocity, vy: 1.8 + random() * 2, vz: Math.sin(angle) * velocity, life: .55 + random() * .25 });
    }
  }
  function render(state, dt = 0) {
    if (disposed) return; resize();
    const activeDt = state.phase === 'paused' ? 0 : Math.min(dt, .05); clock += activeDt; hitLife = Math.max(0, hitLife - activeDt);
    const turn = Math.max(-1, Math.min(1, (state.x - previousX) * 3)); previousX = state.x;
    player.root.position.set(state.x, state.y, 0); player.animate({ time: clock, speed: state.speed, airborne: state.airborne, jump: state.y, turn, idle: state.phase === 'countdown', hit: hitLife });
    // The partner follows behind, entirely within the player's lane; it never acts as a phantom collider.
    const follow = followingSample(followingHistory, state); companionX = lerp(companionX, state.x + .89, 1 - Math.exp(-activeDt * 13)); companionY = follow.y;
    companion.root.position.set(companionX, companionY, 2.6); companion.animate({ time: clock + .17, speed: state.speed, airborne: companionY > .04, jump: companionY, turn, idle: state.phase === 'countdown' });
    marker.position.x = state.x; marker.material.opacity = .48 + .08 * Math.sin(clock * 3);
    shadow.position.x = state.x; shadow.material.opacity = Math.max(.25, 1 - state.y * .35); shadow.scale.setScalar(1 + state.y * .1);
    partnerShadow.position.set(companionX, .027, 2.6); partnerShadow.material.opacity = Math.max(.25, 1 - companionY * .35);
    for (const { m, entries, span } of moving) {
      for (let i = 0; i < entries.length; i++) { const e = entries[i]; temp.position.set(e.x, e.y, 15 - wrap(e.z - state.distance, span)); temp.rotation.set(0, e.ry || 0, 0); temp.scale.set(e.sx, e.sy, e.sz); temp.updateMatrix(); m.setMatrixAt(i, temp.matrix); }
      m.instanceMatrix.needsUpdate = true;
    }
    for (const object of objects) {
      const view = objectViews.get(object.id), gap = object.distance - state.distance;
      view.visible = gap > -9 && gap < 95 && !object.collected;
      if (!view.visible) continue;
      view.position.x = object.x; view.position.z = -gap;
      if (object.type === 'heart') { view.position.y = 1.58 + .1 * Math.sin(clock * 3.2 + object.time); view.rotation.y = Math.sin(clock * 1.7 + object.time) * .45; view.rotation.z = Math.sin(clock * 2 + object.time) * .07; }
    }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= activeDt; if (p.life <= 0) { particles.splice(i, 1); continue; } p.x += p.vx * activeDt; p.y += p.vy * activeDt; p.z += (p.vz + state.speed * .3) * activeDt; p.vy -= activeDt * 7; }
    for (let i = 0; i < 120; i++) { const p = particles[i]; if (p) { temp.position.set(p.x, p.y, p.z); temp.rotation.set(clock, clock * 2, i); temp.scale.setScalar(Math.min(1, p.life * 3)); } else temp.scale.setScalar(0); temp.updateMatrix(); particleMesh.setMatrixAt(i, temp.matrix); }
    particleMesh.instanceMatrix.needsUpdate = true;
    const portrait = camera.aspect < .85, targetCameraX = portrait ? state.x * .85 : state.x * .2 + 1.65;
    camera.position.set(portrait ? targetCameraX : lerp(camera.position.x || targetCameraX, targetCameraX, 1 - Math.exp(-Math.max(activeDt, .016) * 4)), portrait ? 6.35 : 5.65, portrait ? 12.7 : 11.3);
    camera.lookAt(state.x * (portrait ? .85 : .12), .9, -12);
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), mats = new Set(), textures = new Set();
    scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) geometries.add(o.geometry); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m); });
    for (const m of mats) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
    for (const g of geometries) g.dispose(); for (const t of textures) t.dispose();
    sun.shadow.map?.dispose(); renderer.renderLists.dispose(); renderer.dispose(); scene.clear(); particles.length = 0;
    // Keep the context reusable: forceContextLoss would poison the next date on this same canvas.
  }
  resize();
  return { render, resize, event, dispose };
}

/** CPU renderer for browsers without WebGL. It projects the same articulated rig and world units. */
function makeCanvasScene(canvas, horse, objects) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('The trail could not start. Please reopen the game in a recent browser.');
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 400);
  const player = makeHorse({ color: '#c98d57', mane: '#f0d9ab', accent: '#d96563', blanket: true });
  const companion = makeHorse({ color: typeof horse.color === 'string' ? horse.color : '#ada9a4', mane: typeof horse.mane === 'string' ? horse.mane : '#544650', accent: '#c47d91', scale: .83 });
  const random = seededRandom('ranch-canvas-art-7'), trees = [], flowers = [], particles = [], colorCache = new WeakMap();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) trees.push({ x: side * (8.4 + random() * 20), z: i * 4.9 + random() * 4, h: 2.9 + random() * 2.5, r: 1.5 + random(), p: random() });
    for (let i = 0; i < 160; i++) flowers.push({ x: side * (5.4 + random() * 5), z: random() * 147, h: .18 + random() * .24, p: random() });
  }
  const rgb = hex => { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const tone = (c, f, add = 0) => `rgb(${c.map(n => Math.max(0, Math.min(255, Math.round(n * f + add)))).join(',')})`;
  function palette(material) {
    if (!colorCache.has(material)) {
      const c = rgb('#' + material.color.getHexString());
      colorCache.set(material, { base: tone(c, 1), light: tone(c, .95, 27), shade: tone(c, .7), edge: tone(c, .57) });
    }
    return colorCache.get(material);
  }
  const followingHistory = [];
  let width = 800, height = 570, dpr = 1, focal = 640, clock = 0, previousX = 0, companionX = .89, companionY = 0, hitLife = 0, disposed = false;
  function resize() {
    const r = canvas.getBoundingClientRect(), w = Math.max(200, Math.round(r.width || 800)), h = Math.max(240, Math.round(r.height || 570));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== width || h !== height || ratio !== dpr || canvas.width !== Math.round(w * ratio)) { width = w; height = h; dpr = ratio; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    camera.aspect = width / height; camera.fov = camera.aspect < .85 ? 64 : 48; camera.updateProjectionMatrix(); focal = height / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z), m = camera.matrixWorldInverse.elements;
    const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]); v.project(camera);
    return { x: (v.x * .5 + .5) * width, y: (-v.y * .5 + .5) * height, depth, scale: focal / Math.max(.1, depth) };
  }
  function path(points, fill, stroke, lineWidth = 1) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function line(a, b, color, size) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.stroke(); }
  function groundEllipse(x, z, rx, rz, opacity = .24) {
    const p = project(x, .012, z), a = project(x + rx, .012, z), b = project(x, .012, z + rz);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(Math.abs(a.x - p.x), Math.max(1, Math.abs(b.y - p.y)));
    const gradient = ctx.createRadialGradient(0, 0, .1, 0, 0, 1); gradient.addColorStop(0, `rgba(64,53,41,${opacity})`); gradient.addColorStop(1, 'rgba(64,53,41,0)'); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawEllipsoid(mesh) {
    const m = mesh.matrixWorld, p = new THREE.Vector3().setFromMatrixPosition(m), center = project(p.x, p.y, p.z);
    if (center.depth < .2) return;
    const radius = mesh.geometry.parameters.radius || 1, basis = [];
    for (const axis of [[radius, 0, 0], [0, radius, 0], [0, 0, radius]]) { const v = new THREE.Vector3(...axis).applyMatrix4(m), s = project(v.x, v.y, v.z); basis.push([s.x - center.x, s.y - center.y]); }
    const a = basis.reduce((s, v) => s + v[0] ** 2, 0), b = basis.reduce((s, v) => s + v[1] ** 2, 0), c = basis.reduce((s, v) => s + v[0] * v[1], 0);
    const discriminant = Math.sqrt((a - b) ** 2 + 4 * c * c), rx = Math.sqrt(Math.max(.04, (a + b + discriminant) / 2)), ry = Math.sqrt(Math.max(.04, (a + b - discriminant) / 2));
    const paletteColor = palette(mesh.material);
    ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(.5 * Math.atan2(2 * c, a - b)); ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(-.36, -.42, .05, .1, .18, 1.32); gradient.addColorStop(0, paletteColor.light); gradient.addColorStop(.47, paletteColor.base); gradient.addColorStop(1, paletteColor.shade);
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawCylinder(mesh) {
    const params = mesh.geometry.parameters, m = mesh.matrixWorld, va = new THREE.Vector3(0, -params.height / 2, 0).applyMatrix4(m), vb = new THREE.Vector3(0, params.height / 2, 0).applyMatrix4(m), vc = new THREE.Vector3(0, 0, 0).applyMatrix4(m), vr = new THREE.Vector3(Math.max(params.radiusBottom, params.radiusTop), 0, 0).applyMatrix4(m);
    const a = project(va.x, va.y, va.z), b = project(vb.x, vb.y, vb.z), center = project(vc.x, vc.y, vc.z), radial = project(vr.x, vr.y, vr.z), w = Math.max(1, Math.hypot(radial.x - center.x, radial.y - center.y) * 2), p = palette(mesh.material);
    line(a, b, p.shade, w + .6); line({ x: a.x - w * .12, y: a.y }, { x: b.x - w * .12, y: b.y }, p.base, w * .82);
  }
  function drawTorus(mesh) {
    const params = mesh.geometry.parameters, points = [];
    for (let i = 0; i <= 28; i++) { const angle = i / 28 * Math.PI * 2, p = new THREE.Vector3(Math.cos(angle) * params.radius, Math.sin(angle) * params.radius, 0).applyMatrix4(mesh.matrixWorld); points.push(project(p.x, p.y, p.z)); }
    path(points, null, palette(mesh.material).base, Math.max(1, points[0].scale * params.tube * 1.7));
  }
  function heart(x, y, z, time) {
    const p = project(x, y, z), size = p.scale * .49, rotation = Math.sin(clock * 2 + time) * .07;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rotation); ctx.scale(size, size);
    const glow = ctx.createRadialGradient(0, 0, .2, 0, 0, 1.8); glow.addColorStop(0, 'rgba(255,219,163,.35)'); glow.addColorStop(1, 'rgba(255,219,163,0)'); ctx.fillStyle = glow; ctx.fillRect(-1.8, -1.8, 3.6, 3.6);
    ctx.beginPath(); ctx.moveTo(0, .91); ctx.bezierCurveTo(-.35, .63, -1.23, -.02, -.94, -.57); ctx.bezierCurveTo(-.72, -1.02, -.16, -.95, 0, -.59); ctx.bezierCurveTo(.16, -.95, .72, -1.02, .94, -.57); ctx.bezierCurveTo(1.23, -.02, .35, .63, 0, .91);
    const gradient = ctx.createLinearGradient(-.6, -.8, .7, .8); gradient.addColorStop(0, '#ffb5ba'); gradient.addColorStop(.4, '#f48393'); gradient.addColorStop(1, '#bd4d68'); ctx.fillStyle = gradient; ctx.fill(); ctx.lineWidth = .06; ctx.strokeStyle = 'rgba(255,230,202,.85)'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-.43, -.48, .17, .1, -.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,242,220,.8)'; ctx.fill(); ctx.restore();
  }
  function drawLog(object, gap) {
    const z = -gap, a = project(object.x - 1.04, .32, z), b = project(object.x + 1.04, .32, z), p = project(object.x, .32, z), radius = p.scale * .31;
    groundEllipse(object.x, z, 1.32, .65, .19);
    const gradient = ctx.createLinearGradient(p.x, p.y - radius, p.x, p.y + radius); gradient.addColorStop(0, '#b8956a'); gradient.addColorStop(.35, '#8c6747'); gradient.addColorStop(1, '#5e4635');
    line(a, b, '#594837', radius * 2 + 1.4); line(a, b, gradient, radius * 2);
    for (const end of [a, b]) { ctx.beginPath(); ctx.ellipse(end.x, end.y, radius * .34, radius, .03, 0, Math.PI * 2); ctx.fillStyle = '#c9a579'; ctx.fill(); ctx.strokeStyle = '#795b40'; ctx.lineWidth = Math.max(.5, radius * .055); ctx.stroke(); for (const r of [.35, .68]) { ctx.beginPath(); ctx.ellipse(end.x, end.y, radius * .34 * r, radius * r, .03, 0, Math.PI * 2); ctx.stroke(); } }
    line(project(object.x + .22, .5, z), project(object.x + .45, .73, z + .04), '#8f6c4b', p.scale * .13);
  }
  function drawTree(tree, z) {
    const foot = project(tree.x, 0, z), crown = project(tree.x, tree.h, z), s = foot.scale;
    groundEllipse(tree.x, z, tree.r * 1.1, tree.r * .65, .16);
    line(foot, crown, '#797054', Math.max(1, s * .2));
    for (let j = 0; j < 5; j++) {
      const p = project(tree.x + Math.sin(j * 2.4 + tree.p) * tree.r * .5, tree.h + Math.cos(j * 1.7) * .6, z + Math.cos(j * 2.4) * .5), rx = s * tree.r * (.62 + (j % 2) * .1), ry = rx * .9;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(rx, ry); const g = ctx.createRadialGradient(-.4, -.5, .1, .2, .3, 1.4); g.addColorStop(0, '#bbc496'); g.addColorStop(.5, '#96a373'); g.addColorStop(1, '#6d8058'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  function drawBarn() {
    const p = (x, y, z) => project(17 + x, y, -85 + z);
    path([p(-3.5, 0, -5), p(-3.5, 4.6, -5), p(-3.5, 4.6, 5), p(-3.5, 0, 5)], '#967b66');
    path([p(-3.5, 0, 5), p(3.5, 0, 5), p(3.5, 4.6, 5), p(0, 7.3, 5), p(-3.5, 4.6, 5)], '#ba8c72');
    path([p(-4, 4.5, -5.5), p(0, 7.5, -5.5), p(0, 7.5, 5.5), p(-4, 4.5, 5.5)], '#7e7a6d');
    path([p(0, 7.5, -5.5), p(4, 4.5, -5.5), p(4, 4.5, 5.5), p(0, 7.5, 5.5)], '#8f8777');
    for (const x of [-1.15, 1.15]) path([p(x - 1.05, .05, 5.02), p(x + 1.05, .05, 5.02), p(x + 1.05, 3.2, 5.02), p(x - 1.05, 3.2, 5.02)], '#826e59', '#dfd6bb', 1);
    const window = p(0, 5.2, 5.02); ctx.beginPath(); ctx.arc(window.x, window.y, window.scale * .58, 0, 6.29); ctx.fillStyle = '#ddd5bc'; ctx.fill();
    line(p(-3.7, 4.55, 5.53), p(0, 7.45, 5.53), '#ded6bd', Math.max(1, window.scale * .12)); line(p(0, 7.45, 5.53), p(3.7, 4.55, 5.53), '#ded6bd', Math.max(1, window.scale * .12));
  }
  function event(e) {
    if (e.type === 'hit') hitLife = .45;
    if (e.type === 'collect') for (let i = 0; i < 8; i++) { if (particles.length >= 100) particles.shift(); const a = random() * 6.28; particles.push({ x: e.x, y: 1.5, z: e.z, vx: Math.cos(a) * 2, vy: 1 + random() * 2, vz: Math.sin(a), life: .5 + random() * .35 }); }
  }
  function render(state, dt = 0) {
    if (disposed) return; resize(); const t = state.phase === 'paused' ? 0 : Math.min(dt, .05); clock += t; hitLife = Math.max(0, hitLife - t);
    const portrait = camera.aspect < .85;
    camera.position.set(portrait ? state.x * .85 : state.x * .2 + 1.65, portrait ? 6.35 : 5.65, portrait ? 12.7 : 11.3); camera.lookAt(state.x * (portrait ? .85 : .12), .9, -12); camera.updateMatrixWorld();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const horizon = project(0, 0, -250).y;
    const sky = ctx.createLinearGradient(0, 0, 0, height * .75); sky.addColorStop(0, '#98b4c6'); sky.addColorStop(.46, '#f0d6b7'); sky.addColorStop(1, '#edcda9'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    const sun = project(-48, 34, -180), glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, height * .25); glow.addColorStop(0, 'rgba(255,249,218,.95)'); glow.addColorStop(.2, 'rgba(255,229,179,.45)'); glow.addColorStop(1, 'rgba(255,223,178,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height * .65); ctx.beginPath(); ctx.arc(sun.x, sun.y, height * .034, 0, 6.29); ctx.fillStyle = '#fff1ce'; ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      const base = horizon + layer * height * .023; ctx.beginPath(); ctx.moveTo(0, base); for (let i = 0; i <= 8; i++) { const x = i * width / 8, y = base - height * (.025 + .023 * Math.sin(i * 1.9 + layer * 1.3) + .025 * Math.cos(i * 2.8 + layer)); ctx.quadraticCurveTo(x - width / 16, y - height * .04, x, y); } ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fillStyle = ['#c3c5b1', '#b8bda1', '#a9b38b'][layer]; ctx.fill();
    }
    const earth = ctx.createLinearGradient(0, horizon, 0, height); earth.addColorStop(0, '#b7ba91'); earth.addColorStop(1, '#8e9e6f'); ctx.fillStyle = earth; ctx.fillRect(0, horizon + height * .032, width, height);
    const road = ctx.createLinearGradient(0, horizon, 0, height); road.addColorStop(0, '#dfccb0'); road.addColorStop(1, '#d0b086');
    path([project(-5.325, 0, 9), project(5.325, 0, 9), project(5.325, 0, -155), project(-5.325, 0, -155)], road);
    for (const lane of [-3, 0, 3]) path([project(lane - .52, .004, 9), project(lane + .52, .004, 9), project(lane + .52, .004, -150), project(lane - .52, .004, -150)], 'rgba(147,108,70,.095)');
    for (let i = 0; i < 90; i++) { const z = 8 - wrap(i * 1.63 - state.distance, 147), x = Math.sin(i * 17.31) * 5.1, p = project(x, .012, z); if (p.y < height && p.depth > 0) { ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(.3, p.scale * .035), Math.max(.2, p.scale * .011), 0, 0, 6.29); ctx.fillStyle = 'rgba(135,100,67,.2)'; ctx.fill(); } }
    const queue = [];
    queue.push({ depth: project(17, 3, -85).depth, draw: drawBarn });
    for (const tree of trees) { const z = 15 - wrap(tree.z - state.distance, 147); if (z < 6) queue.push({ depth: project(tree.x, tree.h, z).depth, draw: () => drawTree(tree, z) }); }
    for (const f of flowers) { const z = 15 - wrap(f.z - state.distance, 147); if (z > 7) continue; const p = project(f.x, f.h, z); if (p.x < -10 || p.x > width + 10) continue; queue.push({ depth: p.depth, draw: () => { const foot = project(f.x, 0, z); line(foot, p, '#839265', Math.max(.5, p.scale * .022)); ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(.6, p.scale * .055), Math.max(.5, p.scale * .043), 0, 0, 6.29); ctx.fillStyle = f.p < .5 ? '#ead9af' : f.p < .8 ? '#d6acc1' : '#e5bd9e'; ctx.fill(); } }); }
    for (const side of [-1, 1]) for (let i = 0; i < 42; i++) {
      const z = 12 - wrap(i * 3.5 - state.distance, 147); if (z > 7) continue;
      const x = side * 5.95, base = project(x, 0, z), top = project(x, 1.28, z), s = base.scale;
      queue.push({ depth: base.depth, draw: () => { for (const y of [.49, .99]) { line(project(x, y, z), project(x, y, z - 3.5), '#aea58c', Math.max(1, s * .14)); line(project(x, y + .03, z), project(x, y + .03, z - 3.5), '#e8e0c6', Math.max(.7, s * .085)); } line(base, top, '#aca48c', Math.max(1.5, s * .15)); line({ x: base.x - s * .035, y: base.y }, { x: top.x - s * .035, y: top.y }, '#eee7cf', Math.max(1, s * .09)); } });
    }
    for (const object of objects) {
      const gap = object.distance - state.distance; if (gap < -8 || gap > 95 || object.collected) continue;
      queue.push({ depth: project(object.x, object.type === 'heart' ? 1.55 : .32, -gap).depth, draw: () => object.type === 'heart' ? heart(object.x, 1.55 + Math.sin(clock * 3 + object.time) * .1, -gap, object.time) : drawLog(object, gap) });
    }
    const turn = Math.max(-1, Math.min(1, (state.x - previousX) * 3)); previousX = state.x;
    player.root.position.set(state.x, state.y, 0); player.animate({ time: clock, speed: state.speed, airborne: state.airborne, turn, idle: state.phase === 'countdown', hit: hitLife });
    const follow = followingSample(followingHistory, state); companionX = lerp(companionX, state.x + .89, 1 - Math.exp(-t * 13)); companionY = follow.y;
    companion.root.position.set(companionX, companionY, 2.6); companion.animate({ time: clock + .17, speed: state.speed, airborne: companionY > .04, turn, idle: state.phase === 'countdown' });
    groundEllipse(state.x, 0, .8 + state.y * .1, 1.6, .24 - state.y * .05); groundEllipse(companionX, 2.6, .7, 1.4, .2);
    const ring = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283; ring.push(project(state.x + Math.cos(a) * .62, .018, Math.sin(a) * .94)); } path(ring, null, 'rgba(238,255,224,.7)', 1.7);
    for (const rig of [player, companion]) {
      rig.root.updateMatrixWorld(true);
      rig.root.traverse(m => { if (!m.isMesh) return; const v = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld), p = project(v.x, v.y, v.z); queue.push({ depth: p.depth, draw: () => m.geometry.type === 'CylinderGeometry' ? drawCylinder(m) : m.geometry.type === 'TorusGeometry' ? drawTorus(m) : drawEllipsoid(m) }); });
    }
    queue.sort((a, b) => b.depth - a.depth); for (const item of queue) { ctx.globalAlpha = Math.max(.25, Math.min(1, 1 - (item.depth - 55) / 150)); item.draw(); } ctx.globalAlpha = 1;
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= t; if (p.life <= 0) { particles.splice(i, 1); continue; } p.x += p.vx * t; p.y += p.vy * t; p.z += (p.vz + state.speed * .3) * t; p.vy -= t * 7; const point = project(p.x, p.y, p.z), size = point.scale * .07 * Math.min(1, p.life * 3); ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(clock * 2 + i); ctx.fillStyle = '#fff0be'; ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillRect(-size, -size, size * 2, size * 2); ctx.restore(); } ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(width * .5, height * .45, height * .3, width * .5, height * .5, Math.max(width, height) * .72); vignette.addColorStop(0, 'rgba(69,54,43,0)'); vignette.addColorStop(1, 'rgba(69,54,43,.14)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  }
  function dispose() { if (disposed) return; disposed = true; const geo = new Set(), mats = new Set(); for (const rig of [player, companion]) rig.root.traverse(m => { if (m.geometry) geo.add(m.geometry); if (m.material) mats.add(m.material); }); for (const g of geo) g.dispose(); for (const m of mats) m.dispose(); particles.length = 0; }
  resize(); return { render, resize, event, dispose };
}

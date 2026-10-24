import * as THREE from 'three';

// Metres, right-handed court coordinates. Visuals never own game state.
const TABLE_Y = 0.76;
const HALF_W = 0.7625;
const HALF_L = 1.37;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function woodTexture() {
  const random = rng(42027);
  const texture = canvasTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#705a45'; c.fillRect(0, 0, w, h);
    const plankHeight = 128;
    for (let row = 0; row < 8; row++) {
      const y = row * plankHeight;
      const r = 89 + Math.floor(random() * 28);
      c.fillStyle = `rgb(${r + 21},${r + 3},${r - 15})`;
      c.fillRect(0, y, w, plankHeight - 2);
      for (let line = 0; line < 125; line++) {
        const gy = y + random() * plankHeight;
        c.strokeStyle = `rgba(${random() > .45 ? '24,18,12' : '224,199,159'},${.018 + random() * .06})`;
        c.lineWidth = .5 + random() * 1.4;
        c.beginPath(); c.moveTo(0, gy);
        c.bezierCurveTo(w * .3, gy + random() * 9, w * .7, gy - random() * 9, w, gy + random() * 3);
        c.stroke();
      }
      const joint = row % 2 === 0 ? 285 : 740;
      c.fillStyle = 'rgba(20,15,10,.27)'; c.fillRect(joint, y, 1.7, plankHeight);
      c.fillStyle = 'rgba(10,10,8,.17)'; c.fillRect(0, y + plankHeight - 2, w, 1.5);
      c.fillStyle = 'rgba(245,220,174,.12)'; c.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 23000; i++) {
      c.fillStyle = random() > .5 ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,.018)';
      c.fillRect(random() * w, random() * h, random() * 9 + 1, .6);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}

function fineTexture() {
  const random = rng(731);
  const texture = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#e9e8e2'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      c.fillStyle = random() > .5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.055)';
      c.fillRect(random() * w, random() * h, 1, 1);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 9);
  return texture;
}

function rubberTexture() {
  const texture = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#d5d5d5'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c2c2c2';
    for (let y = 2; y < h; y += 4) for (let x = 2; x < w; x += 4) {
      c.beginPath(); c.arc(x + (y % 8 ? 1 : 0), y, .65, 0, Math.PI * 2); c.fill();
    }
  });
  return texture;
}

function roundedRect(width, height, radius) {
  const s = new THREE.Shape();
  const x = -width / 2, y = -height / 2, r = radius;
  s.moveTo(x + r, y); s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function extrude(shape, depth, bevel = .0015) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSegments: 2, steps: 1,
    bevelSize: bevel, bevelThickness: bevel, curveSegments: 18,
  });
}

function matte(color, roughness = .72, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function block(parent, w, h, d, x, y, z, material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

function rod(parent, start, end, radius, material, sides = 10) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), sides), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}

function label(text, width, height, color = '#eee9dd', fontSize = 80, family = 'Arial') {
  const texture = canvasTexture(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = color;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${fontSize}px ${family}`; c.fillText(text, w / 2, h / 2);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  return mesh;
}

function blobTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.3, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,247,204,.8)'); g.addColorStop(.3, 'rgba(255,247,204,.15)'); g.addColorStop(1, 'rgba(255,247,204,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

function makePaddle(index, rubber) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-.022, -.082);
  shape.bezierCurveTo(-.065, -.070, -.081, -.038, -.081, .008);
  shape.bezierCurveTo(-.081, .059, -.046, .093, 0, .095);
  shape.bezierCurveTo(.046, .093, .081, .059, .081, .008);
  shape.bezierCurveTo(.081, -.038, .065, -.070, .022, -.082);
  shape.lineTo(-.022, -.082);
  const wood = new THREE.Mesh(extrude(shape, .007, .0011), matte('#c4a16b', .48));
  wood.scale.set(1.42, 1.42, 1); wood.position.z = -.0035; wood.castShadow = true; group.add(wood);
  const ply = new THREE.Mesh(extrude(shape, .0011, .0003), matte('#614d31'));
  ply.scale.set(1.42, 1.42, 1); ply.position.z = -.0005; group.add(ply);
  const red = new THREE.MeshStandardMaterial({ color: '#e25743', map: rubber, bumpMap: rubber, bumpScale: .00035, roughness: .79 });
  const black = new THREE.MeshStandardMaterial({ color: '#202526', map: rubber, roughness: .77 });
  const rubberGeometry = extrude(shape, .0014, .0004);
  const front = new THREE.Mesh(rubberGeometry, red); front.scale.set(1.42, 1.42, 1); front.position.z = .0053; front.castShadow = true; group.add(front);
  const back = new THREE.Mesh(rubberGeometry, black); back.scale.set(1.42, 1.42, 1); back.position.z = -.007; group.add(back);
  const handleShape = new THREE.Shape();
  handleShape.moveTo(-.018, -.07); handleShape.quadraticCurveTo(-.016, -.12, -.024, -.178);
  handleShape.quadraticCurveTo(0, -.19, .024, -.178); handleShape.quadraticCurveTo(.016, -.12, .018, -.07);
  handleShape.closePath();
  const handle = new THREE.Mesh(extrude(handleShape, .020, .003), matte('#b58b55', .49));
  handle.position.set(0, -.038, -.010); handle.castShadow = true; group.add(handle);
  const inlay = new THREE.Mesh(extrude(roundedRect(.012, .08, .004), .001, .0003), matte('#444e50', .5));
  inlay.position.set(0, -.177, .014); group.add(inlay);
  const gripBadge = new THREE.Mesh(new THREE.CircleGeometry(.008, 16), matte('#dcc8a1', .4));
  gripBadge.position.set(0, -.206, .016); group.add(gripBadge);
  const logo = label('T', .034, .009, '#f6d9c4', 140);
  logo.position.set(0, -.070, .0076); group.add(logo);
  group.rotation.y = index ? Math.PI : 0;
  group.userData = { strike: 0, lastSwing: false };
  return group;
}

export class Arena {
  constructor(container, { onReady } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a211e');
    this.scene.fog = new THREE.FogExp2('#1a211e', .043);
    this.camera = new THREE.PerspectiveCamera(46, 1, .035, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'arena-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D table tennis court');
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    container.appendChild(this.renderer.domElement);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.courtPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.95);
    this.intersect = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3(0, .65, 0);
    this.desiredPosition = new THREE.Vector3(); this.desiredTarget = new THREE.Vector3();
    this.lastMode = ''; this.elapsed = 0; this.lastEvent = -1; this.lastBall = new THREE.Vector3();
    this.quality = 'auto'; this.slowTime = 0; this.fpsSamples = 0;
    this.ripples = [];
    this.buildLighting(); this.buildRoom(); this.buildTable(); this.buildPlayers();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container); this.resize(); this.setQuality('auto');
    onReady?.();
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight('#e7eee4', '#534335', 1.55));
    const key = new THREE.DirectionalLight('#fff0d7', 3.25);
    key.position.set(-1.8, 5, 2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3.8, right: 3.8, top: 4.8, bottom: -4.8, near: .5, far: 12 });
    key.shadow.bias = -.00025; key.shadow.normalBias = .018; key.shadow.radius = 3;
    this.scene.add(key); this.keyLight = key;
    const rim = new THREE.DirectionalLight('#acc9d2', 1.6); rim.position.set(2.3, 3.4, -4); this.scene.add(rim);
    const fill = new THREE.PointLight('#fff0d5', 18, 9, 2); fill.position.set(0, 3.6, -3.8); this.scene.add(fill);
    const side = new THREE.PointLight('#d6c0a5', 13, 8, 2); side.position.set(-3.5, 2.7, 0); this.scene.add(side);
  }

  buildRoom() {
    const room = new THREE.Group(); this.scene.add(room);
    const wood = woodTexture();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: wood, color: '#bdb5a6', roughness: .48, metalness: .02 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.012; floor.receiveShadow = true; room.add(floor);
    const courtLine = new THREE.MeshBasicMaterial({ color: '#b9b5a3', transparent: true, opacity: .28 });
    for (const x of [-2.55, 2.55]) block(room, .025, .002, 7.8, x, -.007, 0, courtLine, false);
    for (const z of [-3.9, 3.9]) block(room, 5.12, .002, .025, 0, -.007, z, courtLine, false);
    const wall = matte('#252b26', .9);
    block(room, 16, 5.2, .2, 0, 2.55, -6, wall, false);
    block(room, .2, 5.2, 18, -7, 2.55, 0, wall, false);
    block(room, .2, 5.2, 18, 7, 2.55, 0, wall, false);
    const slatMaterial = matte('#3d3b30', .83);
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(.055, 2.25, .045), slatMaterial, 85);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 85; i++) { transform.position.set(-6.25 + i * .148, 1.35, -5.87); transform.updateMatrix(); slats.setMatrixAt(i, transform.matrix); }
    room.add(slats);
    const bottomWall = matte('#182d29', .9);
    block(room, 13.8, .14, .15, 0, .1, -5.8, matte('#121a17'), false);
    const logo = label('TABLE TENNIS', 3.05, .77, '#e0dfcd', 116);
    logo.position.set(0, 2.8, -5.78); room.add(logo);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fff0ce', toneMapped: false });
    const housing = matte('#101714', .5, .4);
    for (const x of [-2.2, 2.2]) {
      block(room, .075, .055, 5.6, x, 3.7, -.4, housing, false);
      block(room, .042, .012, 5.45, x, 3.665, -.4, lightMat, false);
      for (const z of [-2.6, 1.8]) rod(room, [x, 3.72, z], [x, 4.55, z], .005, housing, 6);
    }
    block(room, 7.8, .024, .04, 0, 3.48, -5.76, lightMat, false);
    const boundary = new THREE.Group(); room.add(boundary);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = -3 + i * 2.0;
        block(boundary, .035, .55, 1.9, side * 2.9, .29, z, bottomWall, false);
        rod(boundary, [side * 2.9, .57, z - .95], [side * 2.9, .57, z + .95], .008, matte('#55635a'), 6);
        for (const edge of [-.94, .94]) {
          rod(boundary, [side * 2.9, .01, z + edge], [side * 2.9, .58, z + edge], .009, housing, 6);
          block(boundary, .25, .02, .05, side * 2.9, .01, z + edge, housing, false);
        }
      }
      // Compact timber spectator benches, with continuous formed seat rails.
      for (let level = 0; level < 2; level++) {
        const x = side * (3.65 + level * .68), y = .32 + level * .35;
        block(room, .52, .055, 4.7, x, y, -1.0, matte('#6c5a44'), false);
        block(room, .055, .34, 4.7, x + side * .22, y + .23, -1.0, matte('#554d3a'), false);
        for (const z of [-2.9, .9]) {
          block(room, .035, y, .055, x - .19, y / 2, z, housing, false);
          block(room, .035, y, .055, x + .19, y / 2, z, housing, false);
        }
      }
      const clubMark = label('TABLE TENNIS', 1.25, .30, '#9ea699', 96);
      clubMark.position.set(side * 2.877, .31, -1.0); clubMark.rotation.y = -side * Math.PI / 2; room.add(clubMark);
    }
    // Backcourt practice barriers and a lit court number provide scale.
    for (const x of [-1.55, 1.55]) block(room, 2.9, .55, .03, x, .29, -4.35, bottomWall, false);
    const number = label('01', .47, .42, '#d9d5bc', 168); number.position.set(-4.7, 2.75, -5.76); room.add(number);
    const posterMat = matte('#c45843', .9);
    block(room, .72, 1.35, .035, 4.75, 2.7, -5.73, posterMat, false);
    const poster = label('PLAY', .65, .2, '#eee9dd', 100); poster.position.set(4.75, 2.94, -5.70); room.add(poster);
    const poster2 = label('AGAIN.', .65, .2, '#eee9dd', 86); poster2.position.set(4.75, 2.65, -5.70); room.add(poster2);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.5), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: .28, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = -.004; room.add(contact);
  }

  buildTable() {
    const table = new THREE.Group(); this.scene.add(table);
    const edgeMat = matte('#172725', .49, .3), steel = matte('#313b38', .4, .75), chrome = matte('#adb0a2', .31, .72);
    const boardShape = roundedRect(HALF_W * 2, HALF_L * 2, .012);
    const edge = new THREE.Mesh(extrude(boardShape, .037, .002), edgeMat);
    edge.rotation.x = -Math.PI / 2; edge.position.y = TABLE_Y - .042; edge.castShadow = true; edge.receiveShadow = true; table.add(edge);
    const surfaceTexture = fineTexture();
    const surface = new THREE.Mesh(extrude(boardShape, .006, .0007), new THREE.MeshStandardMaterial({ color: '#1c5652', map: surfaceTexture, roughness: .68, metalness: .02 }));
    surface.rotation.x = -Math.PI / 2; surface.position.y = TABLE_Y - .0067; surface.receiveShadow = true; surface.castShadow = true; table.add(surface);
    const white = new THREE.MeshStandardMaterial({ color: '#e9eee3', roughness: .75 });
    for (const x of [-HALF_W + .0085, HALF_W - .0085]) block(table, .014, .001, HALF_L * 2 - .014, x, TABLE_Y + .001, 0, white, false);
    for (const z of [-HALF_L + .0085, HALF_L - .0085]) block(table, HALF_W * 2 - .014, .001, .014, 0, TABLE_Y + .001, z, white, false);
    block(table, .003, .0012, HALF_L * 2 - .01, 0, TABLE_Y + .001, 0, white, false);
    block(table, HALF_W * 2 - .01, .0012, .002, 0, TABLE_Y + .001, 0, matte('#173f3d'), false);
    for (const x of [-.58, .58]) {
      block(table, .044, .065, 2.37, x, .667, 0, edgeMat);
      for (const sign of [-1, 1]) {
        const z = sign * .9;
        const upper = [x, .66, z], lower = [x * 1.05, .075, z + sign * .15];
        const a = new THREE.Vector3(...upper), b = new THREE.Vector3(...lower), delta = b.clone().sub(a);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.038, delta.length(), .038), steel);
        leg.position.copy(a).add(b).multiplyScalar(.5); leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); leg.castShadow = true; table.add(leg);
        rod(table, [x, .2, z + sign * .12], [x, .63, z - sign * .32], .008, chrome, 8);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.043, .043, .027, 20), matte('#171c1a', .9));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(lower[0], .042, lower[2]); wheel.castShadow = true; table.add(wheel);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(.019, .019, .028, 16), chrome); cap.rotation.z = Math.PI / 2; cap.position.copy(wheel.position); table.add(cap);
      }
    }
    for (const z of [-1.03, 1.03]) block(table, 1.2, .025, .035, 0, .21, z, steel);
    for (const z of [-.85, .85]) block(table, 1.19, .056, .04, 0, .657, z, steel);
    for (const side of [-1, 1]) {
      const mark = label('TABLE TENNIS', .32, .062, '#cfdbcc', 104);
      mark.position.set(0, .738, side * 1.373); if (side < 0) mark.rotation.y = Math.PI; table.add(mark);
    }
    const netTexture = canvasTexture(1024, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(211,218,207,.65)'; c.lineWidth = 1.7;
      for (let x = 0; x <= w; x += 9) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += 9) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(1.83, .145), new THREE.MeshStandardMaterial({ map: netTexture, transparent: true, alphaTest: .08, side: THREE.DoubleSide, roughness: .9, depthWrite: false, color: '#b8c4bd' }));
    net.position.set(0, TABLE_Y + .0755, 0); table.add(net); this.net = net;
    const binding = matte('#e4e7d9', .8);
    block(table, 1.846, .012, .009, 0, TABLE_Y + .1465, 0, binding, false);
    rod(table, [-.915, TABLE_Y + .008, 0], [.915, TABLE_Y + .008, 0], .0015, chrome, 6);
    for (const x of [-.915, .915]) {
      rod(table, [x, TABLE_Y - .035, 0], [x, TABLE_Y + .166, 0], .008, steel, 12);
      block(table, .17, .015, .035, x > 0 ? .833 : -.833, TABLE_Y - .015, 0, steel);
      block(table, .037, .016, .065, x > 0 ? .75 : -.75, TABLE_Y - .055, 0, steel);
      rod(table, [x, TABLE_Y - .065, .017], [x, TABLE_Y - .022, .017], .0035, chrome, 8);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, .008, 12), edgeMat); knob.position.set(x, TABLE_Y - .071, .017); table.add(knob);
    }
  }

  buildPlayers() {
    const rubber = rubberTexture();
    this.paddles = [makePaddle(0, rubber), makePaddle(1, rubber)];
    this.paddles.forEach((p, i) => { p.position.set(i ? .25 : -.25, 1.04, i ? -1.57 : 1.57); this.scene.add(p); });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.02, 24, 16), new THREE.MeshStandardMaterial({ color: '#fff6df', roughness: .4, emissive: '#fff0c2', emissiveIntensity: .10 }));
    ball.castShadow = false; this.scene.add(ball); this.ball = ball;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.02002, .00013, 3, 40), new THREE.MeshBasicMaterial({ color: '#e3d9c2' })); seam.rotation.y = .38; ball.add(seam);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: .27, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(.115, .115, 1); ball.add(glow);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: .65, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.renderOrder = 1; this.scene.add(this.ballShadow);
    this.trail = Array.from({ length: 5 }, (_, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(.013 - i * .0012, 8, 6), new THREE.MeshBasicMaterial({ color: '#f4e6bf', transparent: true, opacity: .16 * (1 - i / 5), depthWrite: false }));
      mesh.visible = false; this.scene.add(mesh); return mesh;
    });
    this.trailPositions = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 32), new THREE.MeshBasicMaterial({ color: '#eef4d7', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.life = 0; this.scene.add(ring); this.ripples.push(ring);
    }
  }

  resize() {
    const bounds = this.container.getBoundingClientRect();
    this.width = Math.max(1, bounds.width); this.height = Math.max(1, bounds.height);
    this.mobile = this.width < 700 || this.width / this.height < .85;
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.lastMode = '';
  }

  setQuality(quality = 'auto') {
    this.quality = quality;
    const constrained = (navigator.hardwareConcurrency || 8) <= 4 || this.mobile;
    const dprLimit = quality === 'low' ? 1 : quality === 'high' ? 2 : constrained ? 1.35 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprLimit));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.keyLight.castShadow = quality !== 'low';
    const shadowSize = quality === 'high' ? 2048 : 1024;
    if (this.keyLight.shadow.mapSize.x !== shadowSize) {
      this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.keyLight.shadow.map) { this.keyLight.shadow.map.dispose(); this.keyLight.shadow.map = null; }
    }
    this.renderer.setSize(this.width, this.height, false);
  }

  pointerToTable(clientX, clientY, side = 0) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.courtPlane, this.intersect);
    if (!point) return { x: 0, depth: 1.58, aim: 0 };
    const sign = side === 0 ? 1 : -1;
    return { x: clamp(point.x, -1.12, 1.12), depth: clamp(point.z * sign, 1.38, 1.92), aim: clamp(point.x / .76, -1, 1) };
  }

  project(x, y, z) {
    const position = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (position.x + 1) * .5 * this.width, y: (1 - position.y) * .5 * this.height };
  }

  update(state, dt = 1 / 60, options = {}) {
    const { mode = 'play', side = 0, camera = 'player', reducedMotion = false } = options;
    const delta = Math.min(.1, Math.max(0, dt)); this.elapsed += delta;
    const sign = side === 0 ? 1 : -1;
    const viewKey = `${mode}:${side}:${camera}:${this.mobile}`;
    if (mode === 'home') {
      if (this.mobile) {
        this.desiredPosition.set(2.93, 2.93, 5.05);
        this.desiredTarget.set(0, .77, .05);
        this.camera.fov = 45;
      } else {
        this.desiredPosition.set(3.0, 2.65, 3.95);
        this.desiredTarget.set(-.69, .68, .48);
        this.camera.fov = 40;
      }
    } else if (camera === 'broadcast') {
      this.desiredPosition.set(this.mobile ? 4.9 : 3.35, this.mobile ? 6.5 : 3.45, this.mobile ? 6.1 : 2.4);
      this.desiredTarget.set(0, .57, 0); this.camera.fov = this.mobile ? 50 : 43;
    } else {
      const trackX = !reducedMotion && state?.ball ? clamp(state.ball.x * .05, -.06, .06) : 0;
      this.desiredPosition.set(trackX, this.mobile ? 3.7 : 2.23, sign * (this.mobile ? 5.7 : 3.53));
      this.desiredTarget.set(trackX * .2, this.mobile ? .63 : .66, sign * -.09);
      this.camera.fov = this.mobile ? 51 : 44;
    }
    // Keep the same view angle on narrow portrait screens while preserving court margins.
    const minimumAspect = mode === 'home' ? .65 : .47;
    if (this.mobile && this.camera.aspect < minimumAspect) {
      this.desiredPosition.sub(this.desiredTarget).multiplyScalar(minimumAspect / this.camera.aspect).add(this.desiredTarget);
    }
    if (viewKey !== this.lastMode) {
      this.camera.position.copy(this.desiredPosition); this.cameraTarget.copy(this.desiredTarget); this.lastMode = viewKey;
    } else {
      const smoothing = 1 - Math.exp(-delta * 3);
      this.camera.position.lerp(this.desiredPosition, smoothing); this.cameraTarget.lerp(this.desiredTarget, smoothing);
    }
    this.camera.lookAt(this.cameraTarget); this.camera.updateProjectionMatrix();
    if (state) {
      if (Number.isFinite(state.time) && Number.isFinite(this.lastStateTime) && state.time < this.lastStateTime - .25) {
        this.lastEvent = -1;
        this.trailPositions.length = 0;
        this.ripples.forEach(ring => { ring.visible = false; ring.userData.life = 0; });
      }
      this.lastStateTime = state.time;
      const ball = state.ball;
      if (ball) {
        this.ball.visible = ball.visible !== false;
        this.ball.position.set(ball.x, ball.y, ball.z);
        this.ball.rotation.x += (ball.wx || 0) * delta;
        this.ball.rotation.y += (ball.wy || 0) * delta;
        this.ball.rotation.z += (ball.wz || 0) * delta;
        const overTable = Math.abs(ball.x) < HALF_W && Math.abs(ball.z) < HALF_L;
        const groundY = overTable && ball.y >= TABLE_Y ? TABLE_Y + .004 : -.004;
        const altitude = Math.max(.01, ball.y - groundY);
        const shadowSize = .075 + Math.min(altitude, 2) * .10;
        this.ballShadow.visible = this.ball.visible && ball.y > groundY;
        this.ballShadow.position.set(ball.x, groundY, ball.z); this.ballShadow.scale.set(shadowSize, shadowSize, 1);
        this.ballShadow.material.opacity = .76 / (1 + altitude * 2);
        if (this.ball.position.distanceToSquared(this.lastBall) > .00002) {
          this.trailPositions.unshift(this.ball.position.clone());
          if (this.trailPositions.length > 8) this.trailPositions.length = 8;
        }
        const speed = Math.hypot(ball.vx || 0, ball.vy || 0, ball.vz || 0);
        this.trail.forEach((mesh, i) => {
          mesh.visible = !reducedMotion && mode !== 'home' && this.ball.visible && speed > 3.7 && !!this.trailPositions[i + 2];
          if (mesh.visible) mesh.position.copy(this.trailPositions[i + 2]);
        });
        if (this.ball.position.distanceToSquared(this.lastBall) > .7) this.trailPositions.length = 0;
        this.lastBall.copy(this.ball.position);
      }
      state.paddles?.forEach((p, i) => {
        const paddle = this.paddles[i];
        if (!p || !paddle) return;
        paddle.position.set(p.x, p.y, p.z);
        const swing = typeof p.swing === 'number' ? p.swing > 0 : !!p.swing;
        if (swing && !paddle.userData.lastSwing) paddle.userData.strike = 1;
        paddle.userData.lastSwing = swing;
        paddle.userData.strike *= Math.exp(-delta * 14);
        const strike = paddle.userData.strike;
        const orientation = i ? Math.PI : 0;
        paddle.rotation.y = orientation + clamp((p.vx || 0) * .045, -.30, .30);
        paddle.rotation.z = -clamp(p.x * .22, -.28, .28) + (i ? -.13 : .13);
        paddle.rotation.x = (i ? -.1 : .1) + (i ? -1 : 1) * strike * .33;
      });
      for (const event of state.events || []) {
        if (event.id <= this.lastEvent) continue;
        this.lastEvent = event.id;
        if ((event.type === 'table' || event.type === 'bounce') && Number.isFinite(event.x) && Number.isFinite(event.z)) {
          const ring = this.ripples.find(r => r.userData.life <= 0) || this.ripples[0];
          ring.position.set(event.x, TABLE_Y + .003, event.z); ring.userData.life = .32; ring.visible = !reducedMotion;
        }
        if (event.type === 'paddle' && Number.isInteger(event.side)) this.paddles[event.side].userData.strike = 1;
      }
    }
    for (const ripple of this.ripples) {
      ripple.userData.life -= delta;
      if (ripple.userData.life <= 0 || reducedMotion) { ripple.visible = false; continue; }
      const progress = 1 - ripple.userData.life / .32, size = .025 + progress * .073;
      ripple.scale.set(size, size, size); ripple.material.opacity = (1 - progress) * .26;
    }
    // Reduce internal render resolution only after sustained slow rendering.
    if (this.quality === 'auto' && delta > .024) this.slowTime += delta;
    else this.slowTime = Math.max(0, this.slowTime - delta * .2);
    if (this.quality === 'auto' && this.slowTime > 4 && this.renderer.getPixelRatio() > 1) {
      this.renderer.setPixelRatio(Math.max(1, this.renderer.getPixelRatio() - .25)); this.slowTime = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_RADIUS, CUP_RADIUS, sampleHeight, simulateShot, getObstacleSegments, type Ball, type Hole, type FloorRect, type Obstacle, type ShotFrame } from './golf';

export type ScenePlayer = { id: string; color: string; ball: Ball };
export type SceneCallbacks = { onShot: (angle: number, power: number) => void; onAim: (power: number) => void; onReady?: () => void; onError?: (message: string) => void };
type BallView = { mesh: THREE.Mesh; shadow: THREE.Mesh; data: ScenePlayer; previous: THREE.Vector3 };
type Playback = { frames: ShotFrame[]; start: number; index: number; done?: () => void };
type AnimatedObstacle = { obstacle: Obstacle; bars: THREE.Group[]; blades?: THREE.Group };
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const palette = { grass: 0x75a965, forest: 0x264c40, cream: 0xf1e3c4, edge: 0xc9b691, coral: 0xdf785e, water: 0x62b9b5, dark: 0x25493b };
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function texture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  if (ctx) draw(ctx, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function grassTexture() {
  const random = rng(71);
  return texture((c, s) => {
    c.fillStyle = '#66a25b'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#74ac64' : '#6aa35e'; c.fillRect(0, i * s / 8, s, s / 8); }
    for (let i = 0; i < 23000; i++) { const x = random() * s, y = random() * s; c.fillStyle = random() > .48 ? `rgba(225,242,177,${random() * .16})` : `rgba(18,73,40,${random() * .12})`; c.fillRect(x, y, .55 + random() * .7, 1 + random() * 2); }
  }, 512);
}
function sandTexture() {
  const random = rng(19);
  return texture((c, s) => { c.fillStyle = '#e8d6af'; c.fillRect(0, 0, s, s); for (let i = 0; i < 12000; i++) { c.fillStyle = random() > .5 ? 'rgba(255,255,230,.24)' : 'rgba(138,111,71,.12)'; c.fillRect(random() * s, random() * s, 1.1, .7); } for (let y = 5; y < s; y += 20) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s / 3, y - 8, s / 2, y + 8, s, y); c.strokeStyle = 'rgba(145,119,76,.1)'; c.stroke(); } });
}
function ballTexture() {
  return texture((c, s) => { c.fillStyle = '#bdbdbd'; c.fillRect(0, 0, s, s); for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) { const px = (x + (y % 2) * .5) * s / 32, py = y * s / 20, r = s / 100; const g = c.createRadialGradient(px - .5, py - .5, 0, px, py, r); g.addColorStop(0, '#555555'); g.addColorStop(.6, '#909090'); g.addColorStop(1, '#e4e4e4'); c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); } }, 512);
}
function shadowTexture() {
  return texture((c, s) => { const g = c.createRadialGradient(s / 2, s / 2, s * .1, s / 2, s / 2, s * .5); g.addColorStop(0, 'rgba(18,44,30,.48)'); g.addColorStop(.4, 'rgba(18,44,30,.23)'); g.addColorStop(1, 'rgba(18,44,30,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }, 128);
}

/** Owns WebGL resources and input. Match logic remains outside the renderer. */
export class GolfScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(39, 1, .1, 220);
  private callbacks: SceneCallbacks;
  private container: HTMLElement;
  private world = new THREE.Group();
  private balls = new Map<string, BallView>();
  private playback = new Map<string, Playback>();
  private animated: AnimatedObstacle[] = [];
  private foliage: THREE.Group[] = [];
  private ripples: THREE.Mesh[] = [];
  private flag?: THREE.Mesh;
  private hole?: Hole;
  private active = '';
  private mode: 'home' | 'play' = 'home';
  private cameraMode: 'follow' | 'overview' = 'follow';
  private canShoot = false;
  private disposed = false;
  private request = 0;
  private observer: ResizeObserver;
  private nowOffset = -performance.now() / 1000;
  private last = performance.now();
  private yaw = .55;
  private pitch = .82;
  private zoom = 1;
  private look = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private warmup = true;
  private pointer?: { id: number; x: number; y: number; lastX: number; lastY: number; mode: 'aim' | 'orbit'; angle: number; power: number };
  private touches = new Map<number, { x: number; y: number }>();
  private previousTouchSpan = 0;
  private touchCentroid?: { x: number; y: number };
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane();
  private temp = new THREE.Vector3();
  private temp2 = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private aimDots: THREE.InstancedMesh;
  private aimEnd: THREE.Mesh;
  private activeRing: THREE.Mesh;
  private particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
  private trail: THREE.Line;
  private trailPoints: THREE.Vector3[] = [];
  private previewAt = 0;
  private ownedGeometry = new Set<THREE.BufferGeometry>();
  private ownedMaterials = new Set<THREE.Material>();
  private ownedTextures = new Set<THREE.Texture>();
  private sharedGeometry = new Set<THREE.BufferGeometry>();
  private sharedMaterials = new Set<THREE.Material>();
  private sharedTextures = new Set<THREE.Texture>();
  private grass: THREE.MeshStandardMaterial;
  private sand: THREE.MeshStandardMaterial;
  private cream: THREE.MeshStandardMaterial;
  private dark: THREE.MeshStandardMaterial;
  private coral: THREE.MeshStandardMaterial;
  private wood: THREE.MeshStandardMaterial;
  private water: THREE.MeshPhysicalMaterial;
  private leafMaterials: THREE.MeshStandardMaterial[];
  private bump: THREE.Texture;
  private contact: THREE.Texture;
  private unitBox: THREE.BufferGeometry;
  private sphere: THREE.BufferGeometry;
  private leafGeometry: THREE.BufferGeometry;
  private cylinder: THREE.BufferGeometry;
  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1)); this.camera.aspect = width / Math.max(height, 1); this.camera.updateProjectionMatrix(); this.updateViewOffset();
  };
  private contextLost = (event: Event) => { event.preventDefault(); this.callbacks.onError?.('The 3D view was interrupted. Reload to get back on the green.'); };
  private contextMenu = (event: Event) => event.preventDefault();
  private wheel = (event: WheelEvent) => { event.preventDefault(); this.zoom = clamp(this.zoom * (1 + event.deltaY * .001), .65, 1.65); };
  private keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') this.cancelAim(); };

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container; this.callbacks = callbacks;
    // Phones: fewer pixels and cheaper shadows keep the frame rate smooth.
    const phone = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none;';
    this.renderer.domElement.setAttribute('aria-label', 'Mini golf course. Drag back from the ball to putt.');
    this.renderer.domElement.tabIndex = 0; container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xc9e0d7); this.scene.fog = new THREE.Fog(0xc9e0d7, 48, 130);
    this.scene.add(new THREE.HemisphereLight(0xfff8e4, 0x8ba891, 2.2));
    const sun = new THREE.DirectionalLight(0xffe9ca, 3.2); sun.position.set(-18, 34, 18); sun.castShadow = true;
    const shadowSize = phone || window.innerWidth < 768 ? 1024 : 2048; sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.camera.left = sun.shadow.camera.bottom = -27; sun.shadow.camera.right = sun.shadow.camera.top = 27; sun.shadow.camera.near = .5; sun.shadow.camera.far = 85; sun.shadow.bias = -.00025; sun.shadow.normalBias = .035; sun.shadow.radius = 3;
    this.scene.add(sun); this.scene.add(new THREE.AmbientLight(0xe7f2ee, .35));
    this.scene.add(this.world);
    const gtx = grassTexture(), stx = sandTexture(); this.bump = ballTexture(); this.contact = shadowTexture();
    [gtx, stx, this.bump, this.contact].forEach(t => this.ownedTextures.add(t));
    this.grass = this.mat({ color: 0xffffff, map: gtx, roughness: .93 });
    this.sand = this.mat({ color: 0xffffff, map: stx, roughness: 1 });
    this.cream = this.mat({ color: palette.cream, roughness: .82 });
    this.dark = this.mat({ color: palette.forest, roughness: .63 });
    this.coral = this.mat({ color: palette.coral, roughness: .55 });
    this.wood = this.mat({ color: 0xa78056, roughness: .83 });
    this.water = new THREE.MeshPhysicalMaterial({ color: palette.water, roughness: .3, metalness: .04, clearcoat: .5, clearcoatRoughness: .32 }); this.ownedMaterials.add(this.water);
    this.leafMaterials = [0x527f49, 0x66934f, 0x83a65d, 0x427b60, 0x9cbb75].map(color => this.mat({ color, roughness: .9, flatShading: true }));
    this.unitBox = this.geo(new THREE.BoxGeometry(1, 1, 1)); this.sphere = this.geo(new THREE.SphereGeometry(1, 24, 16)); this.leafGeometry = this.geo(new THREE.IcosahedronGeometry(1, 1)); this.cylinder = this.geo(new THREE.CylinderGeometry(1, 1, 1, 12));
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xfff8d9, transparent: true, opacity: .88 }); this.ownedMaterials.add(dotMat);
    this.aimDots = new THREE.InstancedMesh(this.geo(new THREE.SphereGeometry(.047, 8, 6)), dotMat, 72); this.aimDots.count = 0; this.aimDots.frustumCulled = false; this.scene.add(this.aimDots);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff8df, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }); this.ownedMaterials.add(ringMat);
    this.aimEnd = new THREE.Mesh(this.geo(new THREE.RingGeometry(.19, .235, 40)), ringMat); this.aimEnd.rotation.x = -Math.PI / 2; this.aimEnd.visible = false; this.scene.add(this.aimEnd);
    this.activeRing = new THREE.Mesh(this.geo(new THREE.RingGeometry(.31, .36, 48)), ringMat); this.activeRing.rotation.x = -Math.PI / 2; this.activeRing.visible = false; this.scene.add(this.activeRing);
    const trailMat = new THREE.LineBasicMaterial({ color: 0xfff9d7, transparent: true, opacity: .32, depthWrite: false }); this.ownedMaterials.add(trailMat);
    const trailGeometry = this.geo(new THREE.BufferGeometry()); trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)); trailGeometry.setDrawRange(0, 0); this.trail = new THREE.Line(trailGeometry, trailMat); this.trail.frustumCulled = false; this.trail.visible = false; this.scene.add(this.trail);
    this.sharedGeometry = new Set(this.ownedGeometry); this.sharedMaterials = new Set(this.ownedMaterials); this.sharedTextures = new Set(this.ownedTextures);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown); canvas.addEventListener('pointermove', this.onPointerMove); canvas.addEventListener('pointerup', this.onPointerUp); canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('contextmenu', this.contextMenu); canvas.addEventListener('wheel', this.wheel, { passive: false }); canvas.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('keydown', this.keyDown);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(container); this.resize();
    this.request = requestAnimationFrame(this.tick); callbacks.onReady?.();
  }

  private mat(options: THREE.MeshStandardMaterialParameters) { const m = new THREE.MeshStandardMaterial(options); this.ownedMaterials.add(m); return m; }
  private geo<T extends THREE.BufferGeometry>(g: T): T { this.ownedGeometry.add(g); return g; }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.world) { const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  private box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D = this.world, round = false) {
    const m = this.mesh(round ? this.geo(new RoundedBoxGeometry(w, h, d, 2, Math.min(.07, w / 6, h / 6, d / 6))) : this.unitBox, material, parent);
    if (!round) m.scale.set(w, h, d); m.position.set(x, y, z); return m;
  }
  private pole(x: number, y: number, z: number, r: number, h: number, material: THREE.Material, parent: THREE.Object3D = this.world) { const m = this.mesh(this.cylinder, material, parent); m.position.set(x, y + h / 2, z); m.scale.set(r, h, r); return m; }
  private releaseGeometry(geometry: THREE.BufferGeometry) {
    if (!this.sharedGeometry.has(geometry) && this.ownedGeometry.delete(geometry)) geometry.dispose();
  }
  private releaseMaterial(material: THREE.Material) {
    if (this.sharedMaterials.has(material) || !this.ownedMaterials.delete(material)) return;
    for (const value of Object.values(material)) if (value instanceof THREE.Texture && !this.sharedTextures.has(value) && this.ownedTextures.delete(value)) value.dispose();
    material.dispose();
  }
  private releaseBall(id: string, view: BallView) {
    this.scene.remove(view.mesh, view.shadow);
    this.releaseMaterial(view.mesh.material as THREE.Material); this.releaseMaterial(view.shadow.material as THREE.Material);
    this.releaseGeometry(view.shadow.geometry); this.balls.delete(id); this.playback.delete(id);
  }
  private clearWorld() {
    this.world.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      this.releaseGeometry(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) this.releaseMaterial(material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.world.clear(); this.animated = []; this.foliage = []; this.ripples = []; this.flag = undefined;
    for (const [id, view] of this.balls) this.releaseBall(id, view);
    for (const particle of this.particles) { this.scene.remove(particle.mesh); this.releaseGeometry(particle.mesh.geometry); }
    this.particles = []; this.playback.clear(); this.trailPoints = []; this.trail.visible = false; this.cancelAim();
  }

  setHole(hole: Hole) {
    this.clearWorld(); this.hole = hole; this.zoom = 1; this.warmup = true;
    this.yaw = Math.atan2(hole.start.x - hole.cup.x, hole.start.z - hole.cup.z) + .52; this.pitch = .86;
    this.buildLandscape(hole);
    for (const floor of hole.floors) this.buildFloor(floor);
    for (const wall of hole.walls) {
      const dx = wall.bx - wall.ax, dz = wall.bz - wall.az, length = Math.hypot(dx, dz);
      const g = new THREE.Group(); g.position.set((wall.ax + wall.bx) / 2, wall.y, (wall.az + wall.bz) / 2); g.rotation.y = -Math.atan2(dz, dx); this.world.add(g);
      this.box(0, wall.height / 2 - .035, 0, length + .02, wall.height + .07, .13, this.cream, g, true);
      this.box(0, wall.height + .008, 0, length + .04, .055, .17, this.cream, g, true);
      this.box(0, .055, 0, length, .045, .135, this.wood, g);
      if (length > 2) for (let x = -length / 2 + .9; x < length / 2; x += 1.8) this.box(x, wall.height / 2, 0, .014, wall.height - .08, .135, this.mat({ color: 0xd2c2a5, roughness: 1 }), g);
    }
    for (const patch of hole.sand) {
      const g = new THREE.PlaneGeometry(patch.w, patch.d, 8, 8); g.rotateX(-Math.PI / 2); const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, (sampleHeight(hole, patch.x + pos.getX(i), patch.z + pos.getZ(i)) ?? -3) + .012);
      g.computeVertexNormals(); const m = this.mesh(this.geo(g), this.sand); m.position.set(patch.x, 0, patch.z); m.castShadow = false;
    }
    for (const obstacle of hole.obstacles) this.buildObstacle(obstacle);
    this.buildCup(hole); this.buildTee(hole);
    this.updateCamera(1); this.renderer.render(this.scene, this.camera);
  }

  private buildFloor(f: FloorRect) {
    const slab = new THREE.BoxGeometry(f.w + .12, .48, f.d + .12), positions = slab.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + (f.slopeX || 0) * positions.getX(i) + (f.slopeZ || 0) * positions.getZ(i));
    slab.computeVertexNormals(); const base = this.mesh(this.geo(slab), this.cream); base.position.set(f.x, f.y - .25, f.z);
    const g = new THREE.PlaneGeometry(f.w, f.d, 1, 1); g.rotateX(-Math.PI / 2); const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) { p.setY(i, (f.slopeX || 0) * p.getX(i) + (f.slopeZ || 0) * p.getZ(i)); uv.setXY(i, (p.getX(i) + f.x) / 5, (p.getZ(i) + f.z) / 6); }
    g.computeVertexNormals(); const turf = this.mesh(this.geo(g), this.grass); turf.position.set(f.x, f.y + .003, f.z); turf.castShadow = false;
    // Exposed elevated terraces get architectural supports instead of floating slabs.
    if (f.y > .7 && !f.slopeX && !f.slopeZ) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.box(f.x + sx * (f.w / 2 - .5), (f.y - .6) / 2 - .35, f.z + sz * (f.d / 2 - .55), .48, f.y + .1, .48, this.cream, this.world, true);
      }
    }
  }

  private buildLandscape(hole: Hole) {
    const random = rng(400 + hole.id * 1337), b = hole.bounds, rx = b.w / 2 + 4.5, rz = b.d / 2 + 3.5;
    const shape = new THREE.Shape();
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, wobble = 1 + Math.sin(a * 5 + .4) * .028 + Math.sin(a * 9) * .014; const x = b.x + Math.cos(a) * rx * wobble, z = b.z + Math.sin(a) * rz * wobble; if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z); } shape.closePath();
    for (const w of hole.water) { const p = new THREE.Path(); p.moveTo(w.x - w.w / 2, -w.z - w.d / 2); p.lineTo(w.x - w.w / 2, -w.z + w.d / 2); p.lineTo(w.x + w.w / 2, -w.z + w.d / 2); p.lineTo(w.x + w.w / 2, -w.z - w.d / 2); p.closePath(); shape.holes.push(p); }
    const landMat = this.mat({ color: hole.theme === 'coast' ? 0x91b476 : 0x8eae6c, roughness: 1, flatShading: false });
    const cliffMat = this.mat({ color: 0xd8c8a8, roughness: 1 });
    const land = new THREE.Mesh(this.geo(new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: true, bevelThickness: .18, bevelSize: .17, bevelSegments: 3, curveSegments: 6, steps: 1 })), [landMat, cliffMat]); land.rotation.x = -Math.PI / 2; land.position.y = -2.14; land.receiveShadow = true; land.castShadow = true; this.world.add(land);
    const sea = this.mesh(this.geo(new THREE.PlaneGeometry(300, 300, 1, 1)), this.mat({ color: 0xb7d7cd, roughness: .9 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -2.15; sea.castShadow = false;
    for (const w of hole.water) {
      const water = this.mesh(this.geo(new THREE.PlaneGeometry(w.w + .04, w.d + .04)), this.water); water.rotation.x = -Math.PI / 2; water.position.set(w.x, -.92, w.z); water.castShadow = false;
      for (let i = 0; i < 6; i++) { const ring = this.mesh(this.geo(new THREE.RingGeometry(.3 + random() * .5, .315 + random() * .5, 48)), new THREE.MeshBasicMaterial({ color: 0xb8e0cb, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false })); this.ownedMaterials.add(ring.material as THREE.Material); ring.rotation.x = -Math.PI / 2; ring.position.set(w.x + (random() - .5) * (w.w - 1), -.905, w.z + (random() - .5) * (w.d - 1)); ring.userData.phase = random() * TAU; ring.userData.base = .5 + random(); ring.castShadow = false; this.ripples.push(ring); }
    }
    // Small sculpted trees occupy the rough, never the playable turf.
    const outside = (x: number, z: number, pad = .6) => !hole.floors.some(f => Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad) && !hole.water.some(w => Math.abs(x - w.x) < w.w / 2 + .3 && Math.abs(z - w.z) < w.d / 2 + .3);
    for (let i = 0, placed = 0; i < 220 && placed < 18; i++) { const a = random() * TAU, r = .65 + random() * .23; const x = b.x + Math.cos(a) * rx * r, z = b.z + Math.sin(a) * rz * r; if (!outside(x, z, 1.2)) continue; this.buildTree(x, z, .65 + random() * .62, random, placed++); }
    // Instanced blades and meadow flowers add texture with two inexpensive draw calls.
    const blades = new THREE.InstancedMesh(this.geo(new THREE.ConeGeometry(.045, .24, 3)), this.mat({ color: 0x688f4c, roughness: 1, flatShading: true }), 1600);
    const flowerGeo = this.geo(new THREE.IcosahedronGeometry(.065, 0));
    const blooms = new THREE.InstancedMesh(flowerGeo, this.mat({ color: 0xffedc1, roughness: 1 }), 260);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), scale = new THREE.Vector3(); let n = 0, nf = 0;
    for (let i = 0; i < 6000 && n < 1600; i++) { const x = b.x + (random() * 2 - 1) * rx, z = b.z + (random() * 2 - 1) * rz; if (Math.pow((x - b.x) / rx, 2) + Math.pow((z - b.z) / rz, 2) > .9 || !outside(x, z, .25)) continue; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * TAU); const s = .65 + random(); scale.set(s, s, s); v.set(x, -.64, z); matrix.compose(v, q, scale); blades.setMatrixAt(n++, matrix); if (nf < 260 && random() < .17) { v.y = -.43; scale.setScalar(.65 + random() * .6); matrix.compose(v, q, scale); blooms.setMatrixAt(nf++, matrix); } }
    blades.count = n; blooms.count = nf; blades.receiveShadow = blooms.receiveShadow = true; this.world.add(blades, blooms);
    // Stones, border shrubs, and subtle shoreline break the clean manufactured course edges.
    const stoneMat = this.mat({ color: 0xd0ccba, roughness: .95, flatShading: true });
    for (let i = 0; i < 24; i++) { const a = random() * TAU, x = b.x + Math.cos(a) * rx * .94, z = b.z + Math.sin(a) * rz * .94; const rock = this.mesh(this.leafGeometry, stoneMat); rock.position.set(x, -.83, z); rock.scale.set(.22 + random() * .48, .2 + random() * .32, .2 + random() * .48); rock.rotation.set(random(), random(), random()); }
    this.buildBench(b.x + b.w / 2 + 1.65, b.z + b.d * .18, -.4);
    if (!hole.obstacles.some(o => o.type === 'windmill')) this.buildPavilion(b.x - b.w / 2 - 2.1, b.z - b.d * .3, .68);
    // Course marker, rendered in-world to keep the interface quiet.
    const signX = Math.min(...hole.floors.map(f => f.x - f.w / 2)) - .7, signZ = hole.start.z;
    const sign = new THREE.Group(); sign.position.set(signX, .25, signZ); sign.rotation.y = .1; this.world.add(sign);
    this.pole(0, -.8, 0, .055, 1.05, this.dark, sign);
    this.box(0, .25, 0, .75, .53, .08, this.cream, sign, true);
    const label = texture((c, s) => { c.fillStyle = '#efe2c4'; c.fillRect(0, 0, s, s); c.fillStyle = '#2c5041'; c.font = '600 112px Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(hole.id).padStart(2, '0'), s / 2, s / 2); }, 256); this.ownedTextures.add(label);
    const signMaterial = new THREE.MeshBasicMaterial({ map: label }); this.ownedMaterials.add(signMaterial); const face = this.mesh(this.geo(new THREE.PlaneGeometry(.68, .46)), signMaterial, sign); face.position.set(0, .25, .046); face.castShadow = false;
  }

  private buildTree(x: number, z: number, s: number, random: () => number, variant: number) {
    const group = new THREE.Group(); group.position.set(x, -.65, z); group.scale.setScalar(s); this.world.add(group); this.foliage.push(group); group.userData.phase = random() * TAU;
    this.pole(0, 0, 0, .13, 1.35, this.wood, group);
    for (let j = 0; j < 3; j++) { const branch = this.pole(0, .6 + j * .2, 0, .06, .65, this.wood, group); branch.rotation.z = (j % 2 ? -1 : 1) * .6; branch.rotation.y = j * 2; }
    for (let j = 0; j < 5; j++) { const leaf = this.mesh(this.leafGeometry, this.leafMaterials[(variant + j) % this.leafMaterials.length], group); const a = j * 2.4; leaf.position.set(Math.cos(a) * (j ? .38 : 0), 1.55 + (j % 3) * .3, Math.sin(a) * (j ? .3 : 0)); leaf.scale.set(.65 + random() * .2, .75 + random() * .4, .62 + random() * .2); leaf.rotation.set(random(), random(), random()); }
    if (variant % 4 === 0) for (let j = 0; j < 4; j++) { const fruit = this.mesh(this.sphere, this.coral, group); fruit.scale.setScalar(.09); fruit.position.set(Math.cos(j * 1.7) * .62, 1.65, Math.sin(j * 1.7) * .6); }
  }
  private buildBench(x: number, z: number, rotation: number) {
    const g = new THREE.Group(); g.position.set(x, -.68, z); g.rotation.y = rotation; this.world.add(g);
    for (const xx of [-.65, .65]) { this.box(xx, .26, 0, .07, .52, .68, this.dark, g); this.box(xx, .65, -.27, .07, .85, .07, this.dark, g); }
    for (let i = 0; i < 4; i++) this.box(0, .5, -.24 + i * .16, 1.65, .065, .12, this.wood, g, true);
    for (let i = 0; i < 3; i++) this.box(0, .73 + i * .13, -.29, 1.65, .09, .065, this.wood, g, true);
  }
  private buildPavilion(x: number, z: number, scale: number) {
    const g = new THREE.Group(); g.position.set(x, -.63, z); g.scale.setScalar(scale); this.world.add(g);
    this.box(0, .04, 0, 2.7, .18, 2.7, this.cream, g, true);
    for (const a of [-1, 1]) for (const b of [-1, 1]) this.pole(a * 1.05, .1, b * 1.05, .085, 2.1, this.cream, g);
    const roof = this.mesh(this.geo(new THREE.ConeGeometry(2.25, 1, 4)), this.dark, g); roof.position.y = 2.55; roof.rotation.y = Math.PI / 4;
    this.pole(0, 3, 0, .045, .35, this.cream, g); const finial = this.mesh(this.sphere, this.coral, g); finial.scale.setScalar(.12); finial.position.y = 3.35;
    this.box(0, 1.9, 0, 2.25, .12, 2.25, this.cream, g);
    const table = this.mesh(this.cylinder, this.wood, g); table.scale.set(.65, .1, .65); table.position.y = .85; this.pole(0, .1, 0, .12, .7, this.dark, g);
  }

  private buildObstacle(o: Obstacle) {
    const ground = this.hole ? sampleHeight(this.hole, o.x, o.z) ?? 0 : 0;
    if (o.type === 'bumper') {
      const r = o.radius || .55, g = new THREE.Group(); g.position.set(o.x, ground, o.z); this.world.add(g);
      const bumper = this.mesh(this.geo(new THREE.CylinderGeometry(r * .95, r, .48, 40)), this.coral, g); bumper.position.y = .24;
      const ring = this.mesh(this.geo(new THREE.TorusGeometry(r * .96, .07, 8, 40)), this.cream, g); ring.rotation.x = Math.PI / 2; ring.position.y = .31;
      const top = this.mesh(this.geo(new THREE.CylinderGeometry(r * .84, r * .84, .055, 40)), this.cream, g); top.position.y = .5;
      const center = this.mesh(this.geo(new THREE.CylinderGeometry(r * .42, r * .42, .058, 32)), this.coral, g); center.position.y = .53; return;
    }
    const animated: AnimatedObstacle = { obstacle: o, bars: [] }; this.animated.push(animated);
    for (const seg of getObstacleSegments(o, this.getTime())) {
      const length = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az), g = new THREE.Group(); this.world.add(g); animated.bars.push(g);
      this.box(0, seg.height / 2, 0, length, seg.height, seg.width, o.type === 'tunnel' ? this.cream : this.coral, g, true);
      if (o.type !== 'tunnel') { this.box(0, seg.height * .75, 0, length - .04, .065, seg.width + .014, this.cream, g); for (const side of [-1, 1]) this.pole(side * (length / 2 - .07), seg.height, 0, .045, .07, this.cream, g); }
    }
    if (o.type === 'rotor') {
      this.pole(o.x, ground, o.z, .17, .7, this.cream); const cap = this.mesh(this.sphere, this.dark); cap.position.set(o.x, ground + .72, o.z); cap.scale.set(.19, .1, .19);
    } else if (o.type === 'gate') {
      // A thin overhead rail makes the moving obstacle's route legible.
      const span = (o.length || 3) + 4.1; this.box(o.x, ground + 1.6, o.z, span, .07, .09, this.dark);
      for (const s of [-1, 1]) this.pole(o.x + s * span / 2, ground, o.z, .055, 1.63, this.dark);
    } else if (o.type === 'windmill') {
      const length = o.length || 2.1;
      for (const s of [-1, 1]) this.box(o.x + s * (length / 2 + .16), ground + 1.22, o.z, .22, 2.44, .34, this.cream, this.world, true);
      this.box(o.x, ground + 2.4, o.z, length + .55, .22, .42, this.dark, this.world, true);
      // Working mill sits outside the turf. Its blades and lifting gate share the same clock.
      const mill = new THREE.Group(); mill.position.set(o.x - 4.85, -.64, o.z - .35); this.world.add(mill);
      const body = this.mesh(this.geo(new THREE.CylinderGeometry(.66, 1.1, 3.6, 8)), this.cream, mill); body.position.y = 1.8;
      const roof = this.mesh(this.geo(new THREE.ConeGeometry(1.04, 1.3, 8)), this.dark, mill); roof.position.y = 4.18; roof.rotation.y = Math.PI / 8;
      this.box(0, .7, .99, .5, 1.3, .05, this.dark, mill, true);
      this.box(.42, 2.4, .7, .28, .44, .05, this.dark, mill, true);
      const blades = new THREE.Group(); blades.position.set(0, 3.12, .9); mill.add(blades); animated.blades = blades;
      for (let i = 0; i < 4; i++) { const blade = new THREE.Group(); blade.rotation.z = i * Math.PI / 2; blades.add(blade); this.box(0, 1.02, 0, .09, 2.12, .12, this.wood, blade); this.box(.16, 1.35, .025, .42, 1.2, .07, this.cream, blade); for (let j = 0; j < 6; j++) this.box(.16, .82 + j * .19, .08, .46, .035, .03, this.wood, blade); }
      const hub = this.mesh(this.geo(new THREE.CylinderGeometry(.17, .17, .22, 20)), this.coral, blades); hub.rotation.x = Math.PI / 2;
    } else if (o.type === 'tunnel') {
      const w = o.width || 2.3, length = o.length || 4, outer = w / 2 + .22, inner = w / 2;
      const s = new THREE.Shape(); s.absarc(0, 0, outer, 0, Math.PI, false); s.lineTo(-inner, 0); s.absarc(0, 0, inner, Math.PI, 0, true); s.closePath();
      const roof = this.mesh(this.geo(new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 24 })), this.dark); roof.position.set(o.x, ground + 1.3, o.z - length / 2);
      for (const z of [-1, 1]) { const trim = this.mesh(this.geo(new THREE.ExtrudeGeometry(s, { depth: .14, bevelEnabled: false, curveSegments: 24 })), this.cream); trim.position.set(o.x, ground + 1.3, o.z + z * length / 2 - .07); }
    }
    this.animateObstacles(this.getTime());
  }

  private buildCup(hole: Hole) {
    const y = sampleHeight(hole, hole.cup.x, hole.cup.z) || 0;
    const cup = this.mesh(this.geo(new THREE.CircleGeometry(CUP_RADIUS, 48)), this.mat({ color: 0x193b2b, roughness: 1 })); cup.rotation.x = -Math.PI / 2; cup.position.set(hole.cup.x, y + .012, hole.cup.z); cup.castShadow = false;
    const rim = this.mesh(this.geo(new THREE.RingGeometry(CUP_RADIUS, CUP_RADIUS + .035, 48)), this.cream); rim.rotation.x = -Math.PI / 2; rim.position.set(hole.cup.x, y + .016, hole.cup.z); rim.castShadow = false;
    this.pole(hole.cup.x, y, hole.cup.z, .026, 2.5, this.cream);
    const finial = this.mesh(this.sphere, this.coral); finial.scale.setScalar(.065); finial.position.set(hole.cup.x, y + 2.5, hole.cup.z);
    const flagShape = new THREE.Shape(); flagShape.moveTo(0, 0); flagShape.lineTo(.9, -.22); flagShape.lineTo(0, -.5); flagShape.closePath();
    const flagMat = this.mat({ color: palette.coral, roughness: .8, side: THREE.DoubleSide }); this.flag = this.mesh(this.geo(new THREE.ShapeGeometry(flagShape)), flagMat); this.flag.position.set(hole.cup.x + .035, y + 2.38, hole.cup.z); this.flag.rotation.y = -.3;
  }
  private buildTee(hole: Hole) {
    const y = sampleHeight(hole, hole.start.x, hole.start.z) || 0;
    for (const side of [-1, 1]) { const marker = this.mesh(this.geo(new THREE.CylinderGeometry(.09, .11, .012, 16)), this.cream); marker.position.set(hole.start.x + side * .7, y + .009, hole.start.z); }
    const startRing = this.mesh(this.geo(new THREE.RingGeometry(.35, .37, 48)), this.mat({ color: 0xc5d894, transparent: true, opacity: .75, side: THREE.DoubleSide })); startRing.rotation.x = -Math.PI / 2; startRing.position.set(hole.start.x, y + .009, hole.start.z); startRing.castShadow = false;
  }

  setPlayers(players: ScenePlayer[]) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, view] of this.balls) if (!ids.has(id)) this.releaseBall(id, view);
    for (const p of players) {
      let view = this.balls.get(p.id);
      if (!view) {
        const material = new THREE.MeshPhysicalMaterial({ color: p.color, roughness: .24, metalness: .04, clearcoat: 1, clearcoatRoughness: .18, bumpMap: this.bump, bumpScale: .012, transparent: true }); this.ownedMaterials.add(material);
        const mesh = new THREE.Mesh(this.sphere, material); mesh.scale.setScalar(BALL_RADIUS); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
        const shadowMat = new THREE.MeshBasicMaterial({ map: this.contact, transparent: true, depthWrite: false, opacity: .9 }); this.ownedMaterials.add(shadowMat); const shadow = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(.8, .8)), shadowMat); shadow.rotation.x = -Math.PI / 2; this.scene.add(shadow);
        view = { mesh, shadow, data: p, previous: new THREE.Vector3(p.ball.x, p.ball.y, p.ball.z) }; this.balls.set(p.id, view); mesh.position.copy(view.previous);
      }
      view.data = { ...p, ball: { ...p.ball } };
      (view.mesh.material as THREE.MeshPhysicalMaterial).color.set(p.color);
      if (!this.playback.has(p.id)) { view.mesh.position.set(p.ball.x, p.ball.y, p.ball.z); view.previous.copy(view.mesh.position); view.mesh.visible = !p.ball.sunk && !p.ball.hazard; }
      view.shadow.visible = view.mesh.visible;
    }
  }
  setActive(id: string) { if (this.active === id) return; this.active = id; this.cancelAim(); }
  setMode(mode: 'home' | 'play') { if (this.mode === mode) return; this.mode = mode; this.updateViewOffset(); this.cancelAim(); }
  setCanShoot(enabled: boolean) { this.canShoot = enabled; if (!enabled) this.cancelAim(); this.renderer.domElement.style.cursor = enabled ? 'grab' : 'default'; }
  setCamera(mode: 'follow' | 'overview') { if (this.cameraMode === mode) return; this.cameraMode = mode; this.cancelAim(); }
  setTime(seconds: number) { if (Number.isFinite(seconds)) this.nowOffset = seconds - performance.now() / 1000; }
  getTime() { return performance.now() / 1000 + this.nowOffset; }
  /** Screen position of the active ball in CSS pixels (used by the ?qa=1 browser check). */
  ballScreen() { const v = this.balls.get(this.active); if (!v) return null; const p = v.mesh.position.clone().project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 }; }
  cancelAim() { if (this.pointer?.mode === 'aim') this.callbacks.onAim(0); this.pointer = undefined; this.aimDots.count = 0; this.aimEnd.visible = false; }
  /** Optional elapsed time supports spectators catching an already-running server shot. */
  playTrajectory(id: string, frames: ShotFrame[], done?: () => void, elapsed = 0) {
    this.cancelAim(); this.canShoot = false; this.trailPoints = []; this.trail.visible = false;
    if (frames.length < 2) { done?.(); return; }
    const view = this.balls.get(id); if (view) view.mesh.visible = true;
    this.playback.set(id, { frames, start: performance.now() / 1000 - Math.max(0, elapsed), index: 0, done });
  }

  private updateViewOffset() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (this.mode === 'home' && w > 760) this.camera.setViewOffset(w, h, -w * .16, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  private updateCamera(dt: number) {
    if (!this.hole) return;
    const b = this.hole.bounds, active = this.balls.get(this.active), playing = this.mode === 'play', overview = this.cameraMode === 'overview';
    const y = this.hole.floors.reduce((sum, f) => sum + f.y, 0) / this.hole.floors.length;
    this.look.set(b.x, y, b.z);
    if (playing && !overview && active) this.look.lerp(active.mesh.position, .46);
    const narrow = this.camera.aspect < .85, size = Math.max(b.w * (narrow ? 1.75 : 1.05), b.d * .86, 13);
    const distance = size * (playing ? (overview ? 1.65 : 1.47) : 1.65) * this.zoom;
    const yaw = this.yaw + (this.mode === 'home' ? Math.sin(this.getTime() * .055) * .09 : 0), pitch = overview ? 1.44 : this.pitch;
    this.desiredCamera.set(this.look.x + Math.sin(yaw) * Math.cos(pitch) * distance, this.look.y + Math.sin(pitch) * distance, this.look.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    const a = this.warmup ? 1 : 1 - Math.exp(-dt * 5);
    if (this.pointer?.mode !== 'aim') { this.currentLook.lerp(this.look, a); this.camera.position.lerp(this.desiredCamera, a); this.camera.lookAt(this.currentLook); }
    this.warmup = false;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.disposed || !this.hole) return; event.preventDefault();
    this.renderer.domElement.setPointerCapture(event.pointerId); this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size > 1) { this.cancelAim(); this.resetTouchGesture(); return; }
    const view = this.balls.get(this.active); const r = this.renderer.domElement.getBoundingClientRect(); let nearBall = false;
    if (view) { const screen = view.mesh.position.clone().project(this.camera); const sx = r.left + (screen.x + 1) * r.width / 2, sy = r.top + (1 - screen.y) * r.height / 2; nearBall = Math.hypot(event.clientX - sx, event.clientY - sy) < (event.pointerType === 'touch' ? 105 : 85); }
    const aiming = event.button === 0 && this.canShoot && this.mode === 'play' && view && nearBall && !this.playback.size;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, mode: aiming ? 'aim' : 'orbit', angle: 0, power: 0 };
    if (aiming) this.renderer.domElement.style.cursor = 'grabbing';
  };
  private onPointerMove = (event: PointerEvent) => {
    if (this.touches.has(event.pointerId)) this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size > 1) {
      event.preventDefault(); const p = [...this.touches.values()]; const span = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const centroid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      if (this.previousTouchSpan > 0) this.zoom = clamp(this.zoom * this.previousTouchSpan / Math.max(span, 10), .65, 1.65);
      if (this.touchCentroid) { this.yaw -= (centroid.x - this.touchCentroid.x) * .006; this.pitch = clamp(this.pitch + (centroid.y - this.touchCentroid.y) * .004, .48, 1.35); }
      this.previousTouchSpan = span; this.touchCentroid = centroid; return;
    }
    const p = this.pointer; if (!p || p.id !== event.pointerId) return; event.preventDefault();
    if (p.mode === 'orbit') { this.yaw -= (event.clientX - p.lastX) * .006; this.pitch = clamp(this.pitch + (event.clientY - p.lastY) * .004, .48, 1.35); p.lastX = event.clientX; p.lastY = event.clientY; return; }
    const view = this.balls.get(this.active); if (!view || !this.hole) return;
    const dx = event.clientX - p.x, dy = event.clientY - p.y; p.power = clamp(Math.hypot(dx, dy) / (this.camera.aspect < .85 ? 155 : 205), 0, 1);
    const screen = view.mesh.position.clone().project(this.camera), rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(screen.x + dx / rect.width * 2, screen.y - dy / rect.height * 2); this.ray.setFromCamera(mouse, this.camera); this.plane.set(new THREE.Vector3(0, 1, 0), -view.mesh.position.y);
    if (this.ray.ray.intersectPlane(this.plane, this.temp)) { p.angle = Math.atan2(view.mesh.position.x - this.temp.x, view.mesh.position.z - this.temp.z); }
    this.callbacks.onAim(p.power);
    const now = performance.now(); if (now - this.previewAt > 65) { this.previewAt = now; this.showPreview(view.data.ball, p.angle, p.power); }
  };
  private resetTouchGesture() {
    this.previousTouchSpan = 0; this.touchCentroid = undefined;
    if (this.touches.size > 1) {
      const p = [...this.touches.values()]; this.previousTouchSpan = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      this.touchCentroid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    } else if (this.touches.size === 1) {
      const [id, p] = [...this.touches.entries()][0];
      this.pointer = { id, x: p.x, y: p.y, lastX: p.x, lastY: p.y, mode: 'orbit', angle: 0, power: 0 };
    }
  }
  private onPointerUp = (event: PointerEvent) => {
    const wasMulti = this.touches.size > 1; this.touches.delete(event.pointerId);
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    if (wasMulti) { this.cancelAim(); this.resetTouchGesture(); return; }
    this.previousTouchSpan = 0; this.touchCentroid = undefined;
    const p = this.pointer; if (!p || p.id !== event.pointerId) return;
    const shot = p.mode === 'aim' && p.power > .025 && this.canShoot; const angle = p.angle, power = p.power; this.cancelAim();
    this.renderer.domElement.style.cursor = this.canShoot ? 'grab' : 'default'; if (shot) this.callbacks.onShot(angle, power);
  };
  private onPointerCancel = (event: PointerEvent) => {
    this.touches.delete(event.pointerId);
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    this.cancelAim(); this.resetTouchGesture();
  };
  private showPreview(ball: Ball, angle: number, power: number) {
    if (!this.hole || power < .015) { this.aimDots.count = 0; this.aimEnd.visible = false; return; }
    const result = simulateShot(this.hole, ball, angle, power, this.getTime()); const matrix = new THREE.Matrix4(); let count = 0, distance = 0, last = result.frames[0];
    for (let i = 1; i < result.frames.length && count < 72; i++) {
      const frame = result.frames[i]; distance += Math.hypot(frame.x - last.x, frame.z - last.z); if (distance < .22) continue; distance = 0; last = frame;
      if (frame.y < -.1 || frame.t > 2.8) break; const s = Math.max(.4, 1 - count / 95); matrix.makeScale(s, s, s); matrix.setPosition(frame.x, frame.y + .055, frame.z); this.aimDots.setMatrixAt(count++, matrix);
    }
    this.aimDots.count = count; this.aimDots.instanceMatrix.needsUpdate = true;
    const end = result.frames[result.frames.length - 1]; this.aimEnd.visible = result.outcome !== 'water';
    if (this.aimEnd.visible) this.aimEnd.position.set(end.x, (sampleHeight(this.hole, end.x, end.z) || 0) + .035, end.z);
  }

  private animateObstacles(time: number) {
    for (const a of this.animated) { const segments = getObstacleSegments(a.obstacle, time); for (let i = 0; i < segments.length; i++) { const s = segments[i], g = a.bars[i]; if (!g) continue; g.position.set((s.ax + s.bx) / 2, s.y, (s.az + s.bz) / 2); g.rotation.y = -Math.atan2(s.bz - s.az, s.bx - s.ax); } if (a.blades) a.blades.rotation.z = time * (a.obstacle.speed || 1) + (a.obstacle.phase || 0); }
  }
  private burst(x: number, y: number, z: number) {
    const random = rng(Math.floor(performance.now()));
    for (let i = 0; i < 22; i++) { const mesh = this.mesh(this.geo(new THREE.IcosahedronGeometry(.035 + random() * .025, 0)), i % 3 === 0 ? this.coral : this.cream, this.scene); mesh.position.set(x, y + .1, z); this.particles.push({ mesh, vx: (random() - .5) * 2.2, vy: 1.8 + random() * 1.8, vz: (random() - .5) * 2.2, life: 1 }); }
  }
  private tick = (now: number) => {
    if (this.disposed) return; const dt = Math.min((now - this.last) / 1000, .05); this.last = now; const time = this.getTime();
    this.animateObstacles(time);
    if (this.flag) this.flag.rotation.y = -.35 + Math.sin(time * 2.4) * .12;
    for (const tree of this.foliage) tree.rotation.z = Math.sin(time * .8 + tree.userData.phase) * .008;
    for (const ripple of this.ripples) { const phase = ((time * .2 + ripple.userData.phase) % 1); ripple.scale.setScalar(ripple.userData.base * (1 + phase * 1.2)); (ripple.material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI) * .2; }
    const completed: (() => void)[] = [];
    for (const [id, p] of this.playback) {
      const view = this.balls.get(id); const elapsed = now / 1000 - p.start; const frames = p.frames;
      while (p.index < frames.length - 2 && frames[p.index + 1].t < elapsed) p.index++;
      const a = frames[p.index], b = frames[Math.min(p.index + 1, frames.length - 1)], t = clamp((elapsed - a.t) / Math.max(.0001, b.t - a.t), 0, 1);
      if (view) { view.mesh.position.set(THREE.MathUtils.lerp(a.x, b.x, t), THREE.MathUtils.lerp(a.y, b.y, t), THREE.MathUtils.lerp(a.z, b.z, t)); view.mesh.visible = true;
        if (id === this.active) { this.trailPoints.push(view.mesh.position.clone()); if (this.trailPoints.length > 24) this.trailPoints.shift(); const attr = this.trail.geometry.getAttribute('position'); for (let j = 0; j < this.trailPoints.length; j++) { const point = this.trailPoints[j]; attr.setXYZ(j, point.x, point.y, point.z); } attr.needsUpdate = true; this.trail.geometry.setDrawRange(0, this.trailPoints.length); this.trail.visible = this.trailPoints.length > 2; }
      }
      if (elapsed >= frames[frames.length - 1].t) { this.playback.delete(id); this.trail.visible = false; const end = frames[frames.length - 1]; if (this.hole && Math.hypot(end.x - this.hole.cup.x, end.z - this.hole.cup.z) < CUP_RADIUS && end.y < (sampleHeight(this.hole, end.x, end.z) || 0)) { this.burst(end.x, end.y + .4, end.z); if (view) view.mesh.visible = false; } if (p.done) completed.push(p.done); }
    }
    const activeView = this.balls.get(this.active);
    for (const [id, view] of this.balls) {
      const inactive = id !== this.active && this.mode === 'play';
      const overlapsActive = inactive && activeView && (this.playback.has(this.active) || (!activeView.data.ball.sunk && !activeView.data.ball.hazard)) && view.mesh.position.distanceToSquared(activeView.mesh.position) < BALL_RADIUS * BALL_RADIUS * 4.41;
      view.mesh.visible = (this.playback.has(id) || (!view.data.ball.sunk && !view.data.ball.hazard)) && !overlapsActive;
      const material = view.mesh.material as THREE.MeshPhysicalMaterial; material.opacity = inactive ? .55 : 1; material.depthWrite = !inactive; view.mesh.renderOrder = inactive ? 2 : 3; view.mesh.castShadow = !inactive;
      this.temp.subVectors(view.mesh.position, view.previous); const dist = Math.hypot(this.temp.x, this.temp.z); if (dist > .0001 && dist < 1) { this.axis.set(this.temp.z, 0, -this.temp.x).normalize(); view.mesh.rotateOnWorldAxis(this.axis, dist / BALL_RADIUS); } view.previous.copy(view.mesh.position);
      const ground = this.hole ? sampleHeight(this.hole, view.mesh.position.x, view.mesh.position.z) : null;
      view.shadow.position.set(view.mesh.position.x, (ground ?? -.8) + .025, view.mesh.position.z); const h = Math.max(0, view.mesh.position.y - (ground ?? 0) - BALL_RADIUS); view.shadow.scale.setScalar(1 + h * .5); (view.shadow.material as THREE.MeshBasicMaterial).opacity = (inactive ? .35 : .85) / (1 + h * 2); view.shadow.visible = view.mesh.visible && ground !== null;
    }
    const active = this.balls.get(this.active); this.activeRing.visible = !!active && this.canShoot && !this.playback.size && this.mode === 'play' && active.mesh.visible;
    if (active) { this.activeRing.position.set(active.mesh.position.x, active.mesh.position.y - BALL_RADIUS + .026, active.mesh.position.z); this.activeRing.scale.setScalar(1 + Math.sin(time * 3) * .06); }
    for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.life -= dt; p.vy -= dt * 4; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.mesh.scale.setScalar(Math.max(0, p.life)); if (p.life <= 0) { this.scene.remove(p.mesh); this.releaseGeometry(p.mesh.geometry); this.particles.splice(i, 1); } }
    this.updateCamera(dt); this.renderer.render(this.scene, this.camera); this.request = requestAnimationFrame(this.tick); for (const done of completed) done();
  };

  dispose() {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.request); this.observer.disconnect(); window.removeEventListener('keydown', this.keyDown);
    const c = this.renderer.domElement; c.removeEventListener('pointerdown', this.onPointerDown); c.removeEventListener('pointermove', this.onPointerMove); c.removeEventListener('pointerup', this.onPointerUp); c.removeEventListener('pointercancel', this.onPointerCancel); c.removeEventListener('contextmenu', this.contextMenu); c.removeEventListener('wheel', this.wheel); c.removeEventListener('webglcontextlost', this.contextLost);
    this.clearWorld(); this.touches.clear(); for (const g of this.ownedGeometry) g.dispose(); for (const m of this.ownedMaterials) m.dispose(); for (const t of this.ownedTextures) t.dispose(); this.renderer.dispose(); c.remove(); this.scene.clear();
  }
}

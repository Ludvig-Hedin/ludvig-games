import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type RoundView = {
  phase: 'idle' | 'locked' | 'reveal' | 'result';
  moves?: [number, number];
  winner?: number | null;
};

type Piece = {
  root: THREE.Group;
  mesh: THREE.Group;
  home: THREE.Vector3;
  angle: THREE.Euler;
  index: number;
};

const LIME = 0xc8f86a;
const IVORY = 0xefeee7;
const clamp = THREE.MathUtils.clamp;
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Live, dependency-free artwork: every object, material and animation is generated locally. */
export class Arena {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-4.4, 4.4, 3, -3, 0.1, 45);
  private stage = new THREE.Group();
  private homeGroup = new THREE.Group();
  private gameGroup = new THREE.Group();
  private heroPieces: Piece[] = [];
  private playerPieces: Piece[][] = [[], []];
  private seals: THREE.Group[] = [];
  private sealedRings: THREE.Mesh[] = [];
  private winRings: THREE.Mesh[] = [];
  private sparks: THREE.Points | null = null;
  private sparkOrigins: Float32Array | null = null;
  private particles: THREE.Points | null = null;
  private mode: 'home' | 'game' = 'home';
  private round: RoundView = { phase: 'idle' };
  private reducedMotion = false;
  private hover: number | null = null;
  private revealAt = 0;
  private clock = 0;
  private lastFrame = 0;
  private raf = 0;
  private alive = true;
  private intersecting = true;
  private contextLost = false;
  private width = 0;
  private height = 0;
  private observer: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;
  private textures: THREE.Texture[] = [];
  private environment: THREE.WebGLRenderTarget | null = null;
  private fallback: HTMLDivElement | null = null;
  private pointer = new THREE.Vector2();

  constructor(container: HTMLElement, options: { reducedMotion?: boolean } = {}) {
    this.container = container;
    this.reducedMotion = !!options.reducedMotion;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setClearColor(0x111210, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.3;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const canvas = this.renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.touchAction = 'pan-y';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored);
      container.appendChild(canvas);
      this.hideLoadingArt();

      this.camera.position.set(0, 4.1, 9.7);
      this.camera.lookAt(0, 0.45, 0);
      this.scene.add(this.stage);
      this.scene.add(this.homeGroup);
      this.scene.add(this.gameGroup);
      this.gameGroup.visible = false;
      this.makeLights();
      this.makeStage();
      this.makePieces();
      this.makeParticles();
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(container);
      if ('IntersectionObserver' in window) {
        this.intersection = new IntersectionObserver(([entry]) => {
          this.intersecting = entry.isIntersecting;
          if (this.intersecting) this.resume();
        }, { rootMargin: '100px' });
        this.intersection.observe(container);
      }
      document.addEventListener('visibilitychange', this.onVisibility);
      container.addEventListener('pointermove', this.onPointerMove, { passive: true });
      container.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      this.resize();
      this.resume();
    } catch {
      this.renderer?.dispose();
      this.renderer?.domElement.remove();
      this.renderer = null;
      this.showFallback();
    }
  }

  setMode(mode: 'home' | 'game') {
    this.mode = mode;
    this.homeGroup.visible = mode === 'home';
    this.gameGroup.visible = mode === 'game';
    this.hover = null;
    if (mode === 'game') this.setRound({ phase: 'idle' });
    this.updateFallback();
    this.resume();
  }

  setRound(round: RoundView) {
    const isReveal = round.phase === 'reveal' && this.round.phase !== 'reveal';
    const changedMoves = JSON.stringify(round.moves) !== JSON.stringify(this.round.moves);
    if (isReveal || (round.phase === 'result' && changedMoves)) this.revealAt = this.clock;
    this.round = { ...round, moves: round.moves ? [...round.moves] as [number, number] : undefined };
    const shown = round.phase === 'reveal' || round.phase === 'result';
    for (let side = 0; side < 2; side++) {
      if (this.seals[side]) this.seals[side].visible = !shown;
      this.playerPieces[side].forEach((piece, move) => { piece.root.visible = shown && round.moves?.[side] === move; });
    }
    this.updateFallback();
    this.resume();
  }

  setHover(move: number | null) {
    this.hover = move;
    this.resume();
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    this.resume();
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.intersection?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.textures.forEach(t => t.dispose());
    this.environment?.dispose();
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.fallback?.remove();
    this.container.querySelector<HTMLElement>('.arena-loading')?.style.removeProperty('display');
  }

  private makeLights() {
    this.scene.add(new THREE.HemisphereLight(0xe3e7d9, 0x1c251a, 1.9));
    const key = new THREE.DirectionalLight(0xfff4df, 4.1);
    key.position.set(-3.8, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d5f0, 1.7);
    fill.position.set(4, 2, 2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd4ff9e, 2.6);
    rim.position.set(0, 4, -4);
    this.scene.add(rim);
    if (this.renderer) {
      const environmentScene = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromScene(environmentScene, 0.04);
      this.scene.environment = this.environment.texture;
      this.scene.environmentIntensity = 0.65;
      environmentScene.dispose();
      pmrem.dispose();
    }
  }

  private material(options: THREE.MeshPhysicalMaterialParameters) {
    return new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.25, ...options });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, castShadow = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private makeStage() {
    const base = this.mesh(new THREE.CylinderGeometry(3.42, 3.48, 0.28, 96), this.material({ color: 0x20231f, roughness: 0.7, metalness: 0.3 }), this.stage, false);
    base.position.y = -0.38;
    const lip = this.mesh(new THREE.CylinderGeometry(3.4, 3.42, 0.055, 96), this.material({ color: 0x353b2f, roughness: 0.4, metalness: 0.65 }), this.stage, false);
    lip.position.y = -0.207;
    const face = this.mesh(new THREE.CylinderGeometry(3.37, 3.37, 0.045, 96), this.material({ color: 0x252923, roughness: 0.87, metalness: 0.12 }), this.stage, false);
    face.position.y = -0.16;
    const rim = this.mesh(new THREE.TorusGeometry(3.405, 0.012, 8, 128), this.material({ color: LIME, emissive: LIME, emissiveIntensity: 0.45, roughness: 0.4 }), this.stage, false);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.225;
    const etched = this.mesh(new THREE.RingGeometry(2.97, 2.976, 96), new THREE.MeshBasicMaterial({ color: 0x626957, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }), this.stage, false);
    etched.rotation.x = -Math.PI / 2;
    etched.position.y = -0.135;
    const outer = this.mesh(new THREE.RingGeometry(3.74, 3.75, 128), new THREE.MeshBasicMaterial({ color: 0x4b5143, side: THREE.DoubleSide, transparent: true, opacity: 0.3 }), this.stage, false);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.4;

    // The low-contrast tick marks make the arena feel like a designed physical object.
    const markMat = new THREE.MeshBasicMaterial({ color: 0x929b81, transparent: true, opacity: 0.35 });
    for (let n = 0; n < 48; n++) {
      const angle = n / 48 * Math.PI * 2;
      const length = n % 4 === 0 ? 0.12 : 0.055;
      const mark = this.mesh(new THREE.BoxGeometry(0.014, 0.002, length), markMat, this.stage, false);
      mark.position.set(Math.sin(angle) * 3.16, -0.133, Math.cos(angle) * 3.16);
      mark.rotation.y = angle;
    }
  }

  private makePieces() {
    const positions = [new THREE.Vector3(-1.94, 0.95, 0.15), new THREE.Vector3(0, 1.18, -0.19), new THREE.Vector3(1.94, 1.12, 0.1)];
    const angles = [new THREE.Euler(0.12, 0.4, -0.15), new THREE.Euler(-0.18, -0.32, -0.17), new THREE.Euler(-0.12, 0.28, 0.2)];
    for (let move = 0; move < 3; move++) {
      const root = new THREE.Group();
      const mesh = this.makeObject(move);
      root.add(mesh);
      mesh.rotation.copy(angles[move]);
      root.position.copy(positions[move]);
      this.homeGroup.add(root);
      this.heroPieces.push({ root, mesh, home: positions[move], angle: angles[move], index: move });
      this.makeSpot(positions[move].x, positions[move].z, 0.76, this.homeGroup, move === 1);
    }
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? -1.65 : 1.65;
      this.makeSpot(x, 0, 1.1, this.gameGroup, false);
      for (let move = 0; move < 3; move++) {
        const root = new THREE.Group();
        const mesh = this.makeObject(move);
        root.add(mesh);
        const angle = new THREE.Euler(-0.1, side === 0 ? 0.25 : -0.25, side === 0 ? -0.12 : 0.12);
        mesh.rotation.copy(angle);
        root.position.set(x, 1.1, 0);
        root.scale.setScalar(1.1);
        root.visible = false;
        this.gameGroup.add(root);
        this.playerPieces[side].push({ root, mesh, home: root.position.clone(), angle, index: move });
      }
      const seal = this.makeSeal(side);
      seal.position.set(x, 1.05, 0);
      this.seals.push(seal);
      this.gameGroup.add(seal);
      const ring = this.mesh(new THREE.RingGeometry(0.98, 1.025, 80), new THREE.MeshBasicMaterial({ color: side === 0 ? LIME : 0xefeee7, side: THREE.DoubleSide, transparent: true, opacity: 0 }), this.gameGroup, false);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, -0.09, 0);
      this.winRings.push(ring);
    }
  }

  private makeSpot(x: number, z: number, radius: number, parent: THREE.Group, emphasis: boolean) {
    const top = this.mesh(new THREE.CylinderGeometry(radius, radius + 0.02, 0.08, 64), this.material({ color: 0x2c3028, roughness: 0.75 }), parent, false);
    top.position.set(x, -0.09, z);
    const line = this.mesh(new THREE.TorusGeometry(radius + 0.015, 0.007, 6, 80), new THREE.MeshBasicMaterial({ color: emphasis ? 0x858d73 : 0x515947 }), parent, false);
    line.position.set(x, -0.038, z);
    line.rotation.x = Math.PI / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(0,0,0,.53)');
      gradient.addColorStop(0.45, 'rgba(0,0,0,.3)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      this.textures.push(texture);
      const contact = this.mesh(new THREE.PlaneGeometry(radius * 2.5, radius * 2.5), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), parent, false);
      contact.rotation.x = -Math.PI / 2;
      contact.position.set(x, -0.044, z);
    }
  }

  private makeObject(move: number) {
    if (move === 0) return this.makeRock();
    if (move === 1) return this.makePaper();
    return this.makeScissors();
  }

  private makeRock() {
    const group = new THREE.Group();
    const geometry = new THREE.IcosahedronGeometry(0.79, 2);
    const points = geometry.attributes.position;
    const colors = [];
    const shade = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const displacement = 1 + 0.11 * Math.sin(x * 8.2 + y * 5.1) * Math.cos(z * 6.8 - x * 2) + 0.065 * Math.sin(y * 9 + z * 4);
      points.setXYZ(i, x * displacement * 1.04, y * displacement * 0.93, z * displacement);
      const tone = clamp(0.88 + 0.08 * Math.sin(x * 13 + z * 17) + 0.07 * Math.cos(y * 19), 0.72, 1);
      shade.setRGB(tone, tone, tone * 0.98);
      colors.push(shade.r, shade.g, shade.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    this.mesh(geometry, this.material({ color: 0x8f9588, roughness: 0.58, metalness: 0.37, clearcoat: 0.2, clearcoatRoughness: 0.5, vertexColors: true, flatShading: true }), group);
    return group;
  }

  private makePaper() {
    const group = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-0.57, -0.78);
    shape.lineTo(0.57, -0.78);
    shape.lineTo(0.57, 0.48);
    shape.lineTo(0.28, 0.8);
    shape.lineTo(-0.57, 0.8);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.016, bevelThickness: 0.012, curveSegments: 8 });
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), y = points.getY(i);
      points.setZ(i, points.getZ(i) + 0.085 * Math.sin(y * 2.2) + 0.08 * x * x);
    }
    geometry.computeVertexNormals();
    this.mesh(geometry, this.material({ color: IVORY, roughness: 0.62, metalness: 0.02, clearcoat: 0.12, side: THREE.DoubleSide }), group);
    const fold = new THREE.Shape();
    fold.moveTo(0.27, 0.79);
    fold.lineTo(0.27, 0.48);
    fold.lineTo(0.56, 0.48);
    fold.closePath();
    const foldedCorner = this.mesh(new THREE.ExtrudeGeometry(fold, { depth: 0.016, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), this.material({ color: 0xc6c9b8, roughness: 0.58, metalness: 0.08 }), group);
    foldedCorner.position.z = 0.12;
    const ink = this.material({ color: 0x9da28b, roughness: 0.72, metalness: 0.02 });
    for (let i = 0; i < 4; i++) {
      const y = 0.21 - i * 0.2;
      const width = i === 3 ? 0.44 : 0.72;
      const line = this.mesh(new THREE.BoxGeometry(width, 0.018, 0.008), ink, group, false);
      line.position.set(-0.35 + width / 2, y, 0.056 + 0.085 * Math.sin(y * 2.2));
    }
    return group;
  }

  private makeScissors() {
    const group = new THREE.Group();
    const steel = this.material({ color: 0xd6ded6, roughness: 0.23, metalness: 0.92, clearcoat: 0.6, clearcoatRoughness: 0.16 });
    const enamel = this.material({ color: LIME, roughness: 0.25, metalness: 0.18, clearcoat: 0.75, clearcoatRoughness: 0.2 });
    for (let side = 0; side < 2; side++) {
      const half = new THREE.Group();
      half.rotation.z = side === 0 ? -0.37 : 0.37;
      half.position.z = side === 0 ? 0 : 0.065;
      group.add(half);
      const blade = new THREE.Shape();
      blade.moveTo(-0.095, -0.15);
      blade.lineTo(0.08, -0.15);
      blade.lineTo(0.1, 0.18);
      blade.lineTo(0.065, 0.86);
      blade.quadraticCurveTo(0.015, 1.08, -0.075, 1.22);
      blade.lineTo(-0.16, 0.2);
      blade.closePath();
      this.mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.045, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.012, bevelSegments: 2 }), steel, half);
      const stem = this.mesh(new THREE.BoxGeometry(0.13, 0.42, 0.11), steel, half);
      stem.position.set(0, -0.25, 0.02);
      const handle = this.mesh(new THREE.TorusGeometry(0.285, 0.086, 14, 48), enamel, half);
      handle.position.set(0, -0.62, 0.02);
      handle.scale.set(0.91, 1.12, 1);
      const lining = this.mesh(new THREE.TorusGeometry(0.205, 0.013, 8, 48), steel, half);
      lining.position.set(0, -0.62, 0.02);
      lining.scale.set(0.91, 1.12, 1);
    }
    const pivot = this.mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.16, 32), this.material({ color: 0x232823, roughness: 0.25, metalness: 0.8 }), group);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.z = 0.045;
    const cap = this.mesh(new THREE.CylinderGeometry(0.069, 0.069, 0.018, 24), steel, group);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.133;
    const slot = this.mesh(new THREE.BoxGeometry(0.068, 0.014, 0.01), this.material({ color: 0x3e4836, metalness: 0.7 }), group, false);
    slot.position.z = 0.147;
    slot.rotation.z = 0.8;
    group.scale.setScalar(0.92);
    return group;
  }

  private makeSeal(side: number) {
    const group = new THREE.Group();
    const core = this.mesh(new THREE.IcosahedronGeometry(0.65, 1), this.material({ color: 0x454d3e, roughness: 0.42, metalness: 0.67, flatShading: true }), group);
    core.rotation.set(0.3, 0.2, 0.1);
    const ring = this.mesh(new THREE.TorusGeometry(0.81, 0.025, 12, 80), this.material({ color: side === 0 ? LIME : 0xd0d3c6, emissive: side === 0 ? LIME : 0xd0d3c6, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.28 }), group, false);
    ring.rotation.set(0.5, side === 0 ? -0.5 : 0.5, 0.2);
    this.sealedRings.push(ring);
    return group;
  }

  private makeParticles() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    this.textures.push(texture);
    const positions = new Float32Array(42 * 3);
    for (let i = 0; i < 42; i++) {
      positions[i * 3] = Math.sin(i * 56.4) * 3.7;
      positions[i * 3 + 1] = 0.1 + ((i * 0.731) % 1) * 3.2;
      positions[i * 3 + 2] = Math.cos(i * 37.9) * 2.2 - 0.6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd9e1b8, size: 0.035, transparent: true, opacity: 0.42, map: texture, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.particles);

    const sparkPositions = new Float32Array(36 * 3);
    this.sparkOrigins = new Float32Array(36 * 3);
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.399;
      this.sparkOrigins[i * 3] = Math.cos(angle) * (1 + (i % 3) * 0.3);
      this.sparkOrigins[i * 3 + 1] = Math.sin(angle) * 1.15 + 0.4;
      this.sparkOrigins[i * 3 + 2] = Math.cos(i * 1.6) * 0.8;
    }
    const sparksGeometry = new THREE.BufferGeometry();
    sparksGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    this.sparks = new THREE.Points(sparksGeometry, new THREE.PointsMaterial({ color: LIME, size: 0.08, transparent: true, opacity: 0, map: texture, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparks);
  }

  private resize = () => {
    if (!this.alive || !this.renderer) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    const aspect = width / height;
    const frustumHeight = Math.max(4.8, 8.35 / aspect);
    this.camera.left = -frustumHeight * aspect / 2;
    this.camera.right = frustumHeight * aspect / 2;
    this.camera.top = frustumHeight / 2;
    this.camera.bottom = -frustumHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.resume();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || this.reducedMotion) return;
    const box = this.container.getBoundingClientRect();
    this.pointer.set((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
  };

  private onPointerLeave = () => { this.pointer.set(0, 0); };

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.resume();
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.showFallback();
  };

  private onContextRestored = () => {
    this.contextLost = false;
    this.fallback?.remove();
    this.fallback = null;
    this.resume();
  };

  private resume() {
    if (!this.alive || !this.renderer || this.contextLost || this.raf || document.hidden || !this.intersecting) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.alive || !this.renderer || this.contextLost || document.hidden || !this.intersecting) return;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    this.clock += dt;
    const t = this.clock;
    const motion = this.reducedMotion ? 0 : 1;
    this.stage.rotation.y = THREE.MathUtils.damp(this.stage.rotation.y, this.pointer.x * 0.025 * motion, 3, dt);
    if (this.particles) {
      this.particles.rotation.y = motion * t * 0.018;
      this.particles.visible = !this.reducedMotion;
    }
    if (this.mode === 'home') {
      this.heroPieces.forEach((piece, i) => {
        const selected = this.hover === i;
        piece.root.position.y = THREE.MathUtils.damp(piece.root.position.y, piece.home.y + Math.sin(t * 1.2 + i * 1.9) * 0.06 * motion + (selected ? 0.16 : 0), 5, dt);
        piece.mesh.rotation.y = piece.angle.y + Math.sin(t * 0.55 + i * 1.5) * 0.14 * motion + this.pointer.x * 0.15 * motion;
        piece.mesh.rotation.z = piece.angle.z + Math.sin(t * 0.7 + i) * 0.035 * motion;
        const scale = THREE.MathUtils.damp(piece.root.scale.x, selected ? 1.08 : 1, 6, dt);
        piece.root.scale.setScalar(scale);
      });
    } else {
      const age = this.reducedMotion ? 10 : t - this.revealAt;
      const revealing = this.round.phase === 'reveal';
      const shown = revealing || this.round.phase === 'result';
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const seal = this.seals[side];
        seal.rotation.y = Math.sin(t * 0.45) * 0.2 * motion;
        seal.position.y = 1.05 + Math.sin(t * 1.6 + side * 1.2) * 0.04 * motion;
        const ringMaterial = this.sealedRings[side].material as THREE.MeshPhysicalMaterial;
        ringMaterial.emissiveIntensity = side === 0 && this.round.phase === 'locked' ? 0.8 : 0.18;
        for (const piece of this.playerPieces[side]) {
          if (!piece.root.visible) continue;
          let inward = 0;
          if (revealing && age < 0.72) {
            if (age < 0.26) inward = easeInOut(age / 0.26) * 0.77;
            else inward = (1 - easeOut((age - 0.26) / 0.46)) * 0.77;
          }
          piece.root.position.x = sign * (1.65 - inward);
          const winner = this.round.winner === side;
          const lift = shown && age > 0.35 && winner ? 0.1 * easeOut((age - 0.35) * 3) : 0;
          piece.root.position.y = 1.1 + lift + Math.sin(t * 1.3 + side) * 0.025 * motion;
          piece.mesh.rotation.z = piece.angle.z + sign * inward * 0.3 + (age < 0.5 && age > 0.26 ? Math.sin(age * 60) * 0.06 * (0.5 - age) : 0);
          piece.mesh.rotation.y = piece.angle.y + Math.sin(t * 0.65) * 0.05 * motion;
          const scale = revealing ? Math.min(1, 0.6 + easeOut(age / 0.18) * 0.4) : 1;
          piece.root.scale.setScalar(scale * (winner && age > 0.35 ? 1.14 : 1.08));
          const defeated = this.round.winner !== null && this.round.winner !== undefined && !winner && age > 0.35;
          const brightness = defeated ? 1 - easeOut((age - 0.35) / 0.5) * 0.57 : 1;
          piece.mesh.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (!mesh.material) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshPhysicalMaterial)) continue;
              if (!material.userData.arenaBaseColor) material.userData.arenaBaseColor = material.color.clone();
              material.color.copy(material.userData.arenaBaseColor).multiplyScalar(brightness);
            }
          });
        }
        const ringMat = this.winRings[side].material as THREE.MeshBasicMaterial;
        ringMat.opacity = shown && this.round.winner === side && age > 0.3 ? Math.min(0.7, (age - 0.3) * 2) : 0;
        this.winRings[side].scale.setScalar(1 + (this.round.winner === side ? Math.sin(t * 3) * 0.025 * motion : 0));
      }
      if (this.sparks && this.sparkOrigins) {
        const sparkAge = age - 0.26;
        const active = revealing && !this.reducedMotion && sparkAge >= 0 && sparkAge < 0.7;
        const material = this.sparks.material as THREE.PointsMaterial;
        material.opacity = active ? (1 - sparkAge / 0.7) * 0.85 : 0;
        if (active) {
          const positions = this.sparks.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            positions.setXYZ(i, this.sparkOrigins[i * 3] * sparkAge * 2.7, 1.1 + this.sparkOrigins[i * 3 + 1] * sparkAge * 2.2 - 1.8 * sparkAge * sparkAge, this.sparkOrigins[i * 3 + 2] * sparkAge * 2);
          }
          positions.needsUpdate = true;
        }
      }
    }
    if (this.mode === 'home' && this.sparks) (this.sparks.material as THREE.PointsMaterial).opacity = 0;
    if (this.width && this.height) this.renderer.render(this.scene, this.camera);
    // Reduced motion renders state changes without maintaining an idle animation loop.
    if (!this.reducedMotion) this.raf = requestAnimationFrame(this.frame);
  };

  private showFallback() {
    if (this.fallback) return;
    this.hideLoadingArt();
    this.fallback = document.createElement('div');
    this.fallback.setAttribute('aria-hidden', 'true');
    Object.assign(this.fallback.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: '2' });
    this.container.appendChild(this.fallback);
    this.updateFallback();
  }

  private hideLoadingArt() {
    this.container.querySelector<HTMLElement>('.arena-loading')?.style.setProperty('display', 'none');
  }

  private updateFallback() {
    if (!this.fallback) return;
    const rock = '<path d="M-32 10-26-23-5-38 27-26 39 0 24 31-8 36-36 17Z" fill="#858b7c"/><path d="M-26-23-5 4 27-26M-5 4 24 31M-5 4-36 17" fill="none" stroke="#adb49b" stroke-opacity=".45" stroke-width="2"/>';
    const paper = '<path d="M-29-42H13L31-23V42H-29Z" fill="#efeee7"/><path d="M13-42V-23H31" fill="#b4b9a4"/><path d="M-17-8H18M-17 4H18M-17 16H8" stroke="#99a184" stroke-width="2"/>';
    const scissors = '<path d="M-8 16 22-43Q27-34 20-17L4 17M8 16-22-43Q-27-34-20-17L-4 17" fill="#d1d8cb"/><circle cx="-13" cy="28" r="13" fill="none" stroke="#c8f86a" stroke-width="8"/><circle cx="13" cy="28" r="13" fill="none" stroke="#c8f86a" stroke-width="8"/><circle cx="0" cy="3" r="5" fill="#333b2b"/>';
    const seal = '<path d="M0-38 33-18 32 20 0 39-32 20-33-18Z" fill="#454d3e" stroke="#a6bb86" stroke-width="1.5"/><ellipse rx="44" ry="18" fill="none" stroke="#c8f86a" stroke-width="2" transform="rotate(-28)"/>';
    const art = [rock, paper, scissors];
    const shown = this.round.phase === 'reveal' || this.round.phase === 'result';
    const objects = this.mode === 'home'
      ? art.map((a, i) => `<g transform="translate(${145 + i * 155} 125) rotate(${i === 1 ? 9 : -10})">${a}</g>`).join('')
      : [0, 1].map(side => `<g transform="translate(${side === 0 ? 205 : 395} 125)">${shown && this.round.moves ? art[this.round.moves[side]] : seal}</g>`).join('');
    this.fallback.innerHTML = `<svg viewBox="0 0 600 310" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="fallback-stage"><stop stop-color="#34392d"/><stop offset="1" stop-color="#20241d"/></radialGradient></defs><ellipse cx="300" cy="210" rx="245" ry="72" fill="#171b14"/><ellipse cx="300" cy="198" rx="245" ry="72" fill="url(#fallback-stage)" stroke="#737e5f" stroke-width="1"/><ellipse cx="300" cy="200" rx="220" ry="60" fill="none" stroke="#737e5f" stroke-opacity=".3"/>${objects}</svg>`;
  }
}

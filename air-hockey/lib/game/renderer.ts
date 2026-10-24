import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TABLE, type GameEvent, type GameState, type Side, type Vec2 } from './types';

const BLUE = 0x5289ff;
const CORAL = 0xf18168;
const FLOOR = 0x10171d;
const SURFACE_Y = 0.035;
const PARTICLE_COUNT = 64;
const TRAIL_COUNT = 20;

type Particle = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number; size: number; color: THREE.Color;
};
type TrailPoint = { x: number; z: number; age: number };

/** World x/z correspond to the physics x/y; the playing surface is y=0.035. */
export class ArenaRenderer {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-8, 8, 10, -10, 0.1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly playPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE_Y);
  private readonly intersection = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly textures = new Set<THREE.Texture>();
  private readonly disposableExtras: Array<{ dispose(): void }> = [];
  private readonly mallets: [THREE.Group, THREE.Group];
  private readonly puck: THREE.Group;
  private readonly puckShadow: THREE.Mesh;
  private readonly malletShadows: [THREE.Mesh, THREE.Mesh];
  private readonly trails: THREE.Mesh[] = [];
  private readonly trailPoints: TrailPoint[] = [];
  private readonly particleData: Particle[] = [];
  private readonly particles: THREE.InstancedMesh;
  private readonly object = new THREE.Object3D();
  private readonly rings: Array<{ mesh: THREE.Mesh; life: number; duration: number }> = [];
  private readonly goalLights: [THREE.PointLight, THREE.PointLight];
  private readonly goalStrips: [THREE.Mesh, THREE.Mesh];
  private readonly keyLight: THREE.DirectionalLight;
  private readonly faceoffRing: THREE.Mesh;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private side: Side = 0;
  private overview = false;
  private quality: 'high' | 'low' = 'high';
  private goalPulse: [number, number] = [0, 0];
  private time = 0;
  private lastTrail = 0;
  private lastPuck = new THREE.Vector2(0, 0);
  private puckAngle = 0;
  private particleCursor = 0;
  private disposed = false;
  private reducedMotion = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(FLOOR, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(FLOOR);
    this.scene.fog = new THREE.Fog(FLOOR, 28, 66);

    this.buildEnvironment();
    this.scene.add(new THREE.HemisphereLight(0xdde7ef, 0x182029, 1.45));
    this.keyLight = new THREE.DirectionalLight(0xfff5e8, 3.1);
    this.keyLight.position.set(-5, 14, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.keyLight.shadow.camera, { left: -12, right: 12, top: 14, bottom: -14, near: 0.1, far: 40 });
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.035;
    this.keyLight.shadow.radius = 3;
    this.scene.add(this.keyLight);
    const fill = new THREE.DirectionalLight(0xa0c4ff, 1.05);
    fill.position.set(8, 7, -9);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffa58b, 0.6);
    rim.position.set(-5, 4, -11);
    this.scene.add(rim);

    this.buildFloor();
    const built = this.buildTable();
    this.goalLights = built.lights;
    this.goalStrips = built.strips;
    this.mallets = [this.buildMallet(BLUE), this.buildMallet(CORAL)];
    this.mallets[0].position.set(0, SURFACE_Y, 4.5);
    this.mallets[1].position.set(0, SURFACE_Y, -4.5);
    this.scene.add(...this.mallets);
    this.puck = this.buildPuck();
    this.scene.add(this.puck);
    this.malletShadows = [this.contactShadow(0.76, 0.3), this.contactShadow(0.76, 0.3)];
    this.puckShadow = this.contactShadow(0.37, 0.35);
    this.scene.add(...this.malletShadows, this.puckShadow);

    const trailGeometry = new THREE.CircleGeometry(TABLE.puckRadius * 0.82, 24);
    trailGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x9c6749, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(trailGeometry, material);
      mesh.position.y = SURFACE_Y + 0.006 + i * 0.00005;
      mesh.renderOrder = 1;
      this.trails.push(mesh);
      this.scene.add(mesh);
    }
    const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    this.particles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 5, 4), particleMaterial, PARTICLE_COUNT);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particleData.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, color: new THREE.Color() });
      this.object.scale.setScalar(0);
      this.object.updateMatrix();
      this.particles.setMatrixAt(i, this.object.matrix);
      this.particles.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.scene.add(this.particles);
    const ringGeometry = new THREE.RingGeometry(0.95, 1, 48);
    ringGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      this.rings.push({ mesh, life: 0, duration: 0.4 });
      this.scene.add(mesh);
    }
    this.faceoffRing = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.405, 64),
      new THREE.MeshBasicMaterial({ color: 0x547992, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.faceoffRing.rotation.x = -Math.PI / 2;
    this.faceoffRing.position.y = SURFACE_Y + 0.008;
    this.scene.add(this.faceoffRing);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.add(texture);
    return texture;
  }

  private buildEnvironment(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#151d29';
    ctx.fillRect(0, 0, 1024, 512);
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#b5c7d3');
    sky.addColorStop(0.35, '#354452');
    sky.addColorStop(0.7, '#14191f');
    sky.addColorStop(1, '#11161d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);
    ctx.filter = 'blur(12px)';
    ctx.fillStyle = '#f1f1e8';
    ctx.fillRect(96, 82, 105, 208);
    ctx.fillStyle = '#9dbce3';
    ctx.fillRect(680, 130, 40, 170);
    ctx.fillStyle = '#c0cbd4';
    ctx.fillRect(350, 45, 260, 28);
    const texture = this.texture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromEquirectangular(texture);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.72;
    pmrem.dispose();
  }

  private roundedBox(w: number, h: number, d: number, radius: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildFloor(): void {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.96, metalness: 0.04 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.12;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
    gradient.addColorStop(0, 'rgba(0,0,0,.55)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,.37)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(14, 21), new THREE.MeshBasicMaterial({ map: this.texture(canvas), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -2.105, 0.25);
    this.scene.add(shadow);

    // Quiet floor seams give the cabinet scale without filling the screen with scenery.
    const seam = new THREE.MeshBasicMaterial({ color: 0x1c252d, transparent: true, opacity: 0.23 });
    for (let x = -24; x <= 24; x += 8) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 70), seam);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, -2.11, 0);
      this.scene.add(line);
    }
    for (let z = -28; z <= 28; z += 8) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.015), seam);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, -2.109, z);
      this.scene.add(line);
    }
  }

  private boardTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1792;
    const ctx = canvas.getContext('2d')!;
    const sx = 128;
    const x = (v: number) => (v + TABLE.halfWidth) * sx;
    const z = (v: number) => (v + TABLE.halfLength) * sx;
    ctx.fillStyle = '#e6e8e4';
    ctx.fillRect(0, 0, 1024, 1792);
    const sheen = ctx.createLinearGradient(0, 0, 1024, 1792);
    sheen.addColorStop(0, 'rgba(255,255,255,.1)');
    sheen.addColorStop(0.48, 'rgba(255,255,255,.0)');
    sheen.addColorStop(1, 'rgba(147,163,174,.08)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 1024, 1792);
    // Air perforations are baked into one mipmapped texture, not thousands of meshes.
    ctx.fillStyle = 'rgba(56,76,85,.27)';
    for (let py = 16; py < 1792; py += 22) {
      for (let px = 16; px < 1024; px += 22) {
        ctx.beginPath(); ctx.arc(px, py, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#879da9';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, z(0)); ctx.lineTo(1024, z(0)); ctx.stroke();
    ctx.beginPath(); ctx.arc(x(0), z(0), 1.24 * sx, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,143,156,.35)';
    ctx.beginPath(); ctx.arc(x(0), z(0), 1.34 * sx, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8399a6';
    ctx.beginPath(); ctx.arc(x(0), z(0), 5, 0, Math.PI * 2); ctx.fill();
    for (const sign of [-1, 1]) {
      const goalZ = sign * 7;
      const color = sign === 1 ? '80,125,181' : '185,112,96';
      ctx.fillStyle = `rgba(${color},.048)`;
      ctx.strokeStyle = `rgba(${color},.58)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x(0), z(goalZ), 1.9 * sx, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${color},.32)`;
      ctx.beginPath(); ctx.arc(x(0), z(sign * 3.45), 0.60 * sx, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(${color},.45)`;
      ctx.beginPath(); ctx.arc(x(0), z(sign * 3.45), 3, 0, Math.PI * 2); ctx.fill();
      for (const px of [-1.2, 1.2]) {
        ctx.fillStyle = `rgba(${color},.38)`;
        ctx.fillRect(x(px) - 5, z(sign * 3.45) - 1, 10, 2);
      }
    }
    // Small manufacturer print belongs to the object, never to the gameplay HUD.
    ctx.save();
    ctx.translate(x(0), z(5.9));
    ctx.fillStyle = 'rgba(58,78,91,.35)';
    ctx.textAlign = 'center';
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText('A I R   H O C K E Y', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(x(0), z(-5.9));
    ctx.rotate(Math.PI);
    ctx.fillStyle = 'rgba(58,78,91,.28)';
    ctx.textAlign = 'center';
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText('A I R   H O C K E Y', 0, 0);
    ctx.restore();
    return this.texture(canvas);
  }

  private buildTable(): { lights: [THREE.PointLight, THREE.PointLight]; strips: [THREE.Mesh, THREE.Mesh] } {
    const cabinet = new THREE.MeshPhysicalMaterial({ color: 0x202933, roughness: 0.4, metalness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.3 });
    const underside = new THREE.MeshStandardMaterial({ color: 0x0e141b, roughness: 0.6, metalness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x75838b, roughness: 0.27, metalness: 0.95 });
    const railMaterial = new THREE.MeshPhysicalMaterial({ color: 0x26333e, roughness: 0.25, metalness: 0.65, clearcoat: 0.55 });
    const cushionMaterial = new THREE.MeshStandardMaterial({ color: 0xb7c3c8, roughness: 0.4, metalness: 0.25 });
    const black = new THREE.MeshStandardMaterial({ color: 0x03070d, roughness: 0.83 });
    const body = this.roundedBox(9.0, 0.96, 15.0, 0.28, cabinet);
    body.position.y = -0.64;
    this.scene.add(body);
    const lower = this.roundedBox(8.7, 0.16, 14.7, 0.26, underside);
    lower.position.y = -1.14;
    this.scene.add(lower);
    const lip = this.roundedBox(9.12, 0.19, 15.12, 0.27, steel);
    lip.position.y = -0.13;
    this.scene.add(lip);
    const upper = this.roundedBox(9.16, 0.25, 15.16, 0.28, railMaterial);
    upper.position.y = -0.095;
    this.scene.add(upper);

    const surface = new THREE.Mesh(new THREE.PlaneGeometry(8, 14), new THREE.MeshPhysicalMaterial({ map: this.boardTexture(), color: 0xffffff, roughness: 0.35, metalness: 0.08, clearcoat: 0.7, clearcoatRoughness: 0.27 }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = SURFACE_Y;
    surface.receiveShadow = true;
    this.scene.add(surface);

    // The inner edges coincide exactly with the collision rectangle.
    for (const sign of [-1, 1]) {
      const rail = this.roundedBox(0.34, 0.27, 14.45, 0.055, railMaterial);
      rail.position.set(sign * 4.17, 0.16, 0);
      this.scene.add(rail);
      const inner = this.roundedBox(0.055, 0.17, 13.96, 0.018, cushionMaterial);
      inner.position.set(sign * 4.022, 0.12, 0);
      this.scene.add(inner);
      const inlay = this.roundedBox(0.027, 0.014, 13.8, 0.005, steel);
      inlay.position.set(sign * 4.18, 0.306, 0);
      this.scene.add(inlay);
      for (const end of [-1, 1]) {
        const length = TABLE.halfWidth - TABLE.goalHalfWidth;
        const segment = this.roundedBox(length + 0.03, 0.27, 0.34, 0.055, railMaterial);
        segment.position.set(end * (TABLE.goalHalfWidth + length / 2), 0.16, sign * 7.17);
        this.scene.add(segment);
        const facing = this.roundedBox(length - 0.03, 0.17, 0.052, 0.016, cushionMaterial);
        facing.position.set(end * (TABLE.goalHalfWidth + length / 2), 0.12, sign * 7.02);
        this.scene.add(facing);
      }
    }

    // Recessed, open goal mouths with a black catch channel and a light inside.
    const goalLights: THREE.PointLight[] = [];
    const goalStrips: THREE.Mesh[] = [];
    for (const side of [0, 1] as const) {
      const sign = side === 0 ? 1 : -1;
      const color = side === 0 ? BLUE : CORAL;
      const mouth = this.roundedBox(3.0, 0.014, 0.58, 0.006, black);
      mouth.position.set(0, 0.036, sign * 7.27);
      mouth.castShadow = false;
      this.scene.add(mouth);
      const back = this.roundedBox(3.08, 0.29, 0.08, 0.025, railMaterial);
      back.position.set(0, 0.15, sign * 7.55);
      this.scene.add(back);
      const goalLightMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, roughness: 0.2 });
      const lightStrip = this.roundedBox(2.83, 0.035, 0.025, 0.008, goalLightMaterial);
      lightStrip.position.set(0, 0.14, sign * 7.49);
      lightStrip.castShadow = false;
      this.scene.add(lightStrip);
      goalStrips.push(lightStrip);
      const light = new THREE.PointLight(color, 1.8, 4, 2);
      light.position.set(0, 0.4, sign * 6.8);
      this.scene.add(light);
      goalLights.push(light);
      for (const x of [-1.51, 1.51]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.24, 16), steel);
        post.position.set(x, 0.17, sign * 7.01);
        post.castShadow = true;
        this.scene.add(post);
      }

      const apronAccentMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.35 });
      const frontAccent = this.roundedBox(7.4, 0.025, 0.018, 0.006, apronAccentMaterial);
      frontAccent.position.set(0, -0.45, sign * 7.507);
      this.scene.add(frontAccent);
      for (const x of [-4.503, 4.503]) {
        const accent = this.roundedBox(0.018, 0.025, 5.7, 0.006, apronAccentMaterial);
        accent.position.set(x, -0.45, sign * 3.95);
        this.scene.add(accent);
      }
    }

    // Recessed fasteners, underbody ventilation, and feet make it a manufactured object.
    const screwGeometry = new THREE.CylinderGeometry(0.038, 0.038, 0.012, 12);
    const slotGeometry = new THREE.BoxGeometry(0.041, 0.004, 0.006);
    for (const x of [-4.39, 4.39]) {
      for (const z of [-6.65, -4.4, -2.2, 0, 2.2, 4.4, 6.65]) {
        const screw = new THREE.Mesh(screwGeometry, steel);
        screw.position.set(x, 0.039, z);
        this.scene.add(screw);
        const slot = new THREE.Mesh(slotGeometry, underside);
        slot.position.set(x, 0.047, z);
        slot.rotation.y = 0.45;
        this.scene.add(slot);
      }
    }
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const vent = this.roundedBox(0.025, 0.18, 0.065, 0.008, black);
        vent.position.set(sign * 4.505, -0.79, -0.71 + i * 0.13);
        this.scene.add(vent);
      }
      for (const end of [-1, 1]) {
        const leg = this.roundedBox(0.8, 1.0, 1.15, 0.1, underside);
        leg.position.set(sign * 3.12, -1.59, end * 5.25);
        this.scene.add(leg);
        const foot = this.roundedBox(1.02, 0.11, 1.32, 0.06, cabinet);
        foot.position.set(sign * 3.12, -2.04, end * 5.25);
        this.scene.add(foot);
      }
    }
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 256; badgeCanvas.height = 64;
    const badgeCtx = badgeCanvas.getContext('2d')!;
    badgeCtx.fillStyle = '#27323c'; badgeCtx.fillRect(0, 0, 256, 64);
    badgeCtx.strokeStyle = '#61717b'; badgeCtx.lineWidth = 2; badgeCtx.strokeRect(2, 2, 252, 60);
    badgeCtx.fillStyle = '#afbec7'; badgeCtx.font = 'bold 24px Arial'; badgeCtx.textAlign = 'center'; badgeCtx.fillText('AIR HOCKEY', 128, 41);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.31), new THREE.MeshStandardMaterial({ map: this.texture(badgeCanvas), roughness: 0.35, metalness: 0.6 }));
    badge.position.set(0, -0.78, 7.506);
    this.scene.add(badge);
    return { lights: goalLights as [THREE.PointLight, THREE.PointLight], strips: goalStrips as [THREE.Mesh, THREE.Mesh] };
  }

  private buildMallet(color: number): THREE.Group {
    const group = new THREE.Group();
    const profile = [
      [0, 0.025], [0.40, 0.025], [0.48, 0.045], [0.515, 0.085], [0.52, 0.125],
      [0.50, 0.18], [0.455, 0.215], [0.36, 0.24], [0.285, 0.30], [0.253, 0.38],
      [0.25, 0.56], [0.28, 0.595], [0.295, 0.63], [0.28, 0.67], [0.23, 0.69], [0, 0.69],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshPhysicalMaterial({ color, metalness: 0.12, roughness: 0.23, clearcoat: 0.95, clearcoatRoughness: 0.16 }));
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    const rubber = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.028, 8, 64), new THREE.MeshStandardMaterial({ color: 0x101923, roughness: 0.65 }));
    rubber.rotation.x = Math.PI / 2;
    rubber.position.y = 0.058;
    group.add(rubber);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.259, 0.013, 8, 48), new THREE.MeshStandardMaterial({ color: 0xbac6ce, roughness: 0.22, metalness: 0.9 }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.565;
    group.add(collar);
    const gripMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.57), roughness: 0.48, metalness: 0.15 });
    const gripGeometry = new THREE.TorusGeometry(0.253, 0.008, 6, 48);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(gripGeometry, gripMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.40 + i * 0.036;
      group.add(ring);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.187, 0.187, 0.012, 48), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), metalness: 0.2, roughness: 0.3, clearcoat: 1 }));
    cap.position.y = 0.691;
    group.add(cap);
    const topMark = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 6, 40), new THREE.MeshBasicMaterial({ color: 0xf1f4f2, transparent: true, opacity: 0.68 }));
    topMark.rotation.x = Math.PI / 2;
    topMark.position.y = 0.699;
    group.add(topMark);
    return group;
  }

  private buildPuck(): THREE.Group {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(TABLE.puckRadius, TABLE.puckRadius, 0.115, 48), new THREE.MeshPhysicalMaterial({ color: 0x17232e, roughness: 0.25, metalness: 0.4, clearcoat: 0.6 }));
    shell.position.y = 0.068;
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.012, 48), new THREE.MeshStandardMaterial({ color: 0x27333b, roughness: 0.45, metalness: 0.2 }));
    top.position.y = 0.13;
    group.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.014, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffd28c, emissive: 0xd7a557, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    group.add(ring);
    const pip = new THREE.Mesh(new THREE.CircleGeometry(0.027, 12), new THREE.MeshBasicMaterial({ color: 0xe4c38e }));
    pip.rotation.x = -Math.PI / 2;
    pip.position.set(0.08, 0.142, 0);
    group.add(pip);
    group.position.y = SURFACE_Y;
    return group;
  }

  private contactShadow(radius: number, opacity: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
    grad.addColorStop(0, 'rgba(15,24,32,.8)');
    grad.addColorStop(0.45, 'rgba(15,24,32,.55)');
    grad.addColorStop(1, 'rgba(15,24,32,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: this.texture(canvas), transparent: true, opacity, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = SURFACE_Y + 0.004;
    return shadow;
  }

  setView(side: Side, overview = false): void {
    if (this.side === side && this.overview === overview) return;
    this.side = side;
    this.overview = overview;
    this.resize();
  }

  resize(): void {
    if (this.disposed) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const aspect = width / height;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.8 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const portrait = aspect < 0.8;
    const sign = this.side === 0 ? 1 : -1;
    this.camera.position.set(0, portrait || this.overview ? 23 : 19, sign * (portrait ? 8.2 : 10.5));
    this.camera.lookAt(0, -0.2, 0);
    const verticalSpan = Math.max(portrait ? 16.15 : 15.5, 10.1 / aspect);
    this.camera.left = -verticalSpan * aspect / 2;
    this.camera.right = verticalSpan * aspect / 2;
    this.camera.top = verticalSpan / 2;
    this.camera.bottom = -verticalSpan / 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  setQuality(quality: 'high' | 'low'): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality === 'high';
    this.resize();
  }

  screenToWorld(clientX: number, clientY: number): Vec2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.playPlane, this.intersection)) return null;
    return { x: this.intersection.x, y: this.intersection.z };
  }

  effects(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'goal' || event.type === 'win') {
        const scorer = event.side ?? (event.y < 0 ? 0 : 1);
        this.goalPulse[scorer === 0 ? 1 : 0] = 1;
        this.trailPoints.length = 0;
        if (!this.reducedMotion) this.ring(event.x, event.y, scorer === 0 ? BLUE : CORAL, 0.8);
      }
      if (event.type === 'serve') this.trailPoints.length = 0;
      if ((event.type === 'wall' || event.type === 'mallet') && event.speed > 2 && !this.reducedMotion) {
        const color = event.type === 'mallet' ? (event.side === 0 ? BLUE : CORAL) : 0xd4bd98;
        const count = Math.min(7, 2 + Math.floor(event.speed / 6));
        for (let i = 0; i < count; i++) {
          const p = this.particleData[this.particleCursor++ % PARTICLE_COUNT];
          const angle = Math.random() * Math.PI * 2;
          const velocity = 0.35 + Math.min(event.speed * 0.055, 1.6) * Math.random();
          p.x = event.x; p.y = SURFACE_Y + 0.15; p.z = event.y;
          p.vx = Math.cos(angle) * velocity;
          p.vz = Math.sin(angle) * velocity;
          p.vy = 0.5 + Math.random() * 0.8;
          p.life = p.maxLife = 0.16 + Math.random() * 0.18;
          p.size = 0.6 + Math.random() * 0.8;
          p.color.setHex(color);
        }
        if (event.type === 'mallet' && event.speed > 12) this.ring(event.x, event.y, color, 0.25);
      }
    }
  }

  private ring(x: number, z: number, color: number, duration: number): void {
    const ring = this.rings.find(r => r.life <= 0) ?? this.rings[0];
    ring.life = ring.duration = duration;
    ring.mesh.visible = true;
    ring.mesh.position.set(x, SURFACE_Y + 0.01, z);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  update(state: GameState, dt: number, options: { idle?: boolean; reducedMotion?: boolean } = {}): void {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time += dt;
    this.reducedMotion = !!options.reducedMotion;
    for (const side of [0, 1] as const) {
      const body = state.mallets[side];
      this.mallets[side].position.set(body.x, SURFACE_Y, body.y);
      this.malletShadows[side].position.x = body.x + 0.045;
      this.malletShadows[side].position.z = body.y + 0.045;
      this.goalPulse[side] = Math.max(0, this.goalPulse[side] - dt * 1.45);
      this.goalLights[side].intensity = 1.8 + this.goalPulse[side] * 14;
      (this.goalStrips[side].material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + this.goalPulse[side] * 3.5;
    }
    const puck = state.puck;
    const speed = Math.hypot(puck.vx, puck.vy);
    if (Math.hypot(puck.x - this.lastPuck.x, puck.y - this.lastPuck.y) > 3) this.trailPoints.length = 0;
    this.lastPuck.set(puck.x, puck.y);
    this.puck.position.set(puck.x, SURFACE_Y, puck.y);
    this.puckAngle += Math.min(speed, 30) * dt * 0.15;
    this.puck.rotation.y = this.puckAngle;
    this.puck.visible = state.phase !== 'goal' && state.phase !== 'finished' || Math.abs(puck.y) <= TABLE.halfLength + 0.3;
    this.puckShadow.position.x = puck.x + 0.025;
    this.puckShadow.position.z = puck.y + 0.025;
    this.puckShadow.visible = this.puck.visible;
    this.faceoffRing.visible = state.phase === 'faceoff';
    if (this.faceoffRing.visible) {
      this.faceoffRing.position.x = puck.x;
      this.faceoffRing.position.z = puck.y;
      this.faceoffRing.scale.setScalar(this.reducedMotion ? 1 : 1 + Math.sin(this.time * 4) * 0.1);
    }

    this.lastTrail += dt;
    if (speed > 9 && state.phase === 'playing' && this.lastTrail >= 1 / 100 && !this.reducedMotion) {
      this.trailPoints.unshift({ x: puck.x, z: puck.y, age: 0 });
      this.trailPoints.length = Math.min(this.trailPoints.length, TRAIL_COUNT);
      this.lastTrail = 0;
    }
    for (const point of this.trailPoints) point.age += dt;
    for (let i = 0; i < this.trails.length; i++) {
      const mesh = this.trails[i];
      const point = this.trailPoints[i];
      const alpha = point ? Math.max(0, 1 - point.age / 0.14) : 0;
      mesh.visible = alpha > 0 && !this.reducedMotion;
      if (mesh.visible && point) {
        mesh.position.x = point.x; mesh.position.z = point.z;
        mesh.scale.setScalar(0.25 + alpha * 0.62);
        (mesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.095;
      }
    }
    let activeParticles = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particleData[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= dt * 4;
        this.object.position.set(p.x, Math.max(SURFACE_Y + 0.02, p.y), p.z);
        this.object.scale.setScalar(Math.max(0, p.life / p.maxLife) * p.size);
        this.particles.setColorAt(i, p.color);
        activeParticles++;
      } else {
        this.object.scale.setScalar(0);
      }
      this.object.updateMatrix();
      this.particles.setMatrixAt(i, this.object.matrix);
    }
    this.particles.visible = activeParticles > 0 && !this.reducedMotion;
    if (activeParticles) {
      this.particles.instanceMatrix.needsUpdate = true;
      if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
    }
    for (const ring of this.rings) {
      ring.life = Math.max(0, ring.life - dt);
      ring.mesh.visible = ring.life > 0 && !this.reducedMotion;
      if (!ring.mesh.visible) continue;
      const t = 1 - ring.life / ring.duration;
      ring.mesh.scale.setScalar(0.25 + t * (ring.duration > 0.5 ? 2.5 : 0.7));
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.28;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
      const light = object as THREE.Light & { shadow?: THREE.LightShadow };
      light.shadow?.map?.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const extra of this.disposableExtras) extra.dispose();
    this.environmentTarget?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene.clear();
  }
}

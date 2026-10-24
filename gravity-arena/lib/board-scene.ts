import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type SceneGame = {
  variant: '3d' | 'classic'; board: number[]; heights: number[]; turn: number;
  winner: number | null; winningLines: number[][]; moves: { stack: number; index: number; player: number; ply: number }[];
};
export type SceneOptions = {
  game: SceneGame; theme: 'light' | 'dark'; reducedMotion: boolean; interactive: boolean;
  demo?: boolean; selectedStack: number | null;
  onSelect: (stack: number | null) => void; onDrop: (stack: number) => void;
  onLand?: () => void; onReady?: () => void; onError?: (message: string) => void;
  view?: 'perspective' | 'top';
};
export type BoardSceneHandle = {
  setGame: (game: SceneGame) => void;
  setSelection: (stack: number | null) => void;
  reset: () => void;
  rotate: () => void;
  setView: (view: 'perspective' | 'top') => void;
  dispose: () => void;
};

type FallingPiece = { mesh: THREE.Mesh; target: number; from: number; elapsed: number; duration: number; landed: boolean };
const CORAL = '#ea7662';
const BLUE = '#6a93d5';

export function createBoardScene(host: HTMLDivElement, getOptions: () => SceneOptions): BoardSceneHandle {
  const initial = getOptions();
  const classic = initial.game.variant === 'classic';
  const dark = initial.theme === 'dark';
  const width = classic ? 7 : 4;
  const depth = classic ? 1 : 4;
  const height = classic ? 6 : 4;
  const spacing = classic ? 1.08 : 1.17;
  const bottom = classic ? .73 : .8;
  const radius = classic ? .415 : .49;
  const verticalStep = classic ? spacing : radius * 2;
  const boardTop = bottom + (height - 1) * verticalStep + .6;
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = dark ? 1.3 : 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  canvas.setAttribute('aria-label', classic ? 'Classic four-in-a-row board. Arrow keys select a column; Enter drops a piece. Drag to rotate.' : 'Three-dimensional four-in-a-row board. Arrow keys select a stack; Enter drops a sphere. Drag to rotate.');
  canvas.setAttribute('role', 'application');
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .085;
  controls.enablePan = false;
  controls.rotateSpeed = .6;
  controls.zoomSpeed = .7;
  controls.minDistance = classic ? 9 : 8;
  controls.maxDistance = classic ? 26 : 23;
  controls.minPolarAngle = .2;
  controls.maxPolarAngle = Math.PI * .47;
  controls.target.set(0, classic ? 3.2 : 1.65, 0);
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.enableZoom = true;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
  function material<T extends THREE.Material>(value: T): T { materials.add(value); return value; }
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = scene): THREE.Mesh {
    const obj = new THREE.Mesh(g, m); parent.add(obj); return obj;
  }
  function box(w: number, h: number, d: number, rounding = .08) { return geometry(new RoundedBoxGeometry(w, h, d, 3, rounding)); }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, .04);
  scene.environment = environment.texture;
  roomEnvironment.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(dark ? 0xcbd9f0 : 0xfff8ed, dark ? 0x292535 : 0xb0adb2, dark ? 1.5 : 2));
  const key = new THREE.DirectionalLight(0xfff6df, dark ? 4 : 4.5);
  key.position.set(-5, 11, 7); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -8; key.shadow.camera.right = 8;
  key.shadow.camera.top = 9; key.shadow.camera.bottom = -8;
  key.shadow.camera.near = .5; key.shadow.camera.far = 30;
  key.shadow.bias = -.0004; key.shadow.normalBias = .025; key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc7dcff, dark ? 2.2 : 1.4);
  fill.position.set(7, 4, -4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(-5, 5, -7); scene.add(rim);

  const porcelain = material(new THREE.MeshStandardMaterial({ color: dark ? '#343b45' : '#e6e3da', roughness: .28, metalness: .12 }));
  const porcelainEdge = material(new THREE.MeshStandardMaterial({ color: dark ? '#252c35' : '#c7c6c0', roughness: .3, metalness: .4 }));
  const chrome = material(new THREE.MeshStandardMaterial({ color: dark ? '#8997a6' : '#aeb9c0', metalness: .75, roughness: .24 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: dark ? '#627387' : '#e2e8e8', roughness: .12, metalness: .1, transparent: true, opacity: dark ? .25 : .3, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 }));
  const structure = material(new THREE.MeshStandardMaterial({ color: dark ? '#a3b0be' : '#a4b0b3', metalness: .7, roughness: .28, transparent: true, opacity: dark ? .43 : .47 }));
  const faint = material(new THREE.MeshBasicMaterial({ color: dark ? '#9cabbc' : '#8d9a9e', transparent: true, opacity: dark ? .14 : .17, depthWrite: false }));
  const holeMat = material(new THREE.MeshStandardMaterial({ color: dark ? '#222b36' : '#b5bec0', roughness: .4, metalness: .25 }));
  const socketMat = material(new THREE.MeshStandardMaterial({ color: dark ? '#596775' : '#b1bbb8', roughness: .36, metalness: .52, transparent: true, opacity: .64 }));
  const coralMat = material(new THREE.MeshPhysicalMaterial({ color: CORAL, roughness: .19, metalness: .08, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.12 }));
  const blueMat = material(new THREE.MeshPhysicalMaterial({ color: BLUE, roughness: .17, metalness: .13, clearcoat: 1, clearcoatRoughness: .14, envMapIntensity: 1.14 }));
  const dimCoral = material(coralMat.clone()); dimCoral.transparent = true; dimCoral.opacity = .48; dimCoral.depthWrite = false;
  const dimBlue = material(blueMat.clone()); dimBlue.transparent = true; dimBlue.opacity = .48; dimBlue.depthWrite = false;

  const ground = mesh(geometry(new THREE.PlaneGeometry(200, 200)), material(new THREE.ShadowMaterial({ color: dark ? '#000000' : '#635e55', opacity: dark ? .35 : .14 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.35; ground.receiveShadow = true;

  // A soft contact shadow grounds the object even on low-powered mobile GPUs.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 63);
    gradient.addColorStop(0, 'rgba(40,40,40,0.28)'); gradient.addColorStop(.45, 'rgba(40,40,40,0.14)'); gradient.addColorStop(1, 'rgba(40,40,40,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  }
  const contactTexture = new THREE.CanvasTexture(shadowCanvas); textures.add(contactTexture);
  const contact = mesh(geometry(new THREE.PlaneGeometry(classic ? 12 : 9, classic ? 5 : 9)), material(new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, opacity: dark ? .8 : .5, depthWrite: false })));
  contact.rotation.x = -Math.PI / 2; contact.position.y = -.341;

  const board = new THREE.Group(); scene.add(board);
  const baseWidth = classic ? 8.8 : 5.65;
  const baseDepth = classic ? 2.35 : 5.65;
  const baseBottom = mesh(box(baseWidth, .28, baseDepth, .13), porcelainEdge, board);
  baseBottom.position.y = -.035; baseBottom.castShadow = true; baseBottom.receiveShadow = true;
  const base = mesh(box(baseWidth - .07, .24, baseDepth - .07, .12), porcelain, board);
  base.position.y = .15; base.castShadow = true; base.receiveShadow = true;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const foot = mesh(geometry(new THREE.CylinderGeometry(.22, .24, .14, 24)), porcelainEdge, board);
    foot.position.set(x * (baseWidth / 2 - .55), -.22, z * (baseDepth / 2 - .42)); foot.castShadow = true;
  }

  function tubeBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D = board) {
    const direction = b.clone().sub(a);
    const tube = mesh(geometry(new THREE.CylinderGeometry(r, r, direction.length(), 12)), mat, parent);
    tube.position.copy(a).add(b).multiplyScalar(.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return tube;
  }

  if (!classic) {
    const glassBase = mesh(box(5.42, .1, 5.42, .04), glass, board);
    glassBase.position.y = .32;
    const edge = 2.54;
    for (const x of [-edge, edge]) for (const z of [-edge, edge]) {
      const post = tubeBetween(new THREE.Vector3(x, .33, z), new THREE.Vector3(x, boardTop, z), .032, structure);
      post.castShadow = true;
      const cap = mesh(geometry(new THREE.SphereGeometry(.065, 16, 12)), chrome, board); cap.position.set(x, boardTop, z);
    }
    for (let layer = 0; layer <= 4; layer++) {
      const y = .34 + layer * verticalStep;
      const mat = layer === 0 || layer === 4 ? structure : faint;
      const r = layer === 0 || layer === 4 ? .019 : .009;
      tubeBetween(new THREE.Vector3(-edge, y, -edge), new THREE.Vector3(edge, y, -edge), r, mat);
      tubeBetween(new THREE.Vector3(edge, y, -edge), new THREE.Vector3(edge, y, edge), r, mat);
      tubeBetween(new THREE.Vector3(edge, y, edge), new THREE.Vector3(-edge, y, edge), r, mat);
      tubeBetween(new THREE.Vector3(-edge, y, edge), new THREE.Vector3(-edge, y, -edge), r, mat);
    }
    // Tiny intersections locate every stack without filling the volume with opaque dividers.
    const dotGeometry = geometry(new THREE.SphereGeometry(.025, 8, 6));
    for (let y = 1; y < height; y++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const dot = mesh(dotGeometry, faint, board); dot.position.set((x - 1.5) * spacing, .34 + y * verticalStep, (z - 1.5) * spacing);
    }
  } else {
    const panelWidth = 8.12, panelHeight = 7.12;
    const shape = new THREE.Shape();
    const left = -panelWidth / 2, right = panelWidth / 2, low = .18, high = panelHeight;
    const corner = .22;
    shape.moveTo(left + corner, low); shape.lineTo(right - corner, low); shape.quadraticCurveTo(right, low, right, low + corner);
    shape.lineTo(right, high - corner); shape.quadraticCurveTo(right, high, right - corner, high);
    shape.lineTo(left + corner, high); shape.quadraticCurveTo(left, high, left, high - corner);
    shape.lineTo(left, low + corner); shape.quadraticCurveTo(left, low, left + corner, low);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const hole = new THREE.Path(); hole.absarc((x - 3) * spacing, bottom + y * spacing, .462, 0, Math.PI * 2, true); shape.holes.push(hole);
    }
    const panel = mesh(geometry(new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelThickness: .045, bevelSize: .035, bevelSegments: 3, curveSegments: 24 })), material(new THREE.MeshPhysicalMaterial({ color: dark ? '#3a4856' : '#dce2df', roughness: .22, metalness: .25, clearcoat: .8 })), board);
    panel.position.z = -.11; panel.castShadow = true; panel.receiveShadow = true;
    for (const x of [-4.05, 4.05]) {
      const support = mesh(box(.22, 7.05, .56, .09), porcelain, board); support.position.set(x, 3.7, 0); support.castShadow = true;
    }
    for (let x = 0; x < width; x++) {
      const topSlot = mesh(box(.89, .025, .4, .01), holeMat, board);
      topSlot.position.set((x - 3) * spacing, 7.18, 0);
    }
  }

  const ringGeometry = geometry(new THREE.TorusGeometry(classic ? .42 : .46, .017, 8, 48));
  const socketGeometry = geometry(new THREE.CylinderGeometry(.42, .39, .016, 36));
  const markerGeometry = geometry(new THREE.TorusGeometry(.23, .015, 8, 32));
  const markerMat = material(new THREE.MeshBasicMaterial({ color: dark ? '#9cabbc' : '#9ba8a6', transparent: true, opacity: dark ? .34 : .32, depthWrite: false }));
  const sockets: THREE.Mesh[] = [];
  const topMarkers: THREE.Mesh[] = [];
  for (let stack = 0; stack < width * depth; stack++) {
    const x = (stack % width - (width - 1) / 2) * spacing;
    const z = (Math.floor(stack / width) - (depth - 1) / 2) * spacing;
    if (!classic) {
      const socket = mesh(ringGeometry, socketMat, board); socket.rotation.x = Math.PI / 2; socket.position.set(x, .375, z); sockets.push(socket);
      const recess = mesh(socketGeometry, material(new THREE.MeshStandardMaterial({ color: dark ? '#293340' : '#c5cdc8', roughness: .6, transparent: true, opacity: .55 })), board); recess.position.set(x, .365, z);
      const marker = mesh(markerGeometry, markerMat, board); marker.rotation.x = Math.PI / 2; marker.position.set(x, boardTop + .02, z); topMarkers.push(marker);
    }
  }

  const ballGeometry = classic ? geometry(new THREE.CylinderGeometry(radius, radius, .32, 48, 1)) : geometry(new THREE.SphereGeometry(radius, 40, 28));
  const pieces = new Map<number, THREE.Mesh>();
  const dropAnimations: FallingPiece[] = [];
  const winGroup = new THREE.Group(); scene.add(winGroup);
  const targetGroup = new THREE.Group(); scene.add(targetGroup);
  const targets: THREE.Mesh[] = [];
  const invisible = material(new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  const targetGeo = classic
    ? geometry(new THREE.BoxGeometry(.98, (height - 1) * verticalStep + .98, .56))
    : geometry(new THREE.SphereGeometry(.53, 12, 8));
  // Box footprints avoid the numerical seam at the center of a circle's triangle fan.
  const topTargetGeo = geometry(new THREE.BoxGeometry(classic ? .96 : 1.02, .05, classic ? .56 : 1.02));
  for (let stack = 0; stack < width * depth; stack++) {
    const x = (stack % width - (width - 1) / 2) * spacing;
    const z = (Math.floor(stack / width) - (depth - 1) / 2) * spacing;
    const target = mesh(targetGeo, invisible, targetGroup); target.userData.stack = stack; targets.push(target);
    const topTarget = mesh(topTargetGeo, invisible, targetGroup);
    topTarget.position.set(x, classic ? 7.21 : boardTop + .02, z); topTarget.userData.stack = stack; targets.push(topTarget);
  }
  const ghostMat = material(new THREE.MeshPhysicalMaterial({ color: CORAL, roughness: .16, metalness: .06, transparent: true, opacity: .3, depthWrite: false, clearcoat: 1 }));
  const ghost = mesh(ballGeometry, ghostMat); ghost.visible = false; if (classic) ghost.rotation.x = Math.PI / 2;
  const glowMat = material(new THREE.MeshBasicMaterial({ color: CORAL, transparent: true, opacity: .65, depthWrite: false }));
  const selectionRing = mesh(geometry(new THREE.TorusGeometry(classic ? .49 : .51, .018, 8, 48)), glowMat);
  selectionRing.rotation.x = classic ? 0 : -Math.PI / 2; selectionRing.visible = false;
  const topSelectionRing = mesh(geometry(new THREE.TorusGeometry(.29, .024, 8, 40)), glowMat);
  topSelectionRing.rotation.x = -Math.PI / 2; topSelectionRing.visible = false;
  const guideMat = material(new THREE.LineDashedMaterial({ color: CORAL, transparent: true, opacity: .38, dashSize: .09, gapSize: .07 }));
  const guideGeo = geometry(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const guide = new THREE.Line(guideGeo, guideMat); scene.add(guide); guide.visible = false;

  let game = initial.game;
  let signature = '';
  let selected: number | null = initial.selectedStack;
  let hovered: number | null = null;
  let disposed = false;
  let suspended = document.hidden;
  let raf = 0;
  let previousTime = 0;
  let elapsed = 0;
  let cameraAnimation: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null = null;
  let lastWidth = 0, lastHeight = 0;
  let defaultPosition = new THREE.Vector3();
  let view = initial.view || 'perspective';
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const winningIndices = new Set<number>();

  function invalidate() {
    if (!disposed && !suspended && !raf) raf = requestAnimationFrame(frame);
  }

  function position(index: number) {
    const level = Math.floor(index / (width * depth));
    const stack = index % (width * depth);
    return new THREE.Vector3((stack % width - (width - 1) / 2) * spacing, bottom + level * verticalStep, (Math.floor(stack / width) - (depth - 1) / 2) * spacing);
  }
  function clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose(); geometries.delete(child.geometry);
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) { m.dispose(); materials.delete(m); }
      }
    }
  }
  function demoGame(): SceneGame {
    if (initial.game.moves?.length) return initial.game;
    const board = new Array(width * depth * height).fill(0);
    const heights = new Array(width * depth).fill(0);
    const layout = classic
      ? [[0,1,2],[1,2],[2,1,2,1],[3,2,1],[4,1,2,1,2],[5,2],[6,1,2]]
      : [[0,1,2],[1,2],[2,1,2,1],[3,2],[4,2],[5,1,2,1],[6,2,1],[7,1,2],[8,1,2,1],[9,2,1],[10,1],[11,2,1,2],[12,2],[13,1,2],[14,2,1],[15,1]];
    for (const [stack, ...colors] of layout) {
      colors.forEach((color, y) => { board[stack + width * depth * y] = color; }); heights[stack] = colors.length;
    }
    return { ...initial.game, board, heights, winner: null, winningLines: [] };
  }
  function setGame(value: SceneGame) {
    game = getOptions().demo ? demoGame() : value;
    const nextSignature = game.board.join('') + '/' + game.turn + '/' + game.winner;
    if (signature === nextSignature) { updateSelection(); return; }
    const first = signature === '';
    signature = nextSignature;
    winningIndices.clear();
    for (const line of game.winningLines || []) for (const index of line) winningIndices.add(index);
    for (const [index, piece] of pieces) {
      if (!game.board[index]) { scene.remove(piece); pieces.delete(index); }
    }
    for (let index = 0; index < game.board.length; index++) {
      const player = game.board[index]; if (!player) continue;
      let piece = pieces.get(index);
      const mat = player === 1 ? coralMat : blueMat;
      if (!piece) {
        piece = mesh(ballGeometry, mat); piece.position.copy(position(index));
        piece.userData.stack = index % (width * depth); piece.userData.index = index;
        if (classic) piece.rotation.x = Math.PI / 2;
        piece.castShadow = true; piece.receiveShadow = false; pieces.set(index, piece);
        if (!first && !getOptions().reducedMotion) {
          const target = piece.position.y;
          const from = classic ? 7.85 : boardTop + .75;
          piece.position.y = Math.max(target + .9, from);
          dropAnimations.push({ mesh: piece, from: piece.position.y, target, elapsed: 0, duration: .32 + .065 * Math.sqrt(piece.position.y - target), landed: false });
        } else if (!first) getOptions().onLand?.();
      }
      piece.material = winningIndices.size && !winningIndices.has(index) ? player === 1 ? dimCoral : dimBlue : mat;
    }
    for (let stack = 0; stack < width * depth; stack++) {
      const target = targets[stack * 2];
      target.position.copy(position(stack + width * depth * Math.min(game.heights[stack], height - 1)));
      if (classic) target.position.y = bottom + (height - 1) * verticalStep / 2;
      target.visible = game.heights[stack] < height;
      targets[stack * 2 + 1].visible = game.heights[stack] < height;
      if (topMarkers[stack]) topMarkers[stack].visible = game.heights[stack] < height && game.winner === null && !getOptions().demo;
    }
    clearGroup(winGroup);
    if (game.winningLines?.length) {
      for (const line of game.winningLines) {
        const a = position(line[0]); const b = position(line[line.length - 1]);
        if (classic) { a.z += .23; b.z += .23; }
        const m = material(new THREE.MeshBasicMaterial({ color: dark ? '#fff4d1' : '#ffffff', transparent: true, opacity: .9, depthTest: false }));
        const t = tubeBetween(a, b, .027, m, winGroup); t.renderOrder = 10;
        for (const index of line) {
          const p = position(index);
          if (classic) p.z += .23;
          const marker = mesh(geometry(new THREE.SphereGeometry(.065, 16, 12)), material(new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })), winGroup);
          marker.position.copy(p); marker.renderOrder = 11;
        }
      }
    }
    renderer.shadowMap.needsUpdate = true;
    updateSelection();
  }
  function updateSelection() {
    const options = getOptions();
    const stack = hovered ?? selected;
    const valid = options.interactive && !options.demo && game.winner === null && stack !== null && stack >= 0 && stack < width * depth && game.heights[stack] < height;
    ghost.visible = selectionRing.visible = valid;
    topSelectionRing.visible = valid && !classic;
    guide.visible = false;
    invalidate();
    if (!valid || stack === null) return;
    const p = position(stack + width * depth * game.heights[stack]);
    ghost.position.copy(p);
    topSelectionRing.position.set(p.x, boardTop + .025, p.z);
    ghostMat.color.set(game.turn === 1 ? CORAL : BLUE); glowMat.color.copy(ghostMat.color); guideMat.color.copy(ghostMat.color);
    selectionRing.position.copy(p);
    if (classic) selectionRing.position.z = .28;
    else selectionRing.position.y -= radius - .03;
    if (!classic && p.y < boardTop - .5) {
      const attr = guideGeo.getAttribute('position');
      attr.setXYZ(0, p.x, p.y + radius + .08, p.z); attr.setXYZ(1, p.x, boardTop + .08, p.z); attr.needsUpdate = true;
      guide.computeLineDistances(); guide.visible = true;
    }
  }
  function cameraTarget(): THREE.Vector3 {
    // Mobile layouts extend the canvas beyond the viewport. Frame for the visible
    // width, otherwise the board's front corners are cropped by the page.
    const aspect = Math.min(lastWidth, window.innerWidth) / Math.max(lastHeight, 1);
    const scale = Math.max(1, 1.03 / Math.max(.45, aspect));
    if (view === 'top' && !classic) return new THREE.Vector3(.01, 14.2 * scale, .01);
    return classic ? new THREE.Vector3(4.9 * scale, 6.8 * scale, 17 * scale) : new THREE.Vector3(8.7 * scale, 9.4 * scale, 11 * scale);
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const first = !lastWidth;
    const aspectChanged = Math.abs(rect.width / rect.height - lastWidth / Math.max(1,lastHeight)) > .3;
    lastWidth = rect.width; lastHeight = rect.height;
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    defaultPosition = cameraTarget();
    controls.maxDistance = Math.max(classic ? 26 : 23, defaultPosition.distanceTo(controls.target) * 1.3);
    if (first || aspectChanged) { camera.position.copy(defaultPosition); controls.update(); }
    invalidate();
  }
  function animateCamera(to: THREE.Vector3) {
    if (getOptions().reducedMotion) { camera.position.copy(to); controls.update(); cameraAnimation = null; }
    else cameraAnimation = { from: camera.position.clone(), to, start: performance.now(), duration: 650 };
    invalidate();
  }
  function reset() { view = 'perspective'; defaultPosition = cameraTarget(); animateCamera(defaultPosition); }
  function rotate() {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI / 2);
    animateCamera(offset.add(controls.target));
  }
  function setView(next: 'perspective' | 'top') { view = next; animateCamera(cameraTarget()); }
  function pick(event: PointerEvent): number | null {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = [...targets.filter(t => t.visible), ...pieces.values()];
    const hit = raycaster.intersectObjects(candidates, false)[0];
    if (!hit) return null;
    const stack = Number(hit.object.userData.stack);
    return Number.isInteger(stack) && game.heights[stack] < height ? stack : null;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let multiTouch = false;
  let activePointer: number | null = null;
  let downAt = 0;
  function pointerDown(event: PointerEvent) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) { dragged = false; multiTouch = false; activePointer = event.pointerId; downAt = performance.now(); }
    else { multiTouch = true; dragged = true; }
    cameraAnimation = null; invalidate();
  }
  function pointerMove(event: PointerEvent) {
    const start = pointers.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
      dragged = true; hovered = null; updateSelection(); canvas.style.cursor = 'grabbing'; return;
    }
    if (event.pointerType === 'mouse' && !pointers.size && getOptions().interactive) {
      const next = pick(event);
      if (next !== hovered) { hovered = next; updateSelection(); }
      canvas.style.cursor = next === null ? 'grab' : 'pointer';
    }
  }
  function pointerUp(event: PointerEvent) {
    const wasActive = activePointer === event.pointerId;
    const canDrop = wasActive && !dragged && !multiTouch && performance.now() - downAt < 650 && event.button === 0;
    pointers.delete(event.pointerId); invalidate();
    if (!pointers.size) { activePointer = null; canvas.style.cursor = 'grab'; }
    const options = getOptions();
    if (!canDrop || !options.interactive || options.demo || game.winner !== null || dropAnimations.some(a => !a.landed)) return;
    const stack = pick(event);
    if (stack === null) return;
    if (event.pointerType !== 'mouse' && selected !== stack) {
      selected = stack; hovered = null; options.onSelect(stack); updateSelection();
    } else {
      selected = stack; options.onSelect(stack); options.onDrop(stack); hovered = null; updateSelection();
    }
  }
  function pointerCancel(event: PointerEvent) { pointers.delete(event.pointerId); dragged = true; if (!pointers.size) activePointer = null; invalidate(); }
  function pointerLeave() { hovered = null; updateSelection(); canvas.style.cursor = 'grab'; }
  function onKey(event: KeyboardEvent) {
    const options = getOptions();
    if (!options.interactive || options.demo || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (selected !== null && game.heights[selected] < height && game.winner === null) options.onDrop(selected);
      event.preventDefault(); return;
    }
    let step = 0;
    switch (event.key) {
      case 'ArrowLeft': step = -1; break;
      case 'ArrowRight': step = 1; break;
      case 'ArrowUp': step = classic ? -1 : -width; break;
      case 'ArrowDown': step = classic ? 1 : width; break;
      default: return;
    }
    event.preventDefault();
    let stack = selected ?? (step > 0 ? width * depth - 1 : 0);
    for (let i = 0; i < width * depth; i++) {
      stack = (stack + step + width * depth) % (width * depth);
      if (game.heights[stack] < height) break;
    }
    if (game.heights[stack] >= height) return;
    selected = stack; hovered = null; options.onSelect(stack); updateSelection();
  }
  function onContext(event: Event) { event.preventDefault(); }
  function visibility() {
    suspended = document.hidden; previousTime = 0;
    if (suspended) { cancelAnimationFrame(raf); raf = 0; }
    else invalidate();
  }
  function contextLost(event: Event) { event.preventDefault(); getOptions().onError?.('The graphics connection was interrupted. Reload to restore the board.'); }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('pointerleave', pointerLeave);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  controls.addEventListener('start', () => { cameraAnimation = null; });
  controls.addEventListener('change', invalidate);
  resize(); setGame(initial.game);

  function frame(now: number) {
    raf = 0;
    if (disposed || suspended) return;
    const dt = previousTime ? Math.min((now - previousTime) / 1000, .05) : 1 / 60; previousTime = now; elapsed += dt;
    const options = getOptions();
    if (cameraAnimation) {
      const t = Math.min(1, (now - cameraAnimation.start) / cameraAnimation.duration);
      const smooth = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(cameraAnimation.from, cameraAnimation.to, smooth);
      if (t >= 1) cameraAnimation = null;
    }
    controls.autoRotate = !!options.demo && !options.reducedMotion && !pointers.size && view !== 'top';
    controls.autoRotateSpeed = .28;
    const cameraChanged = controls.update(dt);
    let changedShadow = false;
    for (let i = dropAnimations.length - 1; i >= 0; i--) {
      const anim = dropAnimations[i];
      if (!scene.children.includes(anim.mesh)) { dropAnimations.splice(i,1); continue; }
      anim.elapsed += dt;
      const t = Math.min(1, anim.elapsed / anim.duration);
      if (t < .78) {
        const fall = t / .78; anim.mesh.position.y = anim.from + (anim.target - anim.from) * fall * fall;
      } else {
        if (!anim.landed) { anim.landed = true; options.onLand?.(); }
        const bounce = (t - .78) / .22;
        anim.mesh.position.y = anim.target + Math.sin(bounce * Math.PI) * .085 * (1 - bounce);
      }
      changedShadow = true;
      if (t >= 1) { anim.mesh.position.y = anim.target; dropAnimations.splice(i,1); }
    }
    if (changedShadow) renderer.shadowMap.needsUpdate = true;
    for (const [index, piece] of pieces) {
      const pulse = winningIndices.has(index) && !options.reducedMotion ? 1 + Math.sin(elapsed * 2.7) * .018 : 1;
      piece.scale.setScalar(pulse);
    }
    if (ghost.visible) {
      ghostMat.opacity = options.reducedMotion ? .33 : .31 + Math.sin(elapsed * 3) * .045;
    }
    // Props may change without a scene rebuild (AI turn, reduced-motion preference).
    if (!options.interactive && ghost.visible) { ghost.visible = selectionRing.visible = topSelectionRing.visible = guide.visible = false; }
    renderer.render(scene, camera);
    const hasMotion = !options.reducedMotion && (ghost.visible || winningIndices.size > 0);
    if (cameraChanged || cameraAnimation || controls.autoRotate || dropAnimations.length > 0 || hasMotion) invalidate();
  }
  invalidate();
  requestAnimationFrame(() => { if (!disposed) getOptions().onReady?.(); });

  function dispose() {
    disposed = true; cancelAnimationFrame(raf); resizeObserver.disconnect(); controls.removeEventListener('change', invalidate); controls.dispose();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerCancel);
    canvas.removeEventListener('pointerleave', pointerLeave); canvas.removeEventListener('keydown', onKey);
    canvas.removeEventListener('contextmenu', onContext); canvas.removeEventListener('webglcontextlost', contextLost);
    document.removeEventListener('visibilitychange', visibility);
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    key.shadow.map?.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear(); canvas.remove();
  }
  return { setGame, setSelection(stack) { selected = stack; hovered = null; updateSelection(); }, reset, rotate, setView, dispose };
}

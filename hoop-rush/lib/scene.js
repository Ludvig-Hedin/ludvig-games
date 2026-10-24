import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COURT, hoopAt, makeShotVelocity } from './physics.mjs';
import { basketballTexture, deckTexture, floorTexture, shadowTexture, textTexture, arcadeScreen, canvasTexture } from './scene-assets.js';

const ORANGE = 0xff6a36;
const CYAN = 0x70dce1;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const tempMatrix = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempDirection = new THREE.Vector3();

/** A single renderer owns all arcade views, and never changes the simulation. */
export class HoopScene {
  constructor(container, { onError = () => {} } = {}) {
    this.container = container; this.onError = onError;
    this.mode = 'home'; this.theme = 'midnight'; this.skin = 'classic'; this.quality = 'auto';
    this.visualTime = 0; this.lastFrame = performance.now(); this.frames = 0; this.slowFrames = 0;
    this.disposed = false; this.textures = new Set(); this.liveBalls = new Map(); this.ballPool = [];
    this.materials = {}; this.accentMaterials = []; this.lights = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#090c12');
    this.scene.fog = new THREE.FogExp2('#090c12', .036);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) { onError(error); throw error; }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#090c12');
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'Three-dimensional basketball arcade');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
    this.contextLost = event => { event.preventDefault(); onError(new Error('Graphics context interrupted. Reload to resume.')); };
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    container.appendChild(this.canvas);
    this.homeCamera = new THREE.PerspectiveCamera(41, 1, .08, 90);
    this.cameras = [new THREE.PerspectiveCamera(47, 1, .06, 70), new THREE.PerspectiveCamera(47, 1, .06, 70)];
    this._createMaterials();
    this._createEnvironment();
    this.lanes = [this._createLane(0, 0, ORANGE), this._createLane(1, -4.6, CYAN)];
    this.lanes[1].group.visible = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  _texture(texture) { this.textures.add(texture); return texture; }

  _createMaterials() {
    const m = this.materials;
    m.frame = new THREE.MeshStandardMaterial({ color: '#252c34', metalness: .82, roughness: .32 });
    m.dark = new THREE.MeshStandardMaterial({ color: '#111720', metalness: .55, roughness: .37 });
    m.panel = new THREE.MeshStandardMaterial({ color: '#202732', metalness: .7, roughness: .27 });
    m.rubber = new THREE.MeshStandardMaterial({ color: '#17191c', roughness: .94 });
    m.chrome = new THREE.MeshStandardMaterial({ color: '#b5bdc5', metalness: .93, roughness: .2 });
    m.deck = new THREE.MeshStandardMaterial({ map: this._texture(deckTexture()), roughness: .7, metalness: .18 });
    m.net = new THREE.MeshStandardMaterial({ color: '#ecece1', roughness: .82 });
    m.glass = new THREE.MeshPhysicalMaterial({ color: '#c9dae0', metalness: .12, roughness: .12, transparent: true, opacity: .2, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    m.marking = new THREE.MeshBasicMaterial({ color: '#e8ecec', transparent: true, opacity: .77 });
    m.wire = new THREE.LineBasicMaterial({ color: '#77828d', transparent: true, opacity: .38 });
    m.ball = new THREE.MeshStandardMaterial({ map: this._texture(basketballTexture()), roughness: .77, metalness: .04 });
    m.ball.bumpMap = m.ball.map; m.ball.bumpScale = .004;
    this.ballGeometry = new THREE.SphereGeometry(COURT.ballRadius, 32, 24);
    this.shadowMap = this._texture(shadowTexture());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, .055);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = .55;
    room.dispose(); pmrem.dispose();
  }

  _box(group, size, position, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }

  _tube(group, a, b, radius, material, shadow = true) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
    mesh.castShadow = shadow; group.add(mesh); return mesh;
  }

  _decal(group, texture, width, height, position, rotation = [0, 0, 0], opacity = 1) {
    const material = new THREE.MeshBasicMaterial({ map: this._texture(texture), transparent: true, opacity, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(...position); mesh.rotation.set(...rotation); group.add(mesh); return mesh;
  }

  _createEnvironment() {
    const scene = this.scene, m = this.materials;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: this._texture(floorTexture()), roughness: .33, metalness: .45, color: '#a0a6b2' }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.045; floor.receiveShadow = true; scene.add(floor);
    this.floor = floor;
    this._box(scene, [28, 9, .2], [0, 4.4, -7.1], new THREE.MeshStandardMaterial({ color: '#131821', roughness: .85 }), false);
    this._box(scene, [.2, 9, 25], [10, 4.4, 2], m.dark, false);
    const stripe = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: .24 });
    for (const x of [-2, 2]) this._box(scene, [.025, .005, 8.1], [x, -.036, 1.6], stripe, false);
    this._box(scene, [4.02, .005, .025], [0, -.034, 5.64], stripe, false);
    const floorArc = new THREE.Mesh(new THREE.TorusGeometry(2.6, .015, 4, 100, Math.PI), stripe);
    floorArc.rotation.x = -Math.PI / 2; floorArc.position.set(0, -.032, 2.4); scene.add(floorArc);
    this._decal(scene, textTexture('RUSH', { color: '#ffffff', font: '900 145px Arial' }), 10.5, 2.7, [2, 4.15, -6.97], [0, 0, 0], .045);
    this._decal(scene, textTexture('ARCADE  /  CLUB', { color: '#b9c0cb', font: '500 58px Arial', tracking: 12 }), 5.8, .7, [2, 2.65, -6.95], [0, 0, 0], .23);
    const ambient = new THREE.HemisphereLight('#dbe6ff', '#2d1d13', 1.6); scene.add(ambient);
    const key = new THREE.DirectionalLight('#ffe8d0', 2.7);
    key.position.set(3, 8, 5); key.target.position.set(0, 1.7, .1); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -5; key.shadow.camera.near = .5; key.shadow.camera.far = 24;
    key.shadow.bias = -.00045; key.shadow.normalBias = .025;
    scene.add(key, key.target); this.keyLight = key;
    const warm = new THREE.PointLight(ORANGE, 18, 11, 2); warm.position.set(3.5, 3.4, -1.5); scene.add(warm); this.warmLight = warm;
    const cool = new THREE.PointLight('#5b9cd8', 15, 13, 2); cool.position.set(-4, 4, 1); scene.add(cool); this.coolLight = cool;
    const rim = new THREE.DirectionalLight('#83a7db', 1.4); rim.position.set(-4, 5, -6); scene.add(rim);
    for (const [x, z, color] of [[3.8, -5.9, ORANGE], [-4.8, -6.1, CYAN], [8, -5.9, ORANGE]]) {
      const lightMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      this._tube(scene, [x, .4, z], [x, 5.4, z], .022, lightMat, false);
      const bloom = this._decal(scene, canvasTexture(64, 256, (ctx, w, h) => {
        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)'); gradient.addColorStop(.5, 'rgba(255,255,255,.14)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      }), .85, 5.2, [x, 2.9, z + .015]);
      bloom.material.color.set(color);
    }
    for (const x of [-6, 0, 6]) {
      this._box(scene, [4.2, .08, .08], [x, 6.3, -.3], new THREE.MeshBasicMaterial({ color: '#b9cee5' }), false);
    }
    this._arcadeCabinet(-5.5, -3.7, .3, 'ORBIT', '#63a9cd');
    this._arcadeCabinet(-7.05, -4.6, .2, 'RALLY', '#ad7fc6');
    this._arcadeCabinet(4.9, -4.65, -.2, 'NEON', '#f6ac61');
    this._arcadeCabinet(6.35, -4.5, -.3, 'SPEED', '#65bcb1');
    // A soft contact patch grounds the main machine without post-processing.
    for (const x of [0, -4.6]) {
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.5), new THREE.MeshBasicMaterial({ map: this.shadowMap, transparent: true, opacity: .72, depthWrite: false }));
      contact.rotation.x = -Math.PI / 2; contact.position.set(x, -.029, .7); scene.add(contact);
    }
  }

  _arcadeCabinet(x, z, angle, title, color) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; this.scene.add(group);
    this._box(group, [1.03, 2.16, .7], [0, 1.08, 0], this.materials.dark, false);
    const side = new THREE.MeshStandardMaterial({ color: '#1a2531', roughness: .42, metalness: .6 });
    this._box(group, [.06, 2.32, .85], [-.55, 1.16, .025], side, false);
    this._box(group, [.06, 2.32, .85], [.55, 1.16, .025], side, false);
    this._decal(group, arcadeScreen(title, color), .88, 1.05, [0, 1.65, .36]);
    this._decal(group, textTexture(title, {color, font: '900 100px Arial'}), .96, .24, [0, 2.32, .41]);
    this._box(group, [1.1, .11, .55], [0, 1.04, .43], this.materials.panel, false);
    const accent = new THREE.MeshBasicMaterial({color, toneMapped:false});
    this._box(group, [.025, 2.3, .025], [-.56, 1.16, .46], accent, false);
    this._box(group, [.025, 2.3, .025], [.56, 1.16, .46], accent, false);
    this._tube(group, [-.22, 1.1, .5], [-.22, 1.25, .5], .018, this.materials.chrome, false);
    const stick = new THREE.Mesh(new THREE.SphereGeometry(.049, 10, 8), accent); stick.position.set(-.22, 1.25, .5); group.add(stick);
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .025, 10), accent);
      button.position.set(.14 + i * .11, 1.11, .52); group.add(button);
    }
    this._box(group, [.2, .3, .015], [0, .55, .366], this.materials.rubber, false);
    this._box(group, [.11, .013, .018], [0, .57, .38], this.materials.chrome, false);
  }

  _createLane(index, x, color) {
    const m = this.materials, group = new THREE.Group(); group.position.x = x; this.scene.add(group);
    const accent = new THREE.MeshStandardMaterial({color, roughness:.3, metalness:.5, emissive:color, emissiveIntensity:.12});
    const glowing = new THREE.MeshBasicMaterial({color, toneMapped:false});
    this.accentMaterials.push({accent, glowing, index});
    const rimMat = new THREE.MeshStandardMaterial({color:0xee592b, roughness:.31, metalness:.58});
    const floorY = z => .82 - .075 * z;
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5.25), m.deck);
    deck.rotation.x = -Math.PI / 2 + Math.atan(.075);
    deck.position.set(0, floorY(.7), .7); deck.receiveShadow = true; group.add(deck);
    for (const side of [-1, 1]) {
      const xx = side * 1.19;
      const vertices = new Float32Array([xx,.19,-1.95,xx,.19,3.34,xx,floorY(3.34),3.34,xx,floorY(-1.95),-1.95]);
      const panelGeometry = new THREE.BufferGeometry(); panelGeometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
      panelGeometry.setIndex(side === 1 ? [0,1,2,0,2,3] : [2,1,0,3,2,0]); panelGeometry.computeVertexNormals();
      const panel = new THREE.Mesh(panelGeometry,m.panel); panel.castShadow = true; group.add(panel);
      for (const zz of [-1.7, 3.04]) {
        this._box(group,[.13,.28,.13],[xx,.11,zz],m.frame);
        this._box(group,[.22,.055,.22],[xx,-.003,zz],m.rubber);
        const top = zz < 0 ? 4.5 : 1.66;
        this._tube(group,[xx,.3,zz],[xx,top,zz],.043,m.frame);
      }
      this._tube(group,[xx,.89,-1.7],[xx,.535,3.05],.047,m.frame);
      this._tube(group,[xx,4.1,-1.7],[xx,1.66,3.05],.038,m.frame);
      this._tube(group,[xx,4.1,-1.7],[xx,4.52,-1.7],.043,m.frame);
      this._tube(group,[xx * 1.012,.86,-1.7],[xx * 1.012,.505,3.05],.014,glowing,false);
      this._tube(group,[xx * 1.01,.34,-1.7],[xx * 1.01,.34,3.02],.009,glowing,false);
      this._wireSide(group,xx);
      this._decal(group, textTexture('HOOP RUSH', {color:index ? '#70dce1' : '#ee804c',font:'900 110px Arial'}), 2.55,.43,[xx + side*.007,.5,.25],[0,side*Math.PI/2,0],.8);
    }
    this._tube(group,[-1.19,4.52,-1.7],[1.19,4.52,-1.7],.043,m.frame);
    this._tube(group,[-1.19,.89,-1.7],[1.19,.89,-1.7],.043,m.frame);
    this._tube(group,[-1.19,.68,3.28],[1.19,.68,3.28],.067,m.rubber);
    this._box(group,[2.36,.29,.13],[0,.36,3.28],m.panel);
    this._box(group,[2.27,.018,.018],[0,.48,3.357],glowing,false);
    this._decal(group,textTexture('HOOP RUSH', {color:'#bcc3c9',font:'900 96px Arial',tracking:4}),1.18,.26,[0,.34,3.352]);
    this._decal(group,textTexture('01', {color:index ? '#70dce1' : '#ff8653',font:'900 150px Arial'}),.25,.22,[-.94,.34,3.353]);
    // Rear safety mesh stays behind the backboard.
    const rear = [];
    for(let xx=-1.15;xx<=1.16;xx+=.13) rear.push(xx,.99,-1.74,xx,4.41,-1.74);
    for(let yy=1.02;yy<=4.45;yy+=.13) rear.push(-1.15,yy,-1.74,1.15,yy,-1.74);
    const rearGeometry = new THREE.BufferGeometry(); rearGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rear,3));
    group.add(new THREE.LineSegments(rearGeometry,m.wire));
    const assembly = new THREE.Group(); group.add(assembly);
    this._box(assembly,[1.9,.055,.065],[0,4.025,COURT.boardZ-.025],m.frame);
    this._box(assembly,[1.9,.075,.065],[0,2.875,COURT.boardZ-.025],m.rubber);
    this._box(assembly,[.055,1.2,.065],[-.925,3.45,COURT.boardZ-.025],m.frame);
    this._box(assembly,[.055,1.2,.065],[.925,3.45,COURT.boardZ-.025],m.frame);
    const board = this._box(assembly,[COURT.boardWidth,COURT.boardTop-COURT.boardBottom,.025],[0,(COURT.boardTop+COURT.boardBottom)/2,COURT.boardZ],m.glass,false);
    board.renderOrder=2;
    const line = (a,b,width=.017) => this._tube(assembly,a,b,width,m.marking,false);
    for(const [a,b] of [
      [[-.89,2.915,COURT.boardZ+.021],[.89,2.915,COURT.boardZ+.021]],
      [[-.89,3.985,COURT.boardZ+.021],[.89,3.985,COURT.boardZ+.021]],
      [[-.89,2.915,COURT.boardZ+.021],[-.89,3.985,COURT.boardZ+.021]],
      [[.89,2.915,COURT.boardZ+.021],[.89,3.985,COURT.boardZ+.021]],
      [[-.29,3.1,COURT.boardZ+.025],[.29,3.1,COURT.boardZ+.025]],
      [[-.29,3.52,COURT.boardZ+.025],[.29,3.52,COURT.boardZ+.025]],
      [[-.29,3.1,COURT.boardZ+.025],[-.29,3.52,COURT.boardZ+.025]],
      [[.29,3.1,COURT.boardZ+.025],[.29,3.52,COURT.boardZ+.025]],
    ]) line(a,b,.009);
    this._box(assembly,[.18,.12,.07],[0,COURT.rimY-.02,COURT.boardZ+.04],rimMat);
    this._box(assembly,[.09,.038,.22],[0,COURT.rimY-.025,COURT.boardZ+.17],rimMat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimRadius,COURT.rimTube,12,80),rimMat);
    rim.rotation.x=Math.PI/2;rim.position.set(0,COURT.rimY,COURT.rimZ);rim.castShadow=true;assembly.add(rim);
    const net = this._createNet(assembly);
    const flare = new THREE.Mesh(new THREE.TorusGeometry(.26,.007,5,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
    flare.rotation.x=Math.PI/2;flare.position.set(0,COURT.rimY+.015,COURT.rimZ);assembly.add(flare);
    const boardLight = new THREE.PointLight(color,1.3,2.5,2);boardLight.position.set(0,3.3,-.7);assembly.add(boardLight);
    this._box(group,[2.43,.57,.2],[0,4.35,-1.72],m.dark);
    this._box(group,[2.38,.018,.016],[0,4.64,-1.605],glowing,false);
    this._box(group,[2.38,.018,.016],[0,4.06,-1.605],glowing,false);
    const marqueeTexture=this._texture(canvasTexture(1024,256,()=>{}));
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(2.31,.54),new THREE.MeshBasicMaterial({map:marqueeTexture,toneMapped:false}));
    marquee.position.set(0,4.35,-1.608);group.add(marquee);
    const held = new THREE.Mesh(this.ballGeometry,m.ball);held.position.set(0,COURT.launchY,COURT.launchZ);held.castShadow=true;group.add(held);
    for(const [bx,bz] of [[-.62,2.83],[.58,2.76],[-.28,2.45],[.26,2.43]]){
      const ball=new THREE.Mesh(this.ballGeometry,m.ball);ball.position.set(bx,floorY(bz)+COURT.ballRadius,bz);ball.rotation.set(bx*3,bz,1.4);ball.castShadow=true;group.add(ball);
    }
    const aim = new THREE.InstancedMesh(new THREE.SphereGeometry(.013,7,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,depthWrite:false}),24);
    aim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);aim.frustumCulled=false;aim.visible=false;group.add(aim);
    const lane={index,x,group,assembly,rim,net,flare,boardLight,held,aim,marqueeTexture,marqueeKey:'',netImpact:-20};
    this._drawMarquee(lane,0,60,true); return lane;
  }

  _wireSide(group,x){
    const points=[];
    const top=z=>4.1-(z+1.7)*(2.44/4.75),bottom=z=>.89-(z+1.7)*(.355/4.75);
    for(let z=-1.64;z<=3.03;z+=.14)points.push(x,bottom(z),z,x,top(z),z);
    for(let y=.64;y<=4.01;y+=.14){
      const zEnd=Math.min(3.05,-1.7+(4.1-y)*4.75/2.44);
      const zStart=Math.max(-1.7,-1.7+(.89-y)*4.75/.355);
      if(zEnd>zStart)points.push(x,y,zStart,x,y,zEnd);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    group.add(new THREE.LineSegments(geometry,this.materials.wire));
  }

  _createNet(group){
    const segments=16,rows=6,count=segments*rows*2;
    const net=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0034,.0034,1,5),this.materials.net,count);
    net.instanceMatrix.setUsage(THREE.DynamicDrawUsage);net.frustumCulled=false;group.add(net);
    this._updateNet(net,0,.235);return net;
  }

  _updateNet(net,impact,radius){
    let instance=0;
    const point=(i,row)=>{
      const p=row/6,a=(i+row*.5)*Math.PI*2/16;
      const bulge=Math.sin(p*Math.PI)*impact*.08;
      const r=radius*(1-p*.45)+bulge;
      return new THREE.Vector3(Math.cos(a)*r+Math.sin(p*Math.PI)*impact*.018,COURT.rimY-.035-p*.57-Math.sin(p*Math.PI)*Math.abs(impact)*.025,COURT.rimZ+Math.sin(a)*r);
    };
    for(let row=0;row<6;row++)for(let i=0;i<16;i++)for(const offset of[0,-1]){
      const a=point(i,row),b=point(i+offset,row+1);
      tempPosition.copy(a).add(b).multiplyScalar(.5);tempDirection.copy(b).sub(a);
      const length=tempDirection.length();tempQuaternion.setFromUnitVectors(UP,tempDirection.normalize());tempScale.set(1,length,1);
      tempMatrix.compose(tempPosition,tempQuaternion,tempScale);net.setMatrixAt(instance++,tempMatrix);
    }
    net.instanceMatrix.needsUpdate=true;
  }

  _drawMarquee(lane,score,remaining,home){
    const key=`${score}|${Math.ceil(remaining)}|${home}`;if(lane.marqueeKey===key)return;lane.marqueeKey=key;
    const canvas=lane.marqueeTexture.image,ctx=canvas.getContext('2d');ctx.clearRect(0,0,1024,256);
    ctx.fillStyle='#0c1017';ctx.fillRect(0,0,1024,256);
    ctx.fillStyle=lane.index?'#83e2e4':'#ff8b51';ctx.textBaseline='middle';
    if(home){
      ctx.font='900 italic 100px Arial';ctx.textAlign='center';ctx.fillText('HOOP RUSH',512,108);
      ctx.fillStyle='#959ba5';ctx.font='500 21px Arial';ctx.fillText('THE ARCADE CLASSIC. REBORN.',512,201);
    }else{
      ctx.textAlign='left';ctx.font='600 22px Arial';ctx.fillStyle='#9a9fab';ctx.fillText('SCORE',55,52);ctx.fillText('TIME',760,52);
      ctx.font='700 126px monospace';ctx.fillStyle=lane.index?'#83e2e4':'#ff8b51';ctx.fillText(String(score).padStart(2,'0'),45,159);
      ctx.textAlign='right';ctx.fillStyle=remaining<=10?'#ff6949':'#ece9e1';ctx.fillText(String(Math.max(0,Math.ceil(remaining))).padStart(2,'0'),975,159);
      ctx.fillStyle='#3b434f';ctx.fillRect(615,42,2,170);
      ctx.font='900 26px Arial';ctx.textAlign='center';ctx.fillStyle='#717985';ctx.fillText('RUSH',495,135);
    }
    lane.marqueeTexture.needsUpdate=true;
  }

  setMode(mode){
    if(this.mode===mode)return;this.mode=mode;
    this.lanes[1].group.visible=mode==='local'||mode==='versus'||mode==='online';
    this.resize();
  }

  setTheme(theme){
    if(this.theme===theme)return;this.theme=theme;
    const choices={midnight:{bg:'#090c12',warm:'#ff6a36',cool:'#5b9cd8',ambient:.55,exposure:1.1},sunset:{bg:'#160d15',warm:'#ff8045',cool:'#b173d0',ambient:.62,exposure:1.17},ice:{bg:'#081017',warm:'#6ecbdf',cool:'#7899e5',ambient:.65,exposure:1.12}};
    const p=choices[theme]||choices.midnight;
    this.scene.background.set(p.bg);this.scene.fog.color.set(p.bg);this.warmLight.color.set(p.warm);this.coolLight.color.set(p.cool);this.scene.environmentIntensity=p.ambient;this.renderer.toneMappingExposure=p.exposure;
    this.accentMaterials.forEach(({accent,glowing,index})=>{if(index===0){accent.color.set(p.warm);accent.emissive.set(p.warm);glowing.color.set(p.warm);}});
  }

  setSkin(skin){
    if(this.skin===skin)return;this.skin=skin;
    const old=this.materials.ball.map;
    const color={classic:'#d86527',arctic:'#c8dfe1',midnight:'#424d61'}[skin]||'#d86527';
    const map=this._texture(basketballTexture(color));this.materials.ball.map=map;this.materials.ball.bumpMap=map;this.materials.ball.needsUpdate=true;
    if(old){this.textures.delete(old);old.dispose();}
  }

  setQuality(quality){
    // Settings are reapplied for audio and cosmetic changes too. Retain an
    // adaptive downgrade unless the graphics setting actually changes.
    if(this.quality===quality)return;
    this.quality=quality;this.adaptiveRatio=undefined;this.slowFrames=0;this.frames=0;
    this.renderer.shadowMap.enabled=quality!=='low';this.resize();
  }

  resize(){
    if(this.disposed)return;
    const rect=this.container.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    const mobile=this.width<700,ratio=window.devicePixelRatio||1;
    const cap=this.quality==='low'?1:this.quality==='high'?1.8:mobile?1.3:1.6;
    this.renderer.setPixelRatio(Math.min(ratio,this.adaptiveRatio||cap));this.renderer.setSize(this.width,this.height,false);
    const aspect=this.width/this.height;
    this.homeCamera.aspect=aspect;
    this.homeCamera.clearViewOffset();
    if(aspect<.9){
      this.homeCamera.fov=42;this.homeCamera.position.set(5.9,4.4,10.6);this.homeCamera.lookAt(0,2.1,.6);
      this.homeCamera.setViewOffset(this.width,this.height,0,this.height*.19,this.width,this.height);
    }else{
      this.homeCamera.fov=40;this.homeCamera.position.set(5.9,3.9,8.4);this.homeCamera.lookAt(0,2.04,.5);
      this.homeCamera.setViewOffset(this.width,this.height,-this.width*.205,0,this.width,this.height);
    }
    this.homeCamera.updateProjectionMatrix();
    const laneAspect=this.mode==='local'?aspect/2:aspect;
    this.cameras.forEach((camera,i)=>{
      camera.aspect=laneAspect;camera.fov=laneAspect<.6?55:47;
      const z=laneAspect<.6?8.2:6.5;const x=this.lanes?.[i]?.x||0;
      camera.position.set(x,2.55,z);camera.lookAt(x,2.44,-.8);camera.updateProjectionMatrix();
    });
  }

  celebrate(lane=0,swish=false){
    const machine=this.lanes[lane];if(!machine)return;
    machine.netImpact=this.visualTime;machine.swish=swish;
  }

  _ballVisual(key,lane){
    let visual=this.liveBalls.get(key);if(visual)return visual;
    visual=this.ballPool.pop();
    if(!visual){
      const mesh=new THREE.Mesh(this.ballGeometry,this.materials.ball);mesh.castShadow=true;
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowMap,transparent:true,opacity:.3,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2+Math.atan(.075);visual={mesh,shadow};
    }
    this.lanes[lane].group.add(visual.mesh,visual.shadow);visual.mesh.visible=true;visual.shadow.visible=true;
    this.liveBalls.set(key,visual);return visual;
  }

  update({time=0,balls=[],aims=[],scores=[0,0],remaining=60,phase='home',challenge='classic',combo=[0,0]}={}){
    if(this.disposed)return;
    const now=performance.now(),dt=Math.min(.05,(now-this.lastFrame)/1000);this.lastFrame=now;this.visualTime+=dt;this.frames++;
    if(this.quality==='auto'&&this.frames>150&&this.mode!=='home'){
      if(dt>.027)this.slowFrames++;else this.slowFrames=Math.max(0,this.slowFrames-.25);
      if(this.slowFrames>75&&!this.adaptiveRatio){this.adaptiveRatio=1;this.renderer.shadowMap.enabled=false;this.resize();}
    }
    const active=new Set();
    for(const ball of balls){
      if(ball.dead)continue;const lane=ball.lane||0;if(!this.lanes[lane])continue;
      const key=`${lane}:${ball.id}`;active.add(key);const visual=this._ballVisual(key,lane);
      visual.mesh.position.set(ball.x,ball.y,ball.z);
      if(ball.rotation&&Number.isFinite(ball.rotation.w))visual.mesh.quaternion.set(ball.rotation.x,ball.rotation.y,ball.rotation.z,ball.rotation.w);
      else{visual.mesh.rotation.x+=dt*(ball.vz||0)*3;visual.mesh.rotation.z-=dt*(ball.vx||0)*3;}
      const y=.82-.075*ball.z,height=Math.max(0,ball.y-y),scale=.3+height*.16;
      visual.shadow.position.set(ball.x,y+.012,ball.z);visual.shadow.scale.set(scale,scale,scale);visual.shadow.material.opacity=.43/(1+height*.7);
      visual.shadow.visible=Math.abs(ball.x)<1.13&&ball.z>-1.8&&ball.z<3.25;
    }
    for(const[key,visual]of this.liveBalls){
      if(!active.has(key)){visual.mesh.visible=false;visual.shadow.visible=false;visual.mesh.removeFromParent();visual.shadow.removeFromParent();this.liveBalls.delete(key);this.ballPool.push(visual);}
    }
    const hoop=hoopAt(time,challenge);
    for(const lane of this.lanes){
      const aim=aims[lane.index]||{};
      lane.assembly.position.set(hoop.x||0,(hoop.y||COURT.rimY)-COURT.rimY,(hoop.z||COURT.rimZ)-COURT.rimZ);
      const radius=hoop.radius||COURT.rimRadius;lane.rim.scale.set(radius/COURT.rimRadius,radius/COURT.rimRadius,1);
      const impactAge=this.visualTime-lane.netImpact;
      const impact=impactAge<1.35?Math.sin(impactAge*19)*Math.exp(-impactAge*3.7):0;
      if(impactAge<1.5||lane.netRadius!==radius){this._updateNet(lane.net,impact,radius);lane.netRadius=radius;}
      lane.flare.visible=impactAge<.5;
      lane.flare.material.opacity=impactAge<.5?(.5-impactAge)*.8:0;
      lane.flare.scale.setScalar(1+clamp(impactAge,0,.5)*.4);
      lane.boardLight.intensity=1.3+(impactAge<.4?(.4-impactAge)*8:0);
      lane.held.visible=this.mode!=='home'&&phase!=='finished'&&phase!=='results';
      lane.held.position.set((aim.aim||0)*.07,COURT.launchY+(aim.active?.035:0),challenge==='distance'?3.6:COURT.launchZ);
      lane.held.rotation.set(.2,-.35,.25);
      lane.aim.visible=Boolean(aim.active)&&this.mode!=='home';
      if(lane.aim.visible){
        const velocity=makeShotVelocity(aim.aim||0,aim.power??.58,challenge);
        for(let j=0;j<24;j++){
          const t=.045+j*.029;
          tempPosition.set(velocity.vx*t,COURT.launchY+velocity.vy*t-4.905*t*t,(challenge==='distance'?3.6:COURT.launchZ)+velocity.vz*t);
          const size=1-j/36;tempScale.setScalar(size);tempQuaternion.identity();tempMatrix.compose(tempPosition,tempQuaternion,tempScale);lane.aim.setMatrixAt(j,tempMatrix);
        }
        lane.aim.instanceMatrix.needsUpdate=true;
      }
      this._drawMarquee(lane,scores[lane.index]||0,remaining,this.mode==='home');
    }
    this._render();
  }

  _render(){
    const r=this.renderer,w=this.width,h=this.height;
    if(this.mode==='local'){
      r.setScissorTest(true);
      r.setViewport(0,0,Math.floor(w/2),h);r.setScissor(0,0,Math.floor(w/2),h);r.render(this.scene,this.cameras[0]);
      r.setViewport(Math.floor(w/2),0,Math.ceil(w/2),h);r.setScissor(Math.floor(w/2),0,Math.ceil(w/2),h);r.render(this.scene,this.cameras[1]);
      r.setScissorTest(false);
    }else{
      r.setViewport(0,0,w,h);r.setScissorTest(false);r.render(this.scene,this.mode==='home'?this.homeCamera:this.cameras[0]);
    }
  }

  getDiagnostics(){return{drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio()};}

  dispose(){
    if(this.disposed)return;this.disposed=true;this.resizeObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this.contextLost);
    const geometries=new Set(),materials=new Set(),instances=new Set(),shadows=new Set();
    const collect=object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));if(object.isInstancedMesh)instances.add(object);if(object.isLight&&object.shadow)shadows.add(object.shadow);};
    this.scene.traverse(collect);for(const visual of this.ballPool){collect(visual.mesh);collect(visual.shadow);}
    for(const instance of instances)instance.dispose();for(const shadow of shadows)shadow.dispose();
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of this.textures)texture.dispose();
    this.environmentTarget.dispose();this.renderer.dispose();this.canvas.remove();this.liveBalls.clear();this.ballPool=[];
  }
}

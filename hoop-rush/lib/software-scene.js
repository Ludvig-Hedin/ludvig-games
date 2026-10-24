import { COURT, hoopAt, makeShotVelocity, launchPosition, floorAt } from './physics.mjs';

// A real perspective renderer for browsers without a usable WebGL context.
// All ball positions, collisions, scoring and controls remain in the shared game.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const THEMES = {
  midnight: { bg: '#080c12', high: '#202b3b', accent: '#ff773e', glow: 'rgba(215,74,23,.14)', cool: '#66b8cf', deck: '#252329' },
  sunset: { bg: '#130d17', high: '#36253e', accent: '#ff945a', glow: 'rgba(234,85,58,.17)', cool: '#bb8dcf', deck: '#34242c' },
  ice: { bg: '#071218', high: '#203c4a', accent: '#78dce8', glow: 'rgba(81,198,217,.14)', cool: '#8ba7ee', deck: '#1e3039' },
};

function rotate(point, q) {
  if (!q) return point;
  const [x, y, z] = point;
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + q.y * tz - q.z * ty, y + q.w * ty + q.z * tx - q.x * tz, z + q.w * tz + q.x * ty - q.y * tx];
}

function makeCamera(position, target, fov, view, shift = [0, 0], lensScale = 1) {
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = unit(cross(right, forward));
  const focal = view.h * lensScale / (2 * Math.tan(fov * Math.PI / 360));
  return {
    position, forward, right, up, focal, view,
    project(point) {
      const p = sub(point, position), depth = dot(p, forward);
      if (depth <= 0.08) return null;
      return { x: view.x + view.w * 0.5 + shift[0] + dot(p, right) * focal / depth,
        y: view.y + view.h * 0.5 + shift[1] - dot(p, up) * focal / depth, depth, scale: focal / depth };
    },
  };
}

export class SoftwareHoopScene {
  constructor(container, { onError = () => {} } = {}) {
    this.container = container; this.mode = 'home'; this.theme = 'midnight'; this.skin = 'classic'; this.quality = 'auto';
    this.disposed = false; this.visualTime = 0; this.lastFrame = performance.now(); this.impacts = [-100, -100];
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Three-dimensional basketball arcade, software graphics');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!this.ctx) { const error = new Error('Your browser cannot create a drawing surface.'); onError(error); throw error; }
    container.appendChild(this.canvas);
    this.state = { time: 0, balls: [], aims: [], scores: [0, 0], remaining: 60, phase: 'home', challenge: 'classic' };
    this.static = []; this.drawCalls = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setMode(mode) { if (this.mode !== mode) { this.mode = mode; this.resize(); } }
  setTheme(theme) { this.theme = THEMES[theme] ? theme : 'midnight'; }
  setSkin(skin) { this.skin = skin; }
  setQuality(quality) { this.quality = quality; this.resize(); }
  celebrate(lane = 0) { this.impacts[lane] = this.visualTime; }

  resize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.5);
    this.canvas.width = Math.round(this.width * this.pixelRatio); this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.render();
  }

  update(state = {}) {
    if (this.disposed) return;
    const now = performance.now();
    this.visualTime += Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    this.state = { ...this.state, ...state };
    this.render();
  }

  _polygon(queue, vertices, fill, stroke = null, width = 0.8, alpha = 1) {
    queue.push({ type: 'poly', vertices, fill, stroke, width, alpha });
  }
  _line(queue, a, b, color, radius = 0.012, opacity = 1, glow = false) {
    queue.push({ type: 'line', vertices: [a, b], color, radius, alpha: opacity, glow });
  }
  _box(queue, center, size, color = '#1c2531', alpha = 1) {
    const [x, y, z] = center, [w, h, d] = size.map(v => v / 2);
    const v = [[x-w,y-h,z-d],[x+w,y-h,z-d],[x+w,y+h,z-d],[x-w,y+h,z-d],
      [x-w,y-h,z+d],[x+w,y-h,z+d],[x+w,y+h,z+d],[x-w,y+h,z+d]];
    const face = (indices, light) => this._polygon(queue, indices.map(i => v[i]), color, '#59616c', 0.35, alpha * light);
    face([0,1,2,3], 0.82); face([4,5,6,7], 1); face([0,4,7,3], 0.86); face([1,5,6,2], 0.9);
    this._polygon(queue, [v[3],v[2],v[6],v[7]], '#35404d', '#57616e', 0.45, alpha);
  }
  _label(queue, center, width, height, text, color, options = {}) {
    const [x, y, z] = center;
    queue.push({ type: 'label', vertices: [[x-width/2,y+height/2,z],[x+width/2,y+height/2,z],[x+width/2,y-height/2,z],[x-width/2,y-height/2,z]], text, color, ...options });
  }
  _circle(queue, center, radius, color, thickness = 0.01, opacity = 1, segments = 48) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
      this._line(queue, [center[0]+Math.cos(a)*radius,center[1],center[2]+Math.sin(a)*radius],
        [center[0]+Math.cos(b)*radius,center[1],center[2]+Math.sin(b)*radius], color, thickness, opacity);
    }
  }

  _environment(queue, palette) {
    // The distant room is deliberately quiet; warm floor reflections ground it.
    this._polygon(queue, [[-15,0,-8],[15,0,-8],[15,8,-8],[-15,8,-8]], '#121b28');
    for (let x = -12; x <= 12; x += 2) this._line(queue, [x,0.004,-8],[x,0.004,11], '#536070', 0.003, 0.2);
    for (let z = -8; z <= 10; z += 2) this._line(queue, [-14,0.004,z],[14,0.004,z], '#536070', 0.003, 0.2);
    this._label(queue, [1,4.8,-7.97], 10, 2.7, 'RUSH', '#667288', { alpha: 0.1, font: '900 italic' });
    this._label(queue, [1,3.2,-7.95], 5.5, 0.4, 'ARCADE   /   CLUB', '#a5b8cf', { alpha: 0.18, font: '500', tracking: true });
    for (const [x, color] of [[-5.0,palette.cool],[4.5,palette.accent],[8.1,palette.cool]]) {
      this._line(queue, [x,0.3,-7.8],[x,6.4,-7.8], color, 0.023, 0.55, true);
    }
    for (const x of [-5.2,0,5.2]) this._line(queue, [x-1.6,6.2,-1.2],[x+1.6,6.2,-1.2], '#a9c7d6', 0.025, 0.65);
    for (const side of [-1,1]) this._line(queue,[side*1.8,0.01,-2.7],[side*1.8,0.01,5.8],palette.accent,0.009,0.3);
    this._line(queue,[-1.8,0.01,5.8],[1.8,0.01,5.8],palette.accent,0.009,0.3);
    this._cabinet(queue,-5.1,-4.4,'ORBIT',palette.cool);
    this._cabinet(queue,-6.7,-4.9,'RALLY','#a381b7');
    this._cabinet(queue,4.5,-5.2,'NEON',palette.accent);
    this._cabinet(queue,6.1,-5.0,'SPEED','#74afaf');
  }

  _cabinet(queue, x, z, title, color) {
    this._box(queue,[x,1.1,z],[1.02,2.2,0.78],'#18212d');
    this._box(queue,[x,1.02,z+0.43],[1.11,0.13,0.55],'#24323d');
    this._box(queue,[x,2.39,z+0.06],[1.13,0.34,0.9],'#1b2632');
    this._label(queue,[x,2.4,z+0.52],0.99,0.23,title,color,{font:'900 italic'});
    this._polygon(queue,[[x-.43,1.28,z+.405],[x+.43,1.28,z+.405],[x+.43,2.13,z+.405],[x-.43,2.13,z+.405]],'#050e16',color,0.8);
    for (const side of [-1,1]) this._line(queue,[x+side*.55,0.06,z+.45],[x+side*.55,2.54,z+.45],color,0.012,0.65,true);
    this._label(queue,[x,1.88,z+.42],0.64,0.11,title,color,{alpha:.7});
    // Tiny game graphics make the cabinets read as machines, not empty boxes.
    for (let i = 0; i < 6; i++) {
      const yy=1.35+i*.065,ww=.32-i*.035;
      this._line(queue,[x-ww,yy,z+.43],[x+ww,yy,z+.43],color,.004,.4);
    }
    this._line(queue,[x-.21,1.1,z+.54],[x-.21,1.28,z+.54],'#788791',.015);
    queue.push({type:'ball',vertices:[[x-.21,1.28,z+.54]],radius:.042,skin:'arctic',small:true});
    for(let i=0;i<3;i++) this._circle(queue,[x+.08+i*.11,1.1,z+.55],.035,color,.018,.8,10);
    this._box(queue,[x,.49,z+.405],[.22,.29,.025],'#080d14');
    this._line(queue,[x-.055,.54,z+.43],[x+.055,.54,z+.43],'#7b858e',.008,.6);
  }

  _machine(queue, lane, offset, palette) {
    const accent = lane ? '#76d9df' : palette.accent;
    const p = (x,y,z) => [x+offset,y,z];
    const back=-2.12,front=3.28;
    // Contact shadow and outer cabinet skin.
    queue.push({type:'shadow',vertices:[p(0,0.01,.65)],rx:1.5,rz:3.1,alpha:.45});
    this._polygon(queue,[p(-1.2,.18,back),p(1.2,.18,back),p(1.2,.18,front),p(-1.2,.18,front)],'#101722');
    this._polygon(queue,[p(-1.15,floorAt(back),back),p(1.15,floorAt(back),back),p(1.15,floorAt(front),front),p(-1.15,floorAt(front),front)],palette.deck,'#49505b',0.7);
    for(let z=back+.14;z<front;z+=.32) this._line(queue,p(-1.12,floorAt(z)+.003,z),p(1.12,floorAt(z)+.003,z),'#74747a',.002,.16);
    for (const x of [-.83,.83]) this._line(queue,p(x,floorAt(back)+.007,back),p(x,floorAt(front)+.007,front),'#b7a692',.006,.35);
    this._circle(queue,p(0,floorAt(.48)+.012,.48),.57,'#a8a3a0',.008,.24,40);
    for(const side of [-1,1]) {
      const x=side*1.19;
      this._polygon(queue,[p(x,.18,back),p(x,.18,front),p(x,floorAt(front),front),p(x,floorAt(back),back)],'#202b37','#3d4c5b',.8);
      this._line(queue,p(x,.35,back),p(x,.35,front),accent,.01,.7,true);
      this._line(queue,p(x,floorAt(back),back),p(x,floorAt(front),front),'#56606d',.045);
      this._line(queue,p(x+side*.015,floorAt(back)-.045,back),p(x+side*.015,floorAt(front)-.045,front),accent,.015,.95,true);
      for(const z of [back,3.05]) {
        const top=z<0?4.62:1.68;
        this._line(queue,p(x,.12,z),p(x,top,z),'#2c3948',.047);
        this._line(queue,p(x-.013,.15,z+.018),p(x-.013,top-.015,z+.018),'#7b8996',.007,.65);
        this._box(queue,p(x,.08,z),[.21,.13,.22],'#080d14');
      }
      this._line(queue,p(x,4.14,back),p(x,1.67,3.05),'#475361',.035);
      this._line(queue,p(x,4.14,back),p(x,4.62,back),'#344150',.044);
      // Fine wire, kept quiet and drawn at its true depth.
      const spacing=this.quality==='low'?.32:.23;
      for(let z=back+.1;z<3.06;z+=spacing) {
        const top=4.14-(z-back)*2.47/(3.05-back);
        this._line(queue,p(x,floorAt(z)+.03,z),p(x,top,z),'#91a2b0',.0024,.24);
      }
      for(let y=.83;y<4.1;y+=spacing) {
        const end=Math.min(3.05,back+(4.14-y)*(3.05-back)/2.47);
        const start=Math.max(back,(.82-y)/.075);
        if(end>start)this._line(queue,p(x,y,start),p(x,y,end),'#91a2b0',.0024,.24);
      }
    }
    for(let x=-1.08;x<=1.09;x+=.24)this._line(queue,p(x,1,back),p(x,4.1,back),'#7b8c9c',.0022,.2);
    for(let y=1.06;y<4.1;y+=.24)this._line(queue,p(-1.14,y,back),p(1.14,y,back),'#7b8c9c',.0022,.2);
    this._line(queue,p(-1.19,4.62,back),p(1.19,4.62,back),'#475563',.045);
    this._line(queue,p(-1.19,.69,front),p(1.19,.69,front),'#3c4551',.066);
    this._box(queue,p(0,.38,front),[2.39,.33,.14],'#202d3a');
    this._line(queue,p(-1.13,.53,front+.08),p(1.13,.53,front+.08),accent,.012,.92,true);
    this._label(queue,p(0,.36,front+.078),1.12,.17,'HOOP RUSH','#b9c5cc',{font:'900'});
    this._label(queue,p(-.96,.37,front+.08),.19,.16,lane?'02':'01',accent,{font:'900'});
    this._box(queue,p(0,4.35,back+.02),[2.43,.55,.21],'#0d1520');
    this._line(queue,p(-1.18,4.64,back+.135),p(1.18,4.64,back+.135),accent,.012,.85,true);
    this._line(queue,p(-1.18,4.065,back+.135),p(1.18,4.065,back+.135),accent,.011,.8,true);
    const home=this.mode==='home';
    this._label(queue,p(0,4.35,back+.133),2.29,.49,home?'HOOP RUSH':'',accent,{
      font:'900 italic',marquee:true,home,lane,score:this.state.scores?.[lane]||0,remaining:this.state.remaining??60,
    });
    for(const [x,z,r] of [[-.65,2.83,.3],[.59,2.76,1.2],[-.28,2.45,.7],[.29,2.39,2.1]]) {
      queue.push({type:'ball',vertices:[p(x,floorAt(z)+COURT.ballRadius,z)],radius:COURT.ballRadius,skin:this.skin,rotation:{x:Math.sin(r/2),y:0,z:0,w:Math.cos(r/2)}});
    }
    this._hoop(queue,lane,offset,accent);
  }

  _hoop(queue,lane,offset,accent) {
    const hoop=hoopAt(this.state.time||0,this.state.challenge||'classic');
    const p=(x,y,z)=>[x+offset+hoop.x,y+hoop.y-COURT.rimY,z];
    const z=COURT.boardZ;
    this._polygon(queue,[p(-.9,2.9,z),p(.9,2.9,z),p(.9,4,z),p(-.9,4,z)],'#91a6b5','#9fb4c4',.85,.14);
    const boardEdges=[[-.92,2.88,.92,2.88],[-.92,4.02,.92,4.02],[-.92,2.88,-.92,4.02],[.92,2.88,.92,4.02]];
    for(const[x1,y1,x2,y2]of boardEdges)this._line(queue,p(x1,y1,z+.025),p(x2,y2,z+.025),'#8999a7',.026,.9);
    for(const[x1,y1,x2,y2]of [[-.87,2.94,.87,2.94],[-.87,3.96,.87,3.96],[-.87,2.94,-.87,3.96],[.87,2.94,.87,3.96],[-.29,3.1,.29,3.1],[-.29,3.52,.29,3.52],[-.29,3.1,-.29,3.52],[.29,3.1,.29,3.52]]) {
      this._line(queue,p(x1,y1,z+.035),p(x2,y2,z+.035),'#e3e9e9',.008,.8);
    }
    // A restrained reflected streak gives the backboard a glass finish.
    this._polygon(queue,[p(-.83,3.82,z+.02),p(.48,3.98,z+.02),p(.72,3.98,z+.02),p(-.83,3.72,z+.02)],'#c9e4ed',null,1,.07);
    this._box(queue,p(0,COURT.rimY-.02,z+.05),[.18,.12,.08],'#db6137');
    this._line(queue,p(0,COURT.rimY,z+.05),p(0,COURT.rimY,COURT.rimZ-.21),'#ed7044',.027);
    const segments=this.quality==='low'?36:56;
    for(let i=0;i<segments;i++) {
      const a=i/segments*TAU,b=(i+1)/segments*TAU;
      const color=Math.sin(a)>.15?'#ff9050':'#c84a29';
      this._line(queue,p(Math.cos(a)*hoop.radius,COURT.rimY,COURT.rimZ+Math.sin(a)*hoop.radius),p(Math.cos(b)*hoop.radius,COURT.rimY,COURT.rimZ+Math.sin(b)*hoop.radius),color,COURT.rimTube,1);
    }
    const since=this.visualTime-this.impacts[lane];
    const pulse=since<1.4?Math.sin(since*20)*Math.exp(-since*3.5):0;
    const point=(i,row)=>{
      const t=row/5,a=(i+row*.5)/12*TAU;
      const r=hoop.radius*(1-t*.45)+Math.sin(t*Math.PI)*pulse*.06;
      return p(Math.cos(a)*r+Math.sin(t*Math.PI)*pulse*.025,COURT.rimY-.035-t*.58,COURT.rimZ+Math.sin(a)*r);
    };
    for(let row=0;row<5;row++)for(let i=0;i<12;i++)for(const diagonal of[0,-1]) {
      this._line(queue,point(i,row),point(i+diagonal,row+1),'#e8e5d8',.0035,.65);
    }
    if(since<.55) this._circle(queue,p(0,COURT.rimY+.025,COURT.rimZ),hoop.radius+.02+since*.17,accent,.008,(.55-since)*1.2,36);
  }

  _movingObjects(queue,lane,offset,palette) {
    const p=(x,y,z)=>[x+offset,y,z];
    for(const ball of this.state.balls||[]) {
      if(ball.dead||(ball.lane||0)!==lane)continue;
      if(Math.abs(ball.x)<1.12&&ball.z>-2.1&&ball.z<3.3) {
        const height=Math.max(0,ball.y-floorAt(ball.z));
        queue.push({type:'shadow',vertices:[p(ball.x,floorAt(ball.z)+.016,ball.z)],rx:.15+height*.065,rz:.15+height*.065,alpha:.4/(1+height*.6)});
      }
      queue.push({type:'ball',vertices:[p(ball.x,ball.y,ball.z)],radius:COURT.ballRadius,skin:this.skin,rotation:ball.rotation});
    }
    const aim=this.state.aims?.[lane]||{};
    if(this.mode!=='home'&&!['finished','results'].includes(this.state.phase)) {
      const launch=launchPosition(this.state.challenge);
      queue.push({type:'ball',vertices:[p((aim.aim||0)*.07,launch.y+(aim.active?.035:0),launch.z)],radius:COURT.ballRadius,skin:this.skin,rotation:{x:.12,y:-.2,z:.08,w:.968}});
      if(aim.active) {
        const v=makeShotVelocity(aim.aim||0,aim.power??.58,this.state.challenge);
        for(let i=0;i<24;i++) {
          const t=.05+i*.03;
          queue.push({type:'dot',vertices:[p(v.vx*t,launch.y+v.vy*t-4.905*t*t,launch.z+v.vz*t)],radius:.013*(1-i/38),color:lane?'#8ce5e7':palette.accent,alpha:.7-i*.015});
        }
      }
    }
  }

  _background(ctx, view, palette) {
    const {x,y,w,h}=view;
    ctx.fillStyle=palette.bg;ctx.fillRect(x,y,w,h);
    const atmosphere=ctx.createLinearGradient(x,y,x,y+h);
    atmosphere.addColorStop(0,palette.bg);atmosphere.addColorStop(.52,palette.high);atmosphere.addColorStop(1,'#070b11');
    ctx.fillStyle=atmosphere;ctx.fillRect(x,y,w,h);
    const gx=x+w*(this.mode==='home'?.73:.5),gy=y+h*.43;
    const glow=ctx.createRadialGradient(gx,gy,0,gx,gy,Math.max(w,h)*.65);
    glow.addColorStop(0,palette.glow);glow.addColorStop(.7,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;ctx.fillRect(x,y,w,h);
  }

  _drawItem(item,camera) {
    const ctx=this.ctx,points=item.points;
    if(!points?.length)return;
    this.drawCalls++;
    ctx.globalAlpha=item.alpha??1;
    if(item.type==='poly') {
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      if(item.fill){ctx.fillStyle=item.fill;ctx.fill();}
      if(item.stroke){ctx.strokeStyle=item.stroke;ctx.lineWidth=item.width||.7;ctx.stroke();}
    } else if(item.type==='line') {
      const [a,b]=points;const width=Math.max(.42,item.radius*2*(a.scale+b.scale)/2);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=item.color;ctx.lineWidth=width;
      if(item.glow){ctx.shadowColor=item.color;ctx.shadowBlur=7;}ctx.stroke();ctx.shadowBlur=0;
    } else if(item.type==='ball') {
      this._drawBall(item,camera);
    } else if(item.type==='dot') {
      const p=points[0];ctx.fillStyle=item.color;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.7,item.radius*p.scale),0,TAU);ctx.fill();
    } else if(item.type==='shadow') {
      const center=item.vertices[0];
      const ring=[];
      for(let i=0;i<32;i++) {const a=i/32*TAU;const p=camera.project([center[0]+Math.cos(a)*item.rx,center[1],center[2]+Math.sin(a)*item.rz]);if(p)ring.push(p);}
      const p=points[0],r=Math.max(3,...ring.map(q=>Math.hypot(q.x-p.x,q.y-p.y)));
      const gradient=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);gradient.addColorStop(0,'rgba(0,0,0,.85)');gradient.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ring.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
    } else if(item.type==='label') {
      this._drawLabel(item);
    }
    ctx.globalAlpha=1;
  }

  _drawLabel(item) {
    const ctx=this.ctx,[tl,tr,,bl]=item.points;
    const w=800,h=item.marquee?180:140;
    ctx.save();
    ctx.beginPath();item.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();
    ctx.transform((tr.x-tl.x)/w,(tr.y-tl.y)/w,(bl.x-tl.x)/h,(bl.y-tl.y)/h,tl.x,tl.y);
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(item.marquee) {
      ctx.fillStyle='#08101a';ctx.fillRect(0,0,w,h);
      if(item.home) {
        ctx.fillStyle=item.color;ctx.font='900 italic 94px Arial, sans-serif';ctx.fillText('HOOP RUSH',w/2,70);
        ctx.fillStyle='#8896a3';ctx.font='500 17px Arial, sans-serif';ctx.fillText('THE ARCADE CLASSIC. REBORN.',w/2,142);
      } else {
        ctx.textAlign='left';ctx.font='600 21px Arial, sans-serif';ctx.fillStyle='#8d9aa8';ctx.fillText('SCORE',32,26);ctx.fillText('TIME',601,26);
        ctx.font='700 118px monospace';ctx.fillStyle=item.color;ctx.fillText(String(item.score).padStart(2,'0'),26,109);
        ctx.textAlign='right';ctx.fillStyle=item.remaining<=10?'#ff815d':'#f0eee3';ctx.fillText(String(Math.ceil(Math.max(0,item.remaining))).padStart(2,'0'),770,109);
        ctx.textAlign='center';ctx.font='900 italic 30px Arial, sans-serif';ctx.fillStyle='#677582';ctx.fillText('RUSH',413,100);
      }
    } else {
      ctx.fillStyle=item.color;ctx.font=`${item.font||'700'} 100px Arial, sans-serif`;ctx.fillText(item.text,w/2,h/2,w*.97);
    }
    ctx.restore();
  }

  _drawBall(item,camera) {
    const ctx=this.ctx,p=item.points[0],r=item.radius*p.scale;
    if(r<.4)return;
    const skin=item.skin||'classic';
    const colors=skin==='arctic'?['#eff3e5','#b9d4d9','#577784']:skin==='midnight'?['#8597ac','#46586f','#182335']:['#ffb46d','#d86a2e','#6d2a16'];
    const gradient=ctx.createRadialGradient(p.x-r*.34,p.y-r*.4,r*.08,p.x+r*.08,p.y+r*.13,r*1.12);
    gradient.addColorStop(0,colors[0]);gradient.addColorStop(.45,colors[1]);gradient.addColorStop(1,colors[2]);
    ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,r-.1,0,TAU);ctx.clip();
    if(r>9&&!item.small) {
      ctx.fillStyle=skin==='arctic'?'rgba(30,53,59,.14)':'rgba(39,15,10,.18)';
      for(let iy=-3;iy<=3;iy++)for(let ix=-3;ix<=3;ix++) {
        const dx=(ix+(iy%2)*.5)*r*.24,dy=iy*r*.24;if(dx*dx+dy*dy>r*r*.84)continue;
        ctx.beginPath();ctx.arc(p.x+dx,p.y+dy,Math.max(.3,r*.011),0,TAU);ctx.fill();
      }
    }
    const center=item.vertices[0],facing=unit(sub(camera.position,center));
    ctx.strokeStyle=skin==='midnight'?'#151f2c':'#39271e';ctx.lineWidth=Math.max(.7,r*.047);ctx.lineCap='round';
    if(!item.small)for(let seam=0;seam<3;seam++) {
      ctx.beginPath();let connected=false;
      for(let i=0;i<=56;i++) {
        const a=i/56*TAU;
        const v=rotate(seam===0?[Math.cos(a),Math.sin(a),0]:seam===1?[0,Math.cos(a),Math.sin(a)]:[Math.cos(a)*.707,Math.sin(a),Math.cos(a)*.707],item.rotation);
        if(dot(v,facing)<.025){connected=false;continue;}
        const q=camera.project(add(center,v.map(n=>n*item.radius*1.003)));if(!q){connected=false;continue;}
        if(connected)ctx.lineTo(q.x,q.y);else{ctx.moveTo(q.x,q.y);connected=true;}
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle='rgba(255,224,187,.18)';ctx.lineWidth=.65;ctx.beginPath();ctx.arc(p.x,p.y,r,-Math.PI*.85,-Math.PI*.1);ctx.stroke();
  }

  _view(view,lane=0,split=false) {
    const ctx=this.ctx,palette=THEMES[this.theme]||THEMES.midnight;
    ctx.save();ctx.beginPath();ctx.rect(view.x,view.y,view.w,view.h);ctx.clip();
    this._background(ctx,view,palette);
    const home=this.mode==='home',aspect=view.w/view.h;
    let camera;
    if(home) {
      const mobile=aspect<.9;
      camera=mobile?makeCamera([7.4,5,12.6],[0,2.1,.6],43,view,[0,-view.h*.19],.78)
        :makeCamera([5.9,3.9,8.4],[0,2.04,.5],40,view,[view.w*.205,0]);
    } else {
      camera=makeCamera([0,2.55,aspect<.6?8.2:6.5],[0,2.44,-.8],aspect<.6?55:47,view);
    }
    const queue=[];
    this._environment(queue,palette);
    this._machine(queue,lane,0,palette);this._movingObjects(queue,lane,0,palette);
    if(!split&&['versus','online'].includes(this.mode)) {
      this._machine(queue,1,-4.6,palette);this._movingObjects(queue,1,-4.6,palette);
    }
    const visible=[];
    for(const item of queue) {
      const points=item.vertices.map(v=>camera.project(v));
      if(points.some(p=>!p))continue;
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y),padding=item.type==='ball'?item.radius*points[0].scale:40;
      if(Math.max(...xs)<view.x-padding||Math.min(...xs)>view.x+view.w+padding||Math.max(...ys)<view.y-padding||Math.min(...ys)>view.y+view.h+padding)continue;
      item.points=points;item.depth=points.reduce((sum,p)=>sum+p.depth,0)/points.length;visible.push(item);
    }
    visible.sort((a,b)=>b.depth-a.depth);
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const item of visible)this._drawItem(item,camera);
    // Room-edge falloff stays subtle so it never hides a live ball or target.
    const vignette=ctx.createRadialGradient(view.x+view.w*.5,view.y+view.h*.48,view.w*.25,view.x+view.w*.5,view.y+view.h*.48,Math.max(view.w,view.h)*.83);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(2,4,8,.5)');ctx.fillStyle=vignette;ctx.fillRect(view.x,view.y,view.w,view.h);
    ctx.restore();
  }

  render() {
    if(this.disposed||!this.ctx||!this.width)return;
    const ctx=this.ctx;ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);ctx.globalAlpha=1;ctx.shadowBlur=0;this.drawCalls=0;
    if(this.mode==='local') {
      const left=Math.floor(this.width/2);
      this._view({x:0,y:0,w:left,h:this.height},0,true);
      this._view({x:left,y:0,w:this.width-left,h:this.height},1,true);
      ctx.fillStyle='#34414e';ctx.fillRect(left-.5,0,1,this.height);
    } else this._view({x:0,y:0,w:this.width,h:this.height});
  }

  getDiagnostics() { return { renderer:'Canvas2D perspective',drawCalls:this.drawCalls,triangles:0,geometries:0,textures:0,pixelRatio:this.pixelRatio }; }
  dispose() { if(this.disposed)return;this.disposed=true;this.resizeObserver.disconnect();this.canvas.remove();this.state=null;this.ctx=null; }
}

/**
 * LAST CART — deterministic, renderer-independent arcade simulation.
 * Coordinates are world X/Z. Heading 0 points +Z; PI points towards -Z.
 * All human and bot carts use the same movement, collision and pickup rules.
 */
export const COLORS = [0xff6449, 0x6adce5, 0xf4d660, 0xada0ff, 0x9dd59c, 0xf4abd2, 0xf2eee1, 0xaabcc8];

export const ARENAS = [
  {
    id: 'rooftop', name: 'Rooftop Riot', subtitle: 'The original bad idea.',
    accent: 0xffb06e, sky: 0xe6b4a0, floor: 0x586b70,
    obstacles: [
      { id: 0, x: -6, z: -4, r: 1.45, type: 'vent' },
      { id: 1, x: 6, z: -4, r: 1.45, type: 'vent' },
      { id: 2, x: -7, z: 4.5, r: 1.12, type: 'bumper' },
      { id: 3, x: 7, z: 4.5, r: 1.12, type: 'bumper' }
    ],
    pickupPositions: [{x:-4,z:1},{x:4,z:1},{x:0,z:-5.8},{x:0,z:5.8}]
  },
  {
    id: 'nightshift', name: 'Night Shift', subtitle: 'Clock out. Knock out.',
    accent: 0x8ee7e3, sky: 0x354864, floor: 0x434e68,
    obstacles: [
      { id: 0, x: -5, z: -5, r: 1.15, type: 'bumper' },
      { id: 1, x: 5, z: -5, r: 1.15, type: 'bumper' },
      { id: 2, x: -5, z: 5, r: 1.15, type: 'bumper' },
      { id: 3, x: 5, z: 5, r: 1.15, type: 'bumper' },
      { id: 4, x: 0, z: 0, r: 1.65, type: 'vent' }
    ],
    pickupPositions: [{x:-6.5,z:0},{x:6.5,z:0},{x:0,z:-6.5},{x:0,z:6.5}]
  },
  {
    id: 'loading', name: 'Loading Zone', subtitle: 'Express delivery. No brakes.',
    accent: 0xd5da7c, sky: 0xb3c4bd, floor: 0x6c7670,
    obstacles: [
      { id: 0, x: -6, z: -2, r: 1.65, type: 'vent' },
      { id: 1, x: 6, z: 2, r: 1.65, type: 'vent' },
      { id: 2, x: -2, z: 5.7, r: 1.05, type: 'bumper' },
      { id: 3, x: 2, z: -5.7, r: 1.05, type: 'bumper' }
    ],
    pickupPositions: [{x:-6,z:5},{x:6,z:-5},{x:0,z:-1},{x:0,z:2}]
  }
];

const TAU = Math.PI * 2;
const RADIUS = 0.92;
const EDGE = 18;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));
const BOTS = ['CART FATHER', 'MILK RUN', 'UNPAID INTERN', 'AISLE 9', 'BAG LAD', 'NO RECEIPT', 'OAT MENACE'];
const SPAWNS = [[0,10],[0,-10],[-11.6,0],[11.6,0],[-9.6,-9.6],[9.6,-9.6],[-9.6,9.6],[9.6,9.6]];

export class Simulation {
  constructor({mode='solo', difficulty='normal', arena=0, seed=1337, playerColor=0, round=1}={}) {
    this.mode = ['solo','local','daily'].includes(mode) ? mode : 'solo';
    this.difficulty = difficulty === 'spicy' ? 'spicy' : 'normal';
    const arenaIndex = typeof arena === 'string' ? ARENAS.findIndex(a=>a.id===arena) : Number(arena);
    this.arena = ARENAS[((Number.isFinite(arenaIndex) ? arenaIndex : 0) % ARENAS.length + ARENAS.length) % ARENAS.length];
    this.seed = (Number(seed) >>> 0) || 1337;
    this._rng = this.seed;
    this.round = Math.max(1, Math.floor(round) || 1);
    this.state = 'countdown';
    this.time = 0;
    this.countdown = 3;
    this.safeRadius = 17;
    this.winnerId = null;
    this.finishReason = null;
    this.effects = [];
    this.chaos = {name:'', label:'', remaining:0, type:'none'};
    this._chaosIndex = 0;
    this._nextChaos = 18;
    this._pairCooldown = new Map();
    this._eliminationOrder = [];
    this._nextPickupId = 0;
    this.obstacles = this.arena.obstacles.map(o=>({...o}));
    this.pickups = this.arena.pickupPositions.map((p,i)=>({
      id:this._nextPickupId++, x:p.x, z:p.z, type:i%2===0?'boost':'shield', active:true, respawn:0
    }));
    const colorIndex = ((Math.floor(Number(playerColor)) || 0)%COLORS.length + COLORS.length)%COLORS.length;
    this.players = SPAWNS.map(([x,z], id) => {
      const human = id===0 || (id===1 && this.mode==='local');
      return {
        id, name:id===0?'YOU':human?'P2':BOTS[id-1], human, slot:human?id:-1,
        color:COLORS[(colorIndex+id)%COLORS.length], x,z,y:0, vx:0,vz:0,
        angle:Math.atan2(-x,-z), alive:true, falling:false, fallTime:0,
        boost:1, boosting:0, driftCharge:0, drift:false, wobble:0, shield:0,
        kills:0, score:0, placement:null, speed:0, rumble:0, angularVelocity:0, hitstun:0,
        _boostHeld:false, _driftHeld:false, _lastHitId:null, _lastHitTime:-100,
        _obstacleCooldown:0, _driftTimer:0,
        _bot:{timer:this.random()*.25, x:0,z:0, boost:false, drift:false,
          target:null, error:(this.random()-.5)*.6, aggression:.65+this.random()*.55,
          recovery:0, lastX:x,lastZ:z, stuck:0}
      };
    });
    this._emit({type:'countdown', value:3});
  }

  random() {
    // Mulberry32: seed-local randomness, never dependent on render frame rate.
    this._rng = (this._rng + 0x6D2B79F5) >>> 0;
    let t = this._rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  takeEvents() {
    const events = this.effects;
    this.effects = [];
    return events;
  }

  _emit(event) {
    if (this.effects.length >= 240) this.effects.shift();
    this.effects.push({time:this.time, ...event});
  }

  /** Advance by a real time delta. Call at a fixed 1/120 s for exact replay. */
  step(dt, inputs=[]) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const total = Math.min(dt, .1);
    const n = Math.max(1, Math.ceil(total / (1/120)));
    const tick = total/n;
    for (let i=0;i<n;i++) this._tick(tick, inputs);
  }

  _tick(dt, inputs) {
    this._updateFalls(dt);
    if (this.state==='finished') return;
    if (this.state==='countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown-dt);
      if (Math.ceil(this.countdown)<before && this.countdown>0) this._emit({type:'countdown',value:Math.ceil(this.countdown)});
      if (this.countdown<=1e-7) {
        this.countdown=0;
        this.state='playing';
        this._emit({type:'countdown',value:0});
      }
      return;
    }

    this.time += dt;
    this.safeRadius = this.time<=20 ? 17 : Math.max(2.3, 17-(this.time-20)*.245);
    for (const [key, value] of this._pairCooldown) {
      if (value<=dt) this._pairCooldown.delete(key);
      else this._pairCooldown.set(key,value-dt);
    }
    this._updateChaos(dt);
    this._updatePickups(dt);

    for (const p of this.players) {
      if (!p.alive) continue;
      const input = p.human ? (inputs[p.slot] || {}) : this._botInput(p,dt);
      this._move(p, input, dt);
    }
    // Two positional iterations prevent a dense pile-up from leaving carts embedded.
    for (let iteration=0; iteration<2; iteration++) {
      for (const p of this.players) if (p.alive) this._obstacleCollisions(p);
      for (let i=0;i<this.players.length;i++) for(let j=i+1;j<this.players.length;j++) {
        const a=this.players[i], b=this.players[j];
        if(a.alive && b.alive) this._cartCollision(a,b);
      }
    }
    for(const p of this.players) {
      if(!p.alive) continue;
      p.speed=Math.hypot(p.vx,p.vz);
      if(Math.abs(p.x)>EDGE || Math.abs(p.z)>EDGE) this._eliminate(p);
      else this._collect(p);
    }
    const alive=this.players.filter(p=>p.alive);
    if(alive.length<=1) this._finish(alive[0]?.id ?? this._eliminationOrder.at(-1) ?? 0, 'knockout');
    else if(this.time>=82) {
      // Transparent sudden-death tie-break: knockouts, then stability, then distance to centre.
      alive.sort((a,b)=>(b.kills-a.kills)*1000 + (a.wobble-b.wobble)*2 + Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z) || a.id-b.id);
      this._finish(alive[0].id,'time');
    }
  }

  _move(p,input,dt) {
    let ix=clamp(Number(input.x)||0,-1,1), iz=clamp(Number(input.z)||0,-1,1);
    const mag=Math.hypot(ix,iz);
    if(mag>1) {ix/=mag; iz/=mag;}
    const hasInput=mag>.07;
    const boostPressed=Boolean(input.boost);
    const driftPressed=Boolean(input.drift);
    const oldAngle=p.angle;
    const oldSpeed=Math.hypot(p.vx,p.vz);
    p.shield=Math.max(0,p.shield-dt);
    p.hitstun=Math.max(0,p.hitstun-dt);
    p.boosting=Math.max(0,p.boosting-dt);
    p.rumble=Math.max(0,p.rumble-dt*3);
    p._obstacleCooldown=Math.max(0,p._obstacleCooldown-dt);
    p.wobble=Math.max(0,p.wobble-dt*.4);
    p.score+=dt*2;
    p.boost=Math.min(1,p.boost+dt*(this.chaos.type==='turbo' ? .48 : .23));
    p.drift=driftPressed && oldSpeed>3;

    if(hasInput) {
      const target=Math.atan2(ix,iz);
      p.angle+=clamp(angleDelta(p.angle,target),-dt*(p.drift?5.4:8.6),dt*(p.drift?5.4:8.6));
      p.angle=Math.atan2(Math.sin(p.angle),Math.cos(p.angle));
    }
    const fx=Math.sin(p.angle), fz=Math.cos(p.angle);
    const lx=fz, lz=-fx;
    let forward=p.vx*fx+p.vz*fz;
    let lateral=p.vx*lx+p.vz*lz;
    const slippery=this.chaos.type==='lowgrip';
    const stunned=p.hitstun>0;
    const grip=stunned ? 1.1 : p.drift ? .36 : slippery ? 1.25 : 5.7;
    const resistance=stunned ? 1.1 : hasInput ? (p.drift?1.3:2.35) : 3.65;
    forward*=Math.exp(-resistance*dt);
    lateral*=Math.exp(-grip*dt);
    p.vx=forward*fx+lateral*lx;
    p.vz=forward*fz+lateral*lz;
    if(hasInput) {
      const acceleration=(p.drift?23.5:32)*(stunned?.28:1);
      p.vx+=ix*acceleration*dt;
      p.vz+=iz*acceleration*dt;
    }
    if(boostPressed && !p._boostHeld && p.boost>=.985) {
      p.boost=0;
      p.boosting=.42;
      p.vx+=fx*9.7;
      p.vz+=fz*9.7;
      p.rumble=.65;
      this._emit({type:'boost',playerId:p.id,x:p.x,z:p.z,force:1});
    }
    p._boostHeld=boostPressed;
    if(p.boosting>0) {
      p.vx+=fx*28*dt;
      p.vz+=fz*28*dt;
    }
    if(p.drift && hasInput && oldSpeed>4) {
      const turn=Math.abs(angleDelta(oldAngle,p.angle))/dt;
      p.driftCharge=Math.min(1,p.driftCharge+dt*(.26+Math.min(turn,5)*.20));
      p._driftTimer+=dt;
    } else if(!driftPressed && p._driftHeld) {
      if(p.driftCharge>.40 && p._driftTimer>.30) {
        const strength=3.3+p.driftCharge*5;
        p.vx+=fx*strength;
        p.vz+=fz*strength;
        p.boost=Math.min(1,p.boost+.15*p.driftCharge);
        p.boosting=Math.max(p.boosting,.16);
        this._emit({type:'driftboost',playerId:p.id,x:p.x,z:p.z,force:p.driftCharge});
      }
      p.driftCharge=0;
      p._driftTimer=0;
    } else if(!driftPressed) {
      p.driftCharge=Math.max(0,p.driftCharge-dt);
      p._driftTimer=0;
    }
    p._driftHeld=driftPressed;

    if(this.chaos.type==='wind') {
      p.vx+=this.chaos.windX*dt;
      p.vz+=this.chaos.windZ*dt;
    }
    const distance=Math.hypot(p.x,p.z);
    if(distance>this.safeRadius && distance>0) {
      const outside=distance-this.safeRadius;
      const force=8+Math.min(outside,10)*4.3+p.wobble*.12+Math.max(0,this.time-60)*.5;
      p.vx+=p.x/distance*force*dt;
      p.vz+=p.z/distance*force*dt;
      p.wobble=Math.min(100,p.wobble+dt*(8+outside*3));
    }
    // Soft speed limit preserves collision impulse instead of clipping an impact immediately.
    const speed=Math.hypot(p.vx,p.vz);
    const maxSpeed=p.boosting>0 ? 23 : p.drift ? 15.2 : 13.8;
    if(speed>maxSpeed) {
      const reduced=Math.min(49,maxSpeed+(speed-maxSpeed)*Math.exp(-dt*(stunned?.4:1.5)));
      p.vx*=reduced/speed;
      p.vz*=reduced/speed;
    }
    p.x+=p.vx*dt;
    p.z+=p.vz*dt;
    p.angularVelocity=angleDelta(oldAngle,p.angle)/dt;
  }

  _cartCollision(a,b) {
    let dx=b.x-a.x,dz=b.z-a.z;
    let dist=Math.hypot(dx,dz);
    const min=RADIUS*2;
    if(dist>=min) return;
    if(dist<.0001) {dx=a.id<b.id?1:-1;dz=0;dist=1;}
    const nx=dx/dist,nz=dz/dist;
    const ia=a.shield>0?.66:1, ib=b.shield>0?.66:1;
    const overlap=Math.max(0,min-dist)+.001;
    a.x-=nx*overlap*ia/(ia+ib);a.z-=nz*overlap*ia/(ia+ib);
    b.x+=nx*overlap*ib/(ia+ib);b.z+=nz*overlap*ib/(ia+ib);
    const closing=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
    if(closing>=0) return;
    const hitA=a.vx*nx+a.vz*nz;
    const hitB=-(b.vx*nx+b.vz*nz);
    const impulse=-(1.05+Math.min(-closing/22,.35))*closing/(ia+ib);
    const knockA=1+Math.min(a.wobble,100)/80;
    const knockB=1+Math.min(b.wobble,100)/80;
    a.vx-=nx*impulse*ia*knockA;a.vz-=nz*impulse*ia*knockA;
    b.vx+=nx*impulse*ib*knockB;b.vz+=nz*impulse*ib*knockB;
    const key=`${a.id}:${b.id}`;
    if(!this._pairCooldown.has(key) && -closing>1.1) {
      const attacker=hitA>=hitB?a:b;
      const defender=attacker===a?b:a;
      const boostBonus=attacker.boosting>0 ? 1.55 : 1;
      defender.hitstun=Math.max(defender.hitstun,Math.min(.36,.08-closing*.012)*(defender.shield>0?.5:1));
      attacker.hitstun=Math.max(attacker.hitstun,Math.min(.18,.06-closing*.004));
      defender.wobble=Math.min(100,defender.wobble+Math.min(22,-closing*.7+3)*boostBonus*(defender.shield>0?.25:1));
      attacker.wobble=Math.min(100,attacker.wobble+Math.min(8,-closing*.23)*(attacker.shield>0?.25:1));
      attacker.score+=Math.min(8,-closing*.4);
      defender._lastHitId=attacker.id;defender._lastHitTime=this.time;
      // A head-on clash can send either cart flying; credit follows the last real contact.
      attacker._lastHitId=defender.id;attacker._lastHitTime=this.time;
      a.rumble=Math.min(1,-closing/14);b.rumble=a.rumble;
      this._emit({type:'collision',playerId:attacker.id,otherId:defender.id,x:(a.x+b.x)/2,z:(a.z+b.z)/2,force:-closing});
      this._pairCooldown.set(key,.22);
    }
  }

  _obstacleCollisions(p) {
    for(const o of this.obstacles) {
      let dx=p.x-o.x,dz=p.z-o.z,dist=Math.hypot(dx,dz);
      const min=RADIUS+o.r;
      if(dist>=min) continue;
      if(dist<.0001) {dx=1;dz=0;dist=1;}
      const nx=dx/dist,nz=dz/dist;
      p.x=o.x+nx*(min+.003);p.z=o.z+nz*(min+.003);
      const into=p.vx*nx+p.vz*nz;
      if(into<0) {
        const bounce=o.type==='bumper'?2.05:1.52;
        p.vx-=into*nx*bounce;p.vz-=into*nz*bounce;
        if(o.type==='bumper') {p.vx+=nx*3.5;p.vz+=nz*3.5;}
        if(p._obstacleCooldown<=0 && -into>2) {
          p.wobble=Math.min(100,p.wobble+Math.min(7,-into*.35)*(p.shield>0?.25:1));
          p.rumble=Math.min(1,-into/12);
          p.hitstun=Math.max(p.hitstun,Math.min(.3,.1-into*.008));
          this._emit({type:'collision',playerId:p.id,otherId:-1,obstacleId:o.id,x:p.x-nx*RADIUS,z:p.z-nz*RADIUS,force:-into,bumper:o.type==='bumper'});
          p._obstacleCooldown=.2;
        }
      }
    }
  }

  _collect(p) {
    for(const item of this.pickups) {
      if(!item.active || Math.hypot(p.x-item.x,p.z-item.z)>1.35) continue;
      item.active=false;item.respawn=10+this.random()*4;
      if(item.type==='boost') p.boost=1;
      else {p.shield=7;p.wobble=Math.max(0,p.wobble-18);}
      p.score+=20;
      this._emit({type:'pickup',playerId:p.id,x:item.x,z:item.z,pickupType:item.type,itemId:item.id});
    }
  }

  _updatePickups(dt) {
    for(const item of this.pickups) if(!item.active) {
      item.respawn-=dt;
      if(item.respawn<=0) {item.active=true;item.respawn=0;}
    }
  }

  _updateChaos(dt) {
    if(this.chaos.remaining>0) {
      this.chaos.remaining=Math.max(0,this.chaos.remaining-dt);
      if(this.chaos.remaining===0) this.chaos={name:'',label:'',remaining:0,type:'none'};
    }
    if(this.time>=this._nextChaos && this._chaosIndex<2) {
      const kind=(Math.floor(this.random()*3)+this._chaosIndex)%3;
      if(kind===0) this.chaos={type:'lowgrip',name:'CLEANUP ON AISLE YOU',label:'Freshly mopped. Hold your drift.',remaining:10};
      else if(kind===1) {
        this.chaos={type:'turbo',name:'FLASH SALE',label:'Turbo recharges twice as fast.',remaining:11};
        for(const p of this.players) if(p.alive) p.boost=1;
      } else {
        const direction=this.random()*TAU;
        this.chaos={type:'wind',name:'EXPRESS DELIVERY',label:'Crosswind incoming.',remaining:10,windX:Math.sin(direction)*6,windZ:Math.cos(direction)*6};
      }
      this._emit({type:'chaos',name:this.chaos.name,label:this.chaos.label,chaosType:this.chaos.type,remaining:this.chaos.remaining});
      this._chaosIndex++;
      this._nextChaos=50;
    }
  }

  _botInput(p,dt) {
    const ai=p._bot;
    ai.timer-=dt;
    let boost=false;
    if(ai.timer<=0) {
      const spicy=this.difficulty==='spicy';
      ai.timer=(spicy?.14:.23)+this.random()*(spicy?.14:.25);
      const distance=Math.hypot(p.x,p.z);
      const speed=Math.hypot(p.vx,p.vz);
      const danger=distance>this.safeRadius-1.7 || Math.abs(p.x+p.vx*.45)>15.8 || Math.abs(p.z+p.vz*.45)>15.8;
      let tx=0,tz=0;
      if(danger) {
        tx=-p.x;tz=-p.z;
        ai.target=null;
      } else {
        const targets=this.players.filter(q=>q.id!==p.id && q.alive);
        let target=null,best=Infinity;
        for(const q of targets) {
          const d=Math.hypot(q.x-p.x,q.z-p.z);
          const vulnerability=1+(q.wobble/150);
          const openingGrace=q.human && this.time<6 ? 2.5 : 1;
          const metric=(d+1)/vulnerability*openingGrace + this.random()*(spicy?.35:1.5);
          if(metric<best) {best=metric;target=q;}
        }
        let pickup=null,pickupDistance=Infinity;
        if(p.boost<.45 || p.wobble>40) for(const item of this.pickups) {
          if(!item.active || Math.hypot(item.x,item.z)>this.safeRadius-1) continue;
          const d=Math.hypot(item.x-p.x,item.z-p.z);
          if(d<pickupDistance) {pickupDistance=d;pickup=item;}
        }
        if(pickup && pickupDistance<6.5 && (best>4 || p.wobble>65)) {
          tx=pickup.x-p.x;tz=pickup.z-p.z;ai.target=null;
        } else if(target) {
          const lead=spicy?.23:.13;
          tx=target.x+target.vx*lead-p.x;tz=target.z+target.vz*lead-p.z;ai.target=target.id;
          const d=Math.hypot(tx,tz);
          const headingDot=(Math.sin(p.angle)*tx+Math.cos(p.angle)*tz)/Math.max(d,.1);
          const projectedX=p.x+Math.sin(p.angle)*6;
          const projectedZ=p.z+Math.cos(p.angle)*6;
          if(this.time>3 && p.boost>=.985 && d>2.6 && d<8.5 && headingDot>.82 && Math.abs(projectedX)<16 && Math.abs(projectedZ)<16 && this.random()<(spicy?.90:.58)*ai.aggression) boost=true;
        }
      }
      let d=Math.hypot(tx,tz);
      if(d>.01) {tx/=d;tz/=d;}
      // Anticipate static obstacles instead of repeatedly driving directly into a vent.
      for(const o of this.obstacles) {
        const ox=p.x-o.x,oz=p.z-o.z;
        const od=Math.hypot(ox,oz);
        const near=o.r+RADIUS+2.7;
        const ahead=-(ox*tx+oz*tz)/Math.max(od,.1);
        if(od<near && ahead>.0) {
          const side=(tx*oz-tz*ox)>0?1:-1;
          const weight=(1-od/near)*2.9;
          tx+=(ox/Math.max(od,.1)*.9-oz/Math.max(od,.1)*side*.8)*weight;
          tz+=(oz/Math.max(od,.1)*.9+ox/Math.max(od,.1)*side*.8)*weight;
        }
      }
      const travelled=Math.hypot(p.x-ai.lastX,p.z-ai.lastZ);
      ai.stuck=travelled<.11 ? ai.stuck+ai.timer:0;
      ai.lastX=p.x;ai.lastZ=p.z;
      if(ai.stuck>1.2) {tx+=Math.cos(p.angle)*1.3;tz-=Math.sin(p.angle)*1.3;ai.stuck=0;}
      const error=(this.random()-.5)*(spicy?.11:.24);
      const cos=Math.cos(error),sin=Math.sin(error);
      ai.x=tx*cos-tz*sin;ai.z=tx*sin+tz*cos;
      d=Math.hypot(ai.x,ai.z);
      if(d>0) {ai.x/=d;ai.z/=d;}
      const turn=Math.abs(angleDelta(p.angle,Math.atan2(ai.x,ai.z)));
      ai.drift=!danger && speed>5 && turn>.8 && turn<2.1 && this.random()<(spicy?.6:.3);
    }
    return {x:ai.x,z:ai.z,boost,drift:ai.drift};
  }

  _eliminate(p) {
    p.alive=false;p.falling=true;p.fallTime=0;p.y=0;
    p.angularVelocity=(this.random()-.5)*8;
    p.placement=this.players.filter(q=>q.alive).length+1;
    this._eliminationOrder.push(p.id);
    const credited=(p._lastHitId!==null && this.time-p._lastHitTime<6) ? this.players[p._lastHitId] : null;
    if(credited) {credited.kills++;credited.score+=125;}
    this._emit({type:'eliminate',playerId:p.id,otherId:credited?.id??null,killerId:credited?.id??null,x:p.x,z:p.z,force:Math.hypot(p.vx,p.vz),placement:p.placement});
  }

  _updateFalls(dt) {
    for(const p of this.players) if(p.falling) {
      p.fallTime+=dt;p.y=-3.8*p.fallTime-10*p.fallTime*p.fallTime;
      p.x+=p.vx*dt;p.z+=p.vz*dt;p.angle+=p.angularVelocity*dt;
      if(p.fallTime>2.4) {p.falling=false;p.y=-70;}
    }
  }

  _finish(winnerId,reason) {
    this.winnerId=winnerId;this.finishReason=reason;this.state='finished';
    const winner=this.players[winnerId];
    if(winner) {winner.placement=1;winner.score+=300;}
    const remaining=this.players.filter(p=>p.alive && p.id!==winnerId).sort((a,b)=>b.kills-a.kills || a.wobble-b.wobble);
    remaining.forEach((p,i)=>{p.placement=i+2;});
    for(const p of this.players) p.score=Math.round(p.score);
    this._emit({type:'finish',playerId:winnerId,winnerId,reason,x:winner?.x??0,z:winner?.z??0});
  }

  /** Useful for deterministic run records and integrity checks; never includes render state. */
  snapshot() {
    return {
      seed:this.seed, mode:this.mode, arena:this.arena.id, state:this.state, time:this.time,
      countdown:this.countdown, safeRadius:this.safeRadius, winnerId:this.winnerId,
      players:this.players.map(({id,x,z,y,vx,vz,angle,alive,falling,boost,wobble,kills,score,placement})=>({id,x,z,y,vx,vz,angle,alive,falling,boost,wobble,kills,score,placement})),
      pickups:this.pickups.map(p=>({...p})),chaos:{...this.chaos}
    };
  }
}

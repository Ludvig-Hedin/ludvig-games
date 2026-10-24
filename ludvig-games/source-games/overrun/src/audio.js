import {WEAPON_BY_ID} from './arsenal.js';

// Original, sample-free sound design. Every weapon uses a separately tuned
// pressure transient, mechanical layer, resonant body and environmental tail.
const PROFILES={
 rifle:{low:78,body:650,crack:3100,length:.15,level:.70,tail:.20},
 smg:{low:112,body:1150,crack:3800,length:.095,level:.48,tail:.12},
 burst:{low:92,body:830,crack:3500,length:.125,level:.64,tail:.16},
 shotgun:{low:52,body:430,crack:2200,length:.27,level:.95,tail:.33},
 sniper:{low:58,body:580,crack:4200,length:.24,level:.90,tail:.39},
 pistol:{low:125,body:1050,crack:3600,length:.105,level:.62,tail:.18},
 lmg:{low:65,body:540,crack:2800,length:.18,level:.75,tail:.24},
 suppressed:{low:160,body:470,crack:1350,length:.085,level:.40,tail:.07}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class GameAudio {
 constructor(){
  this.ctx=null;this.started=false;this.mapId='industrial';this.volumes={master:.65,sfx:.82,music:.25,announcer:.55};this.position={x:0,y:0,z:0};this.forward={x:0,y:0,z:-1};this.activeVoices=0;this.ambient=[];this.nextBeat=0;this.beat=0;this.combat=false;this.nextBird=0;this.time=0;this.speech=[];this.disposed=false;this.announcerEnabled=true;
 }
 async start(){
  if(this.disposed)return;
  if(this.ctx){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
  const Ctx=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Ctx)return;
  try{
   this.ctx=new Ctx({latencyHint:'interactive'});const c=this.ctx;
   this.master=c.createGain();this.master.gain.value=this.volumes.master;
   const limiter=c.createDynamicsCompressor();limiter.threshold.value=-5;limiter.knee.value=5;limiter.ratio.value=12;limiter.attack.value=.002;limiter.release.value=.08;
   const dc=c.createBiquadFilter();dc.type='highpass';dc.frequency.value=25;
   this.master.connect(dc);dc.connect(limiter);limiter.connect(c.destination);
   this.sfx=c.createGain();this.music=c.createGain();this.announcer=c.createGain();this.ambience=c.createGain();this.sfx.gain.value=this.volumes.sfx;this.music.gain.value=this.volumes.music*.26;this.announcer.gain.value=this.volumes.announcer;this.ambience.gain.value=.19;
   this.sfx.connect(this.master);this.music.connect(this.master);this.announcer.connect(this.master);this.ambience.connect(this.sfx);
   this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.noise.getChannelData(0);let pink=0;for(let i=0;i<data.length;i++){const white=Math.random()*2-1;pink=.985*pink+.015*white;data[i]=white*.85+pink*1.8;}
   this.reverb=c.createConvolver();const len=Math.floor(c.sampleRate*1.05),ir=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++){const t=i/c.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-t*7.6)*.21;if(i<500)d[i]*=i/500;}}
   this.reverb.buffer=ir;this.reverbGain=c.createGain();this.reverbGain.gain.value=.22;this.reverb.connect(this.reverbGain);this.reverbGain.connect(this.sfx);
   this.started=true;this.nextBeat=c.currentTime+.1;this.beat=0;this.setAmbience(this.mapId);await c.resume();
  }catch(e){console.warn('Audio initialization unavailable',e.message);}
 }
 setVolumes(volumes={}){
  Object.assign(this.volumes,volumes);for(const k of Object.keys(this.volumes))this.volumes[k]=clamp(Number(this.volumes[k])||0,0,1);
  if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(this.volumes.master,t,.03);this.sfx.gain.setTargetAtTime(this.volumes.sfx,t,.03);this.music.gain.setTargetAtTime(this.volumes.music*(this.combat?.12:.26),t,.12);this.announcer.gain.setTargetAtTime(this.volumes.announcer,t,.03);
 }
 setCombat(active){this.combat=!!active;if(this.ctx)this.music.gain.setTargetAtTime(this.volumes.music*(active?.12:.26),this.ctx.currentTime,.8);}
 listener(pos,forward){
  if(!pos)return;this.position.x=pos.x;this.position.y=pos.y;this.position.z=pos.z;if(forward){this.forward.x=forward.x;this.forward.y=forward.y;this.forward.z=forward.z;}
  if(!this.ctx)return;const l=this.ctx.listener,t=this.ctx.currentTime;
  if(l.positionX){l.positionX.setValueAtTime(pos.x,t);l.positionY.setValueAtTime(pos.y,t);l.positionZ.setValueAtTime(pos.z,t);if(forward){l.forwardX.setValueAtTime(forward.x,t);l.forwardY.setValueAtTime(forward.y,t);l.forwardZ.setValueAtTime(forward.z,t);l.upX.setValueAtTime(0,t);l.upY.setValueAtTime(1,t);l.upZ.setValueAtTime(0,t);}}
  else{l.setPosition(pos.x,pos.y,pos.z);if(forward)l.setOrientation(forward.x,forward.y,forward.z,0,1,0);}
 }
 _bus(pos=null,gain=1,life=.65,send=0){
  if(!this.started||this.ctx.state!=='running'||this.activeVoices>56)return null;
  const c=this.ctx,g=c.createGain();g.gain.value=gain;let panner=null;
  if(pos){const d=Math.hypot(pos.x-this.position.x,pos.y-this.position.y,pos.z-this.position.z);if(d>100){g.disconnect();return null;}panner=c.createPanner();panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=4;panner.maxDistance=100;panner.rolloffFactor=1.55;panner.positionX.value=pos.x;panner.positionY.value=pos.y;panner.positionZ.value=pos.z;g.connect(panner);panner.connect(this.sfx);}else g.connect(this.sfx);
  let echo;if(send>0){echo=c.createGain();echo.gain.value=send;g.connect(echo);echo.connect(this.reverb);}
  this.activeVoices++;setTimeout(()=>{try{g.disconnect();panner?.disconnect();echo?.disconnect();}catch{}this.activeVoices=Math.max(0,this.activeVoices-1);},life*1000+100);
  return g;
 }
 _noise(dest,time,duration,level,frequency=1500,type='bandpass',q=.75,attack=.001){
  if(!dest||duration<=0)return;const c=this.ctx,s=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;s.playbackRate.value=.92+Math.random()*.16;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;g.gain.setValueAtTime(.00001,time);g.gain.linearRampToValueAtTime(level,time+attack);g.gain.exponentialRampToValueAtTime(.00001,time+duration);s.connect(filter);filter.connect(g);g.connect(dest);s.start(time,Math.random()*.7);s.stop(time+duration+.01);s.onended=()=>{s.disconnect();filter.disconnect();g.disconnect();};
 }
 _tone(dest,time,duration,level,freq,to=freq,type='sine'){
  if(!dest)return;const c=this.ctx,s=c.createOscillator(),g=c.createGain();s.type=type;s.frequency.setValueAtTime(Math.max(20,freq),time);s.frequency.exponentialRampToValueAtTime(Math.max(20,to),time+duration);g.gain.setValueAtTime(.00001,time);g.gain.linearRampToValueAtTime(level,time+.002);g.gain.exponentialRampToValueAtTime(.00001,time+duration);s.connect(g);g.connect(dest);s.start(time);s.stop(time+duration+.01);s.onended=()=>{s.disconnect();g.disconnect();};
 }
 shot(id,pos=null,indoor=false,suppressed=false){
  if(!this.started)return;const w=WEAPON_BY_ID[id]||WEAPON_BY_ID.vx4;if(w.mode==='melee'){const b=this._bus(pos,.6,.4);if(b){const t=this.ctx.currentTime;this._noise(b,t,.20,.6,900,'bandpass',.5,.015);this._noise(b,t+.09,.04,.3,3800,'highpass');}return;}
  const muted=suppressed||w.suppressed,p=PROFILES[muted?'suppressed':w.sound]||PROFILES.rifle;const b=this._bus(pos,p.level,.9,indoor?.70:p.tail);if(!b)return;const t=this.ctx.currentTime,jitter=.94+Math.random()*.12;
  this._noise(b,t,muted?.025:.042,muted?.52:1.0,p.crack*jitter,'highpass',.65);
  this._noise(b,t+.003,p.length,1.15,p.body*jitter,'bandpass',.62);
  this._noise(b,t+.012,p.length*1.7,.38,p.body*.6,'lowpass',.4,.003);
  this._tone(b,t,.13,muted?.42:.75,p.low*1.6,p.low*.55);
  this._tone(b,t+.001,.022,.13,p.body*2,p.body*.8,'triangle');
  this._noise(b,t+.03,.035,.15,2300,'bandpass',1.7);
  if(indoor){this._noise(b,t+.055,p.length*.9,.26,1200,'bandpass',.7);this._noise(b,t+.112,p.length*.6,.12,800,'lowpass');}
  // Brass lands after the report, with two short, different metal resonances.
  if(!muted&&Math.random()<.65){this._tone(b,t+.18,.024,.065,3200,2700,'triangle');this._tone(b,t+.235,.018,.035,4000,3300,'triangle');}
 }
 reload(id,stage=0){
  if(!this.started)return;const b=this._bus(null,.40,.7);if(!b)return;const t=this.ctx.currentTime;
  const step=typeof stage==='string'?({start:0,out:0,insert:1,in:1,bolt:2,end:2}[stage]??0):stage;
  if(step===0){this._noise(b,t,.055,.48,1400,'highpass');this._tone(b,t,.035,.20,520,330,'triangle');this._noise(b,t+.07,.11,.32,850,'bandpass');}
  else if(step===1){this._noise(b,t,.03,.70,1500,'highpass');this._tone(b,t,.07,.35,310,110);this._noise(b,t+.035,.04,.30,3300,'bandpass');}
  else{this._noise(b,t,.07,.60,2100,'bandpass',1.3);this._noise(b,t+.075,.025,.70,2900,'highpass');this._tone(b,t+.08,.05,.15,480,240,'triangle');}
 }
 step(surface='concrete',speed=1){
  if(!this.started)return;const b=this._bus(null,.24,.4);if(!b)return;const t=this.ctx.currentTime,v=clamp(speed,.45,1.5);
  this._tone(b,t,.065,.23*v,surface==='metal'?130:82,42);
  const freq=surface==='sand'?1300:surface==='wood'?640:surface==='metal'?1700:950;this._noise(b,t,.08,.37*v,freq,'bandpass',.55,.002);this._noise(b,t+.026,surface==='sand'?.14:.06,.18*v,3100,'highpass');
  if(surface==='metal')this._tone(b,t+.01,.09,.07,530,460,'triangle');
 }
 slide(){if(!this.started)return;const b=this._bus(null,.42,.8);if(b){const t=this.ctx.currentTime;this._noise(b,t,.55,.7,900,'bandpass',.5,.025);this._noise(b,t+.03,.45,.27,3300,'highpass',.5,.05);}}
 jump(){if(!this.started)return;const b=this._bus(null,.23,.4);if(b){const t=this.ctx.currentTime;this._noise(b,t,.10,.45,700,'bandpass');this._noise(b,t+.025,.13,.18,2200,'highpass');}}
 land(strength=1){if(!this.started)return;const b=this._bus(null,.35*clamp(strength,.3,1.5),.5);if(b){const t=this.ctx.currentTime;this._tone(b,t,.12,.5,90,40);this._noise(b,t,.16,.62,800,'bandpass');this._noise(b,t+.035,.13,.2,2700,'highpass');}}
 impact(surface='concrete',pos=null){
  if(!this.started)return;const b=this._bus(pos,.24,.4);if(!b)return;const t=this.ctx.currentTime;
  if(surface==='metal'){this._noise(b,t,.03,.8,3800,'highpass');this._tone(b,t,.18,.22,2100,1650,'triangle');this._tone(b,t,.11,.12,3400,3100,'sine');}
  else if(surface==='wood'){this._noise(b,t,.08,.7,1200,'bandpass');this._tone(b,t,.065,.18,260,180);}
  else{this._noise(b,t,.045,.75,2500,'highpass');this._noise(b,t+.015,.12,.28,surface==='sand'?1500:800,'bandpass',.7);}
 }
 explosion(pos=null){
  if(!this.started)return;const b=this._bus(pos,.93,1.45,.72);if(!b)return;const t=this.ctx.currentTime;
  this._noise(b,t,.065,1.05,1800,'highpass',.55);
  this._noise(b,t+.007,.39,1.2,340,'bandpass',.55);
  this._tone(b,t,.58,.95,91,29);
  this._tone(b,t+.025,.34,.30,155,48,'triangle');
  this._noise(b,t+.045,.9,.62,540,'lowpass',.65,.02);
  this._noise(b,t+.10,.72,.34,2100,'bandpass',.5,.015);
  for(let i=0;i<4;i++){const delay=.18+i*.145;this._noise(b,t+delay,.09,.15,2600+i*410,'highpass');this._tone(b,t+delay,.12,.075,1250+i*330,700+i*190,'triangle');}
 }
 flyby(pos=null){if(!this.started)return;const b=this._bus(pos,.20,.3);if(b){const t=this.ctx.currentTime;this._noise(b,t,.12,.55,4800,'bandpass',3,.015);}}
 hit(head=false){if(!this.started)return;const b=this._bus(null,.36,.25);if(b){const t=this.ctx.currentTime;this._noise(b,t,.026,.45,head?3100:2000,'bandpass',2);this._tone(b,t,.055,.26,head?1850:1250,head?1200:900,'triangle');if(head)this._tone(b,t+.025,.07,.12,2400,1800);}}
 kill(){if(!this.started)return;const b=this._bus(null,.42,.5);if(b){const t=this.ctx.currentTime;this._tone(b,t,.09,.32,740,680,'triangle');this._tone(b,t+.06,.14,.23,1110,1050,'triangle');this._tone(b,t+.115,.20,.12,1480,1460);this._noise(b,t,.035,.25,2800,'highpass');}}
 ui(){if(!this.started)return;const b=this._bus(null,.14,.2);if(b){const t=this.ctx.currentTime;this._tone(b,t,.035,.3,940,730,'sine');this._noise(b,t,.022,.15,3000,'bandpass');}}
 announce(text){
  if(!this.started||this.volumes.announcer<=0)return;const t=this.ctx.currentTime;
  this._tone(this.announcer,t,.15,.11,523,523,'sine');this._tone(this.announcer,t+.10,.22,.09,784,784,'sine');
  // A local device voice is optional; gameplay never depends on speech support.
  if('speechSynthesis' in globalThis&&typeof SpeechSynthesisUtterance!=='undefined'){
   try{globalThis.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text));u.lang='en-US';u.rate=1.08;u.pitch=.78;u.volume=this.volumes.master*this.volumes.announcer;const voices=globalThis.speechSynthesis.getVoices();const voice=voices.find(v=>/en(-|_)US/i.test(v.lang)&&/David|Daniel|Alex|Male/i.test(v.name))||voices.find(v=>/en(-|_)US/i.test(v.lang));if(voice)u.voice=voice;globalThis.speechSynthesis.speak(u);}catch{}
  }
 }
 setAmbience(id){
  this.mapId=id;if(!this.started)return;for(const node of this.ambient){try{node.stop?.();node.disconnect();}catch{}}this.ambient=[];const c=this.ctx;
  const wind=c.createBufferSource();wind.buffer=this.noise;wind.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=id==='desert'?650:340;const gain=c.createGain();gain.gain.value=id==='desert'?.18:.12;wind.connect(filter);filter.connect(gain);gain.connect(this.ambience);wind.start();this.ambient.push(wind,filter,gain);this.windGain=gain;
  if(id==='industrial'){const hum=c.createOscillator(),hum2=c.createOscillator(),g=c.createGain();hum.frequency.value=57;hum2.frequency.value=114.4;hum.type='sine';hum2.type='sine';g.gain.value=.05;hum.connect(g);hum2.connect(g);g.connect(this.ambience);hum.start();hum2.start();this.ambient.push(hum,hum2,g);}
  this.nextBird=c.currentTime+5;
 }
 _musicBeat(time,n){
  const beatDuration=.6,bar=Math.floor(n/8)%8,index=n%8;
  const roots=[41.203,41.203,32.703,32.703,36.708,36.708,30.868,30.868],root=roots[bar];
  if(index===0||index===3||index===6){this._tone(this.music,time,.26,.24,130,43);this._noise(this.music,time,.045,.08,800,'lowpass');}
  if(index===2||index===6){this._noise(this.music,time,.12,.12,1600,'bandpass',.7);this._tone(this.music,time,.07,.11,180,85);}
  this._noise(this.music,time,.055,.025,index%2?6000:7500,'highpass');
  if(index%2===0){this._tone(this.music,time,.45,.17,root*2,root*2,'triangle');}
  if(index===0){for(const ratio of [4,4.7568,5.993]){const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();o.type='triangle';o.frequency.value=root*ratio;f.type='lowpass';f.frequency.value=600;g.gain.setValueAtTime(.0001,time);g.gain.linearRampToValueAtTime(.035,time+.4);g.gain.exponentialRampToValueAtTime(.0001,time+4.6);o.connect(f);f.connect(g);g.connect(this.music);o.start(time);o.stop(time+4.65);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();};}}
  const arp=[8,11.987,9.5137,8,7.127,9.5137,8,5.993];if(!this.combat||index%2===0)this._tone(this.music,time,.32,.028,root*arp[index],root*arp[index],'sine');
 }
 update(dt){
  if(!this.started||this.ctx.state!=='running')return;this.time+=dt;const now=this.ctx.currentTime;
  if(now-this.nextBeat>1)this.nextBeat=now+.05;
  while(this.nextBeat<now+.13){this._musicBeat(this.nextBeat,this.beat++);this.nextBeat+=.3;}
  if(this.windGain)this.windGain.gain.setTargetAtTime((this.mapId==='desert'?.18:.12)*(1+Math.sin(this.time*.21)*.25+Math.sin(this.time*.08)*.12),now,.8);
  if(now>this.nextBird){this.nextBird=now+9+Math.random()*14;if(this.mapId==='urban'){const p={x:this.position.x+20,y:this.position.y+8,z:this.position.z-12};const b=this._bus(p,.045,1.1);if(b){this._tone(b,now,.16,.35,2100,2800);this._tone(b,now+.24,.15,.25,2600,1900);}}else if(this.mapId==='industrial'){const b=this._bus({x:this.position.x-17,y:2,z:this.position.z+15},.08,.6);if(b){this._tone(b,now,.35,.22,280,270,'triangle');this._noise(b,now,.19,.17,2000,'bandpass',4);}}}
 }
 dispose(){this.disposed=true;try{globalThis.speechSynthesis?.cancel();}catch{}for(const n of this.ambient){try{n.stop?.();n.disconnect();}catch{}}this.ambient=[];if(this.ctx){this.ctx.close();this.ctx=null;}this.started=false;}
}

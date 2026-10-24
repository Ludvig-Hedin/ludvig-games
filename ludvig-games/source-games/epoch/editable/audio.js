/* EPOCH's original procedural score and spatial sound palette. No fetched audio. */
(function(root){
'use strict';
const midi=n=>440*Math.pow(2,(n-69)/12);
class EpochAudio {
 constructor(){this.ctx=null;this.muted=false;this.masterLevel=.8;this.musicLevel=.46;this.effectsLevel=.8;this.age=0;this.enabled=false;this.step=0;this.next=0;this.lastHit=0;this.lastShot=0;this.paused=false;this.eventsPlayed=0;}
 async unlock(){
  try{
   if(!this.ctx){
    const C=root.AudioContext||root.webkitAudioContext;if(!C)return false;
    const c=this.ctx=new C({latencyHint:'interactive'});
    this.master=c.createGain();this.master.gain.value=this.masterLevel;
    const comp=c.createDynamicsCompressor();comp.threshold.value=-19;comp.knee.value=20;comp.ratio.value=5;comp.attack.value=.004;comp.release.value=.21;
    this.master.connect(comp);comp.connect(c.destination);
    this.fx=c.createGain();this.fx.gain.value=this.effectsLevel;this.fx.connect(this.master);
    this.music=c.createGain();this.music.gain.value=this.musicLevel;this.music.connect(this.master);
    this.verb=c.createConvolver();const ir=c.createBuffer(2,c.sampleRate*1.7,c.sampleRate);
    for(let k=0;k<2;k++){const d=ir.getChannelData(k);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3.7)*.65;}
    this.verb.buffer=ir;const vg=c.createGain();vg.gain.value=.16;this.verb.connect(vg);vg.connect(this.fx);
    this.musicVerb=c.createConvolver();this.musicVerb.buffer=ir;const mvg=c.createGain();mvg.gain.value=.18;this.musicVerb.connect(mvg);mvg.connect(this.music);
    this.noiseBuffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const data=this.noiseBuffer.getChannelData(0);let prev=0;
    for(let i=0;i<data.length;i++){prev=(prev+.04*(Math.random()*2-1))/1.04;data[i]=prev*6;}
    this.whiteBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const w=this.whiteBuffer.getChannelData(0);for(let i=0;i<w.length;i++)w[i]=Math.random()*2-1;
    const wind=c.createBufferSource();wind.buffer=this.noiseBuffer;wind.loop=true;const filt=c.createBiquadFilter();filt.type='lowpass';filt.frequency.value=350;const gain=c.createGain();gain.gain.value=.09;wind.connect(filt);filt.connect(gain);gain.connect(this.fx);wind.start();this.windGain=gain;
   }
   await this.ctx.resume();this.enabled=true;this.next=this.ctx.currentTime+.08;return true;
  }catch(e){console.warn('Audio unavailable',e);return false;}
 }
 level(){if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(this.muted?0:this.masterLevel,t,.04);this.music.gain.setTargetAtTime(this.paused?0:this.musicLevel,t,.12);this.fx.gain.setTargetAtTime(this.paused?0:this.effectsLevel,t,.04);}
 toggleMute(){this.muted=!this.muted;this.level();return this.muted;}
 setPaused(v){this.paused=v;this.level();if(this.ctx)this.next=this.ctx.currentTime+.1;}
 note(freq,duration=.2,volume=.1,type='sine',pan=0,when,filter=1800,slide=0,bus='fx',attack=.007){
  const c=this.ctx;if(!c||c.state!=='running')return;
  const t=when??c.currentTime,osc=c.createOscillator(),g=c.createGain(),lp=c.createBiquadFilter(),p=c.createStereoPanner();
  osc.type=type;osc.frequency.setValueAtTime(Math.max(10,freq),t);if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(15,slide),t+duration*.83);
  lp.type='lowpass';lp.frequency.value=filter;lp.Q.value=.5;p.pan.value=Math.max(-1,Math.min(1,pan));
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(lp);lp.connect(g);g.connect(p);p.connect(bus==='music'?this.music:this.fx);if(duration>.25)p.connect(bus==='music'?this.musicVerb:this.verb);
  osc.onended=()=>{osc.disconnect();lp.disconnect();g.disconnect();p.disconnect();};osc.start(t);osc.stop(t+duration+.025);this.eventsPlayed++;
 }
 noise(duration,volume,frequency=1200,pan=0,when,type='bandpass',bus='fx',white=false){
  const c=this.ctx;if(!c||c.state!=='running')return;const t=when??c.currentTime,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter(),p=c.createStereoPanner();
  s.buffer=white?this.whiteBuffer:this.noiseBuffer;f.type=type;f.frequency.value=frequency;f.Q.value=type==='bandpass'?.9:.4;p.pan.value=Math.max(-1,Math.min(1,pan));
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  s.connect(f);f.connect(g);g.connect(p);p.connect(bus==='music'?this.music:this.fx);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();};s.start(t,Math.random()*.4);s.stop(t+duration+.02);this.eventsPlayed++;
 }
 click(){this.note(650,.08,.1,'triangle',0,undefined,1800);this.note(1100,.06,.025,'sine',0,this.ctx?.currentTime+.025);}
 deny(){this.note(95,.12,.09,'triangle');this.note(76,.15,.06,'triangle',0,this.ctx?.currentTime+.06);}
 coin(){const c=this.ctx;if(!c)return;this.note(1320,.13,.045,'sine',-.4);this.note(1760,.18,.035,'sine',-.4,c.currentTime+.065);}
 train(type){const c=this.ctx;if(!c)return;this.noise(.09,.12,900,-.5);this.note(210+type*75,.2,.10,'triangle',-.5,undefined,1600);}
 deploy(age,type,side){const p=side===0?-.7:.7;this.noise(.14,.085,300,p);if(side===0)this.note([196,220,110][type],.16,.06,'triangle',p,undefined,1200);}
 hit(age,type,x){
  const c=this.ctx;if(!c||c.currentTime-this.lastHit<.045)return;this.lastHit=c.currentTime;const p=x/27;
  if(age===0){this.note(type===2?75:130,.16,type===2?.19:.11,'sine',p,undefined,900,55);this.noise(.13,.19,620,p);}
  else if(age<3){this.noise(.10,.16,2100,p,undefined,'highpass',undefined,true);this.note(620+Math.random()*260,.17,.065,'triangle',p,undefined,3200);this.note(130,.12,.095,'sine',p);}
  else{this.noise(.10,.11,1500,p);this.note(85,.13,.10,'sine',p);}
 }
 shot(age,type,x,turret=false){
  const c=this.ctx;if(!c||c.currentTime-this.lastShot<.038)return;this.lastShot=c.currentTime;const p=x/27;
  if(age===0){this.noise(.13,.10,950,p);this.note(280,.09,.055,'triangle',p,undefined,1400,100);}
  else if(age===1){this.note(175,.09,.08,'sawtooth',p,undefined,1100,90);this.noise(.09,.12,1700,p);}
  else if(age===2||age===3){this.noise(type===2?.45:.2,type===2?.30:.24,age===3&&type===0?1700:900,p,undefined,'lowpass',undefined,true);this.note(type===2?85:160,.25,type===2?.24:.14,'sine',p,undefined,750,40);this.noise(.13,.06,900,p,c.currentTime+.085);}
  else{this.note(type===2?150:780,type===2?.3:.19,.13,'sawtooth',p,undefined,1700,type===2?35:180);this.note(1100,.09,.025,'sine',p);}
 }
 boom(age,x,big=false){const c=this.ctx;if(!c)return;const p=x/28;this.note(big?62:96,big?1:.45,big?.32:.16,'sine',p,undefined,900,26);this.noise(big?1.25:.47,big?.45:.2,500,p,undefined,'lowpass');this.noise(big?.64:.25,.13,2100,p,c.currentTime+.045,'highpass',undefined,true);}
 power(age,x){const c=this.ctx;if(!c)return;const p=x/28;this.note(age===4?140:75,.6,.22,'sawtooth',p,undefined,900,age===4?1050:280);this.noise(.8,.20,700,p);}
 evolve(){const c=this.ctx;if(!c)return;this.boom(0,0,true);[50,57,62,65,69,74,77].forEach((n,i)=>this.note(midi(n),.8,.13,'triangle',(i-3)/8,c.currentTime+.07*i,2000));this.noise(1.6,.15,4500,0,c.currentTime+.2,'highpass',undefined,true);}
 result(win){const c=this.ctx;if(!c)return;const notes=win?[62,65,69,74,77,81,86]:[62,60,57,53,50];notes.forEach((n,i)=>this.note(midi(n),1.5,.15,'triangle',0,c.currentTime+i*.17,2300));}
 tick(age=0,intensity=0){
  const c=this.ctx;if(!c||c.state!=='running'||this.paused)return;this.age=age;
  if(this.next<c.currentTime-.5)this.next=c.currentTime+.06;
  const bpm=98+age*5,eighth=60/bpm/2;
  let guard=0;while(this.next<c.currentTime+.15&&guard++<8){
   const s=this.step++,t=this.next;this.next+=eighth;const bar=Math.floor(s/16),beat=s%16,rootNote=[38,34,41,36][bar%4];
   // Eight-bar D-minor theme: sparse flute/plucked strings, then brass and synth layers.
   const melody=[[12,19,24,22,19,15,17,19],[12,19,22,24,27,24,22,19],[15,19,24,26,24,19,17,15],[10,17,22,24,22,17,14,10]][bar%4];
   if(beat%2===0){const n=rootNote+melody[(beat/2)%8];this.note(midi(n),age===0?.55:.43,.085,age<2?'sine':age<4?'triangle':'triangle',.25,t,1600,0,'music',.024);if(age>0)this.note(midi(n)*1.002,.4,.022,'sawtooth',-.2,t,950,0,'music',.018);}
   if(beat%4===0){this.note(midi(rootNote),.85,.16,age<3?'triangle':'sawtooth',-.12,t,450,0,'music',.017);this.note(115,.29,.21,'sine',0,t,750,38,'music');this.noise(.20,.075,400,0,t,'lowpass','music');}
   if(beat===4||beat===12){this.noise(.14,age<2?.055:.11,age<2?750:2200,.12,t,'bandpass','music',age>1);this.note(174,.11,.065,'triangle',.15,t,1200,90,'music');}
   if(age>1&&beat%2===1)this.noise(.055,.025,6500,-.2,t,'highpass','music',true);
   if(beat===0){[0,7,15].forEach((n,i)=>this.note(midi(rootNote+n+12),4.6,.043,age===4?'sawtooth':'triangle',(i-1)*.4,t,age===4?650:1000,0,'music',.4));}
   if(intensity>.4&&beat%4===2)this.note(90,.18,.11*intensity,'sine',-.3,t,600,35,'music');
  }
 }
}
root.EpochAudio=EpochAudio;
})(globalThis);

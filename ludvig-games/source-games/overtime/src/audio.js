const midi=n=>440*Math.pow(2,(n-69)/12);
const spatialPan=(position,listener)=>{if(!position||!listener?.position)return 0;const q=listener.quaternion||{x:0,y:0,z:0,w:1},p=listener.position;const rightX=1-2*(q.y*q.y+q.z*q.z),rightY=2*(q.x*q.y+q.z*q.w),rightZ=2*(q.x*q.z-q.y*q.w);return Math.max(-.85,Math.min(.85,((position.x-p.x)*rightX+(position.y-p.y)*rightY+(position.z-p.z)*rightZ)*.035));};
export class GameAudio {
  constructor(settings){this.settings=settings;this.ctx=null;this.mode='menu';this.step=0;this.nextNote=0;this.lastHit=0;this.voices=0;this.time=0;this.boosting=false;this.remote=new Map();}
  async unlock(){
    if(!this.ctx){
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      const c=this.ctx=new C();this.master=c.createGain();this.master.gain.value=0;
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=16;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.2;this.master.connect(compressor);compressor.connect(c.destination);
      this.sfx=c.createGain();this.music=c.createGain();this.sfx.connect(this.master);this.music.connect(this.master);
      const n=c.sampleRate*3;this.noise=c.createBuffer(1,n,c.sampleRate);const data=this.noise.getChannelData(0);let brown=0;for(let i=0;i<n;i++){const white=Math.random()*2-1;brown=(brown+.025*white)/1.025;data[i]=white*.65+brown*.7;}
      this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=500;this.engineGain.connect(this.engineFilter);this.engineFilter.connect(this.sfx);
      this.engineOsc=[];for(let i=0;i<3;i++){const o=c.createOscillator();o.type=i===0?'sawtooth':'triangle';o.frequency.value=38*(i+1);o.detune.value=i===1?-7:4;const g=c.createGain();g.gain.value=i===0?.19:.09;o.connect(g);g.connect(this.engineGain);o.start();this.engineOsc.push(o);}
      const exhaust=c.createBufferSource();exhaust.buffer=this.noise;exhaust.loop=true;const exhaustFilter=c.createBiquadFilter();exhaustFilter.type='bandpass';exhaustFilter.frequency.value=120;exhaustFilter.Q.value=.65;exhaust.connect(exhaustFilter);const eg=c.createGain();eg.gain.value=.12;exhaustFilter.connect(eg);eg.connect(this.engineGain);exhaust.start();
      this.boostGain=c.createGain();this.boostGain.gain.value=0;this.boostFilter=c.createBiquadFilter();this.boostFilter.type='bandpass';this.boostFilter.frequency.value=700;this.boostFilter.Q.value=.55;const bs=c.createBufferSource();bs.buffer=this.noise;bs.loop=true;bs.connect(this.boostFilter);this.boostFilter.connect(this.boostGain);this.boostGain.connect(this.sfx);bs.start();
      this.skidGain=c.createGain();this.skidGain.gain.value=0;const sk=c.createBufferSource();sk.buffer=this.noise;sk.loop=true;const sf=c.createBiquadFilter();sf.type='bandpass';sf.frequency.value=1700;sf.Q.value=1.4;sk.connect(sf);sf.connect(this.skidGain);this.skidGain.connect(this.sfx);sk.start();
      this.crowdGain=c.createGain();this.crowdGain.gain.value=.017;const cr=c.createBufferSource();cr.buffer=this.noise;cr.loop=true;cr.playbackRate.value=.7;const cf=c.createBiquadFilter();cf.type='bandpass';cf.frequency.value=850;cf.Q.value=.45;cr.connect(cf);cf.connect(this.crowdGain);this.crowdGain.connect(this.sfx);cr.start();
      this.setSettings(this.settings);this.nextNote=c.currentTime+.08;
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  setSettings(s){this.settings=s;if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(s.master,t,.05);this.sfx.gain.setTargetAtTime(s.sfx,t,.05);this.music.gain.setTargetAtTime(s.music*.45,t,.08);}
  setMode(mode){this.mode=mode;}
  update(dt,car,cars=[],listener=car){
    this.time+=dt;if(!this.ctx||this.ctx.state!=='running')return;const c=this.ctx,t=c.currentTime,playing=this.mode==='play';const speed=car?.speed||0,throttle=Math.abs(car?.input?.throttle||0),boost=playing&&car?.input?.boost&&car?.boost>0;
    const rpm=33+speed*3+throttle*20;for(let i=0;i<3;i++)this.engineOsc[i].frequency.setTargetAtTime(rpm*(i+1),t,.09);this.engineFilter.frequency.setTargetAtTime(320+speed*22+throttle*180,t,.1);this.engineGain.gain.setTargetAtTime(playing?.2+throttle*.35+speed*.004:0,t,.12);
    this.boostGain.gain.setTargetAtTime(boost?.23:0,t,.05);this.boostFilter.frequency.setTargetAtTime(650+speed*7,t,.2);
    this.skidGain.gain.setTargetAtTime(playing&&car?.grounded&&car?.input?.powerslide&&speed>6?Math.min(.10,speed*.004):0,t,.05);
    this.crowdGain.gain.setTargetAtTime((playing?.023:.010)*(1+.1*Math.sin(this.time*.23)),t,.5);
    this.updateRemote(cars,car,listener,playing,t);
    if(boost&&!this.boosting)this.noiseBurst(t,.17,.11,1100,'bandpass');this.boosting=boost;
    if(this.nextNote<t-.5)this.nextNote=t+.05;
    let count=0;while(this.nextNote<t+.15&&count++<8){this.musicStep(this.step++,this.nextNote);this.nextNote+=60/(this.mode==='menu'?112:126)/4;}
  }
  updateRemote(cars,player,listener,playing,t){
    const ids=new Set(cars.filter(c=>c.id!==0).map(c=>c.id));
    for(const [id,remote]of this.remote)if(!ids.has(id)){remote.source.stop();remote.osc.stop();for(const node of [remote.source,remote.osc,remote.filter,remote.noiseGain,remote.motorGain,remote.pan])node.disconnect();this.remote.delete(id);}
    for(const car of cars){if(car.id===0)continue;let r=this.remote.get(car.id);if(!r){const c=this.ctx,source=c.createBufferSource(),osc=c.createOscillator(),filter=c.createBiquadFilter(),noiseGain=c.createGain(),motorGain=c.createGain(),pan=c.createStereoPanner();source.buffer=this.noise;source.loop=true;filter.type='bandpass';filter.frequency.value=750;filter.Q.value=.5;noiseGain.gain.value=0;motorGain.gain.value=0;osc.type='triangle';osc.frequency.value=65;source.connect(filter);filter.connect(noiseGain);noiseGain.connect(pan);osc.connect(motorGain);motorGain.connect(pan);pan.connect(this.sfx);source.start();osc.start();r={source,osc,filter,noiseGain,motorGain,pan};this.remote.set(car.id,r);}
      const distance=player?Math.hypot(car.position.x-player.position.x,car.position.y-player.position.y,car.position.z-player.position.z):100;const attenuation=playing?1/(1+distance*.11):0;const boosting=car.input?.boost&&car.boost>0;r.noiseGain.gain.setTargetAtTime(boosting?.11*attenuation:0,t,.1);r.motorGain.gain.setTargetAtTime((.009+Math.min(.018,car.speed*.0006))*attenuation,t,.1);r.osc.frequency.setTargetAtTime(52+car.speed*3,t,.1);r.pan.pan.setTargetAtTime(spatialPan(car.position,listener),t,.1);
    }
  }
  noiseBurst(time,duration,volume,freq=1500,type='lowpass',destination=this.sfx,pan=0){
    if(!this.ctx||this.voices>45)return;this.voices++;const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=.65;g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),time+.006);g.gain.exponentialRampToValueAtTime(.0001,time+duration);s.connect(f);f.connect(g);const p=c.createStereoPanner();p.pan.value=pan;g.connect(p);p.connect(destination);s.start(time,Math.random());s.stop(time+duration+.02);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();this.voices--;};
  }
  tone(time,freq,duration,volume,type='sine',destination=this.sfx,endFreq=null,pan=0){
    if(!this.ctx||this.voices>45)return;this.voices++;const c=this.ctx,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();o.type=type;o.frequency.setValueAtTime(freq,time);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(15,endFreq),time+duration*.7);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),time+.006);g.gain.exponentialRampToValueAtTime(.0001,time+duration);p.pan.value=pan;o.connect(g);g.connect(p);p.connect(destination);o.start(time);o.stop(time+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();this.voices--;};
  }
  synth(time,note,duration,volume,type='sawtooth',cutoff=900,pan=0){
    if(!this.ctx||this.voices>44)return;this.voices++;const c=this.ctx,o=c.createOscillator(),o2=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner();o.type=type;o2.type='triangle';o.frequency.value=midi(note);o2.frequency.value=midi(note);o2.detune.value=7;f.type='lowpass';f.Q.value=.7;f.frequency.setValueAtTime(cutoff,time);f.frequency.exponentialRampToValueAtTime(Math.max(140,cutoff*.3),time+duration);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.02);g.gain.setTargetAtTime(.0001,time+duration*.28,duration*.2);p.pan.value=pan;o.connect(f);o2.connect(f);f.connect(g);g.connect(p);p.connect(this.music);o.start(time);o2.start(time);o.stop(time+duration+.1);o2.stop(time+duration+.1);o.onended=()=>{o.disconnect();o2.disconnect();f.disconnect();g.disconnect();p.disconnect();this.voices--;};
  }
  musicStep(step,t){
    if(!this.ctx||this.settings.music<.005||this.mode==='paused')return;
    const k=step%16,bar=Math.floor(step/16)%8,roots=[45,41,48,43,45,41,48,43],root=roots[bar];const menu=this.mode==='menu'||this.mode==='garage',amp=menu?.65:1;
    if(k===0||k===8||(!menu&&(k===6||k===14))){this.tone(t,130,.18,.37*amp,'sine',this.music,42);this.noiseBurst(t,.025,.035*amp,2200,'highpass',this.music);}
    if(k===4||k===12){this.noiseBurst(t,.16,.13*amp,2200,'bandpass',this.music);this.tone(t,175,.09,.055*amp,'triangle',this.music,100);}
    if(k%2===0){this.noiseBurst(t,.033,k%4===0?.026*amp:.045*amp,7800,'highpass',this.music,k%4===0?-.25:.25);}if(!menu&&bar%4===3&&k>=14)this.noiseBurst(t,.045,.025,6200,'highpass',this.music);
    if([0,3,6,8,11,14].includes(k)){const n=root+(k===11?12:0);this.synth(t,n,.21,.045*amp,'sawtooth',menu?400:680,0);}
    if(k===0){for(let i=0;i<3;i++){const offset=[12,(bar===2||bar===6?16:15),19][i];this.synth(t,root+offset,1.65,.009*amp,'triangle',1400,(i-1)*.5);}}
    const melodyA=[24,null,31,null,27,26,null,24,null,19,24,null,26,null,31,27];const melodyB=[19,null,24,26,null,27,null,31,29,null,27,null,26,24,null,19];const m=(bar<4?melodyA:melodyB)[k];if(m!=null&&(!menu||k%4===0))this.synth(t,root+m,.28,.009*amp,'triangle',1800+Math.sin(step*.3)*400,k%2?-.25:.25);
  }
  event(ev,player,listener=player){
    if(!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime;const d=ev.position&&player?Math.hypot(ev.position.x-player.position.x,ev.position.y-player.position.y,ev.position.z-player.position.z):0;const attenuation=1/(1+d*.045);const pan=spatialPan(ev.position,listener);
    switch(ev.type){
      case 'ballHit':case 'wallHit':case 'carHit':{const strength=Math.min(1,Math.max(.08,ev.intensity||.2));if(t-this.lastHit<.045||strength<.06)return;this.lastHit=t;const a=strength*attenuation;this.tone(t,ev.type==='ballHit'?95:64,.21,.3*a,'sine',this.sfx,32,pan);this.noiseBurst(t,.095,.25*a,ev.type==='ballHit'?1500:2400,'lowpass',this.sfx,pan);this.tone(t,ev.type==='ballHit'?210:135,.045,.05*a,'triangle',this.sfx,110,pan);break;}
      case 'jump':this.noiseBurst(t,.17,.1*attenuation,1100,'bandpass',this.sfx,pan);this.tone(t,170,.1,.07*attenuation,'triangle',this.sfx,260,pan);break;
      case 'flip':this.noiseBurst(t,.26,.14*attenuation,850,'bandpass',this.sfx,pan);this.tone(t,85,.17,.10*attenuation,'sine',this.sfx,170,pan);break;
      case 'pickup':if(ev.carId===0){this.tone(t,ev.large?520:660,.17,.09,'triangle',this.sfx,880);this.tone(t+.045,ev.large?1040:990,.2,.045,'sine');this.noiseBurst(t,.08,.03,3800,'highpass');}break;
      case 'goal':this.goal(t);break;
    }
  }
  ui(){if(this.ctx){const t=this.ctx.currentTime;this.noiseBurst(t,.026,.045,2500,'bandpass');this.tone(t,720,.035,.018,'sine',this.sfx,550);}}
  countdown(n){if(!this.ctx)return;const t=this.ctx.currentTime;if(n>0){this.tone(t,392,.22,.11,'triangle');this.tone(t,196,.18,.12,'sine');}else{this.tone(t,523,.55,.09,'triangle');this.tone(t,659,.55,.075,'triangle');this.tone(t,784,.55,.06,'triangle');this.noiseBurst(t,.4,.13,1700,'highpass');}}
  goal(t=this.ctx?.currentTime){if(!this.ctx)return;this.tone(t,80,1.2,.5,'sine',this.sfx,25);this.noiseBurst(t,.65,.43,1800,'lowpass');this.noiseBurst(t+.1,2.8,.20,1500,'bandpass');[48,55,60,64,67,72].forEach((n,i)=>this.tone(t+i*.06,midi(n),.8,.06,'triangle'));}
  end(win){if(!this.ctx)return;const t=this.ctx.currentTime;[60,win?64:63,67,72].forEach((n,i)=>this.synth(t+i*.12,n,.8,.025,'triangle',2200,0));this.noiseBurst(t,.35,.05,1300,'lowpass');}
  async suspend(){if(this.ctx?.state==='running')await this.ctx.suspend();}
  dispose(){this.ctx?.close();this.ctx=null;this.remote.clear();}
}

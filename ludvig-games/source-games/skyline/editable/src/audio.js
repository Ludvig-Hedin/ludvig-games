/* Original procedural sounds. No media downloads or third-party audio assets.
 * AudioContext is created/resumed only from an actual click or keypress. */
(function(){'use strict';const S=window.SKY;
class FlightAudio{
 constructor(){this.ctx=null;this.muted=false;this.volume=.65;this.events=0;this.lastWarning=0;this.lastRadio=0;this.supported=true;}
 async unlock(){
  try{
   if(!this.ctx)this.create();
   if(this.ctx&&this.ctx.state==='suspended')await this.ctx.resume();
  }catch(e){this.supported=false;console.warn('Audio unavailable:',e.message);}
 }
 create(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC){this.supported=false;return;}
  const c=this.ctx=new AC(),master=this.master=c.createGain(),compressor=c.createDynamicsCompressor();
  master.gain.value=this.muted?0:this.volume*.48;compressor.threshold.value=-15;compressor.knee.value=12;compressor.ratio.value=3.5;master.connect(compressor);compressor.connect(c.destination);
  this.analyser=c.createAnalyser();this.analyser.fftSize=256;compressor.connect(this.analyser);
  this.engine=c.createGain();this.engine.gain.value=0;this.engine.connect(master);
  const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;filter.Q.value=.45;filter.connect(this.engine);this.engineFilter=filter;
  // Layered periodic engine waveform: the irregular harmonics are less buzzy than a raw sawtooth.
  const real=new Float32Array(13),imag=new Float32Array(13);[0,.9,.2,.44,.11,.16,.045,.06,.025,.025,.01,.012].forEach((v,i)=>imag[i]=v);
  const wave=c.createPeriodicWave(real,imag);this.motor=c.createOscillator();this.motor.setPeriodicWave(wave);this.motor.frequency.value=46;this.motor.connect(filter);this.motor.start();
  this.motor2=c.createOscillator();this.motor2.type='sine';this.motor2.frequency.value=91;const harmonic=c.createGain();harmonic.gain.value=.11;this.motor2.connect(harmonic);harmonic.connect(filter);this.motor2.start();
  // Propeller chopper modulation, applied gently rather than an exhausting helicopter sound.
  const lfo=c.createOscillator(),lfoGain=c.createGain();lfo.frequency.value=17;lfoGain.gain.value=.014;lfo.connect(lfoGain);lfoGain.connect(this.engine.gain);lfo.start();this.lfo=lfo;this.lfoGain=lfoGain;
  this.noiseBuffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate);const data=this.noiseBuffer.getChannelData(0);let brown=0;const rng=S.random(511);
  for(let i=0;i<data.length;i++){brown=(brown+.03*(rng()*2-1))/1.025;data[i]=brown*4;}
  this.wind=c.createGain();this.wind.gain.value=0;const windfilter=c.createBiquadFilter();windfilter.type='highpass';windfilter.frequency.value=280;
  const noise=c.createBufferSource();noise.buffer=this.noiseBuffer;noise.loop=true;noise.connect(windfilter);windfilter.connect(this.wind);this.wind.connect(master);noise.start();this.windSource=noise;
  this.rumble=c.createGain();this.rumble.gain.value=0;const rfilter=c.createBiquadFilter();rfilter.type='lowpass';rfilter.frequency.value=175;noise.connect(rfilter);rfilter.connect(this.rumble);this.rumble.connect(master);
 }
 setVolume(v){this.volume=S.clamp(v,0,1);if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:this.volume*.48,this.ctx.currentTime,.045);}
 setMute(value){this.muted=value;this.setVolume(this.volume);}
 update(s,active,dt,camera){
  if(!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime,on=active&&!s.crashed;
  const rpm=37+s.throttle*52+s.speed*.13+(s.boosting?13:0);
  this.motor.frequency.setTargetAtTime(rpm,t,.17);this.motor2.frequency.setTargetAtTime(rpm*2.015,t,.18);this.lfo.frequency.setTargetAtTime(rpm*.48,t,.2);
  this.engineFilter.frequency.setTargetAtTime(camera===1?590:900+s.throttle*430,t,.3);
  this.engine.gain.setTargetAtTime(on?.065+s.throttle*.10:0,t,.18);this.lfoGain.gain.setTargetAtTime(on?.014:0,t,.12);
  this.wind.gain.setTargetAtTime(on?Math.pow(s.speed/105,2)*.28+(s.boosting?.13:0):0,t,.2);
  this.rumble.gain.setTargetAtTime(on&&s.grounded?s.speed*.0055:0,t,.09);
  if(on&&s.stall>.15&&t-this.lastWarning>1.15){this.tone(570,.085,.038);this.lastWarning=t;}
 }
 tone(freq=500,duration=.15,volume=.12,type='sine',delay=0,end=null){
  if(!this.ctx||this.muted)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);this.events++;
 }
 noise(duration=.5,volume=.3,filterHz=900,pan=0){
  if(!this.ctx||this.muted)return;const c=this.ctx,t=c.currentTime,n=c.createBufferSource(),g=c.createGain(),filter=c.createBiquadFilter();n.buffer=this.noiseBuffer;filter.type='lowpass';filter.frequency.value=filterHz;
  n.connect(filter);filter.connect(g);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=S.clamp(pan,-1,1);g.connect(p);p.connect(this.master);}else g.connect(this.master);
  n.start(t);n.stop(t+duration+.02);this.events++;
 }
 play(kind,amount=1){
  if(!this.ctx||this.muted)return;
  if(kind==='gate'){[659.25,830.6,987.8,1318.5].forEach((f,i)=>this.tone(f,.22,.065,'sine',i*.065));this.noise(.23,.13,1800);}
  if(kind==='perfect'){[783.99,987.8,1174.66,1567.98].forEach((f,i)=>this.tone(f,.25,.065,'sine',i*.058));}
  if(kind==='takeoff'){this.noise(.45,.19,170);this.tone(360,.3,.045,'sine',0,620);}
  if(kind==='landing'){this.noise(.32,.43,340);this.tone(62,.25,.16,'sine',0,31);setTimeout(()=>this.play('gate'),230);}
  if(kind==='boost'){this.noise(.7,.34,1600);this.tone(85,.45,.085,'sawtooth',0,185);}
  if(kind==='crash'){this.noise(1.1,.7,700);this.tone(91,.7,.34,'triangle',0,24);}
  if(kind==='near'){this.noise(.65,.46,1200,amount);this.tone(470,.23,.045,'sine',.05,240);}
  if(kind==='ui'){this.tone(670,.07,.045);}
  if(kind==='radio'){this.noise(.11,.12,1900);this.tone(920,.07,.034);this.tone(680,.07,.025,'sine',.09);}
  if(kind==='finish'){[523.25,659.25,783.99,1046.5].forEach((f,i)=>this.tone(f,.5,.08,'sine',i*.11));}
 }
 level(){if(!this.analyser)return 0;const data=new Uint8Array(this.analyser.fftSize);this.analyser.getByteTimeDomainData(data);let sum=0;for(const n of data)sum+=(n-128)**2;return Math.sqrt(sum/data.length)/128;}
}
S.FlightAudio=FlightAudio;
})();

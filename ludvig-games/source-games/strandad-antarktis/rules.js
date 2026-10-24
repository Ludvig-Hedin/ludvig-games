export const SETTINGS={adventure:{deadline:720,drain:.42},race:{deadline:540,drain:.56}};
export const CAPACITY=2;
export function newQuestState(){return{ready:[false,false,false,false,false,false],tank:{x:10,z:14,angle:0},valves:[false,false,false],engineProgress:0,engineStarted:false,follow:false,chick:{x:26,z:87},chickWaypoint:0,relayStep:0,relayTime:0,signalActive:false,signalLocks:0,signalCooldown:0,noseWindow:0,caches:[],shelters:[],rumbleAt:0,activePart:0};}
export function newRun(mode='adventure'){return{mode:SETTINGS[mode]?mode:'adventure',time:0,phase:'playing',parts:[0,0,0,0,0,0],coins:0,totalCoins:0,warmth:100,stamina:100,health:3,deathReason:null,quest:newQuestState(),iceHits:0,switches:[false,false,false,false],collapses:0,bearHits:0,upgrades:{boots:false,coat:false},rivalParts:0,event:null,eventIndex:0,supplyCollected:false,score:0,win:false};}
export function carried(s){return s.parts.filter(p=>p===1).length;}
export function installed(s){return s.parts.filter(p=>p===2).length;}
export function found(s){return s.parts.filter(p=>p>0).length;}
export function takePart(s,index){if(!Number.isInteger(index)||index<0||index>=6)return{ok:false,reason:'invalid'};if(s.parts[index]!==0)return{ok:false,reason:'taken'};if(carried(s)>=CAPACITY)return{ok:false,reason:'full'};s.parts[index]=1;s.coins+=3;s.totalCoins+=3;s.warmth=Math.min(100,s.warmth+8);return{ok:true};}
export function installParts(s){let result=[];s.parts.forEach((p,i)=>{if(p===1){s.parts[i]=2;result.push(i);}});return result;}
export function canLaunch(s){return installed(s)===6;}
export function recover(s){s.collapses++;s.coins=Math.max(0,s.coins-4);s.warmth=65;s.stamina=100;}
export const SHOP_ITEMS=[{id:'cocoa',name:'Varm choklad',desc:'+45 värme',cost:5,icon:'☕'},{id:'bandage',name:'Första hjälpen',desc:'+1 hjärta',cost:9,icon:'♥'},{id:'boots',name:'Expeditionskängor',desc:'20% snabbare',cost:10,icon:'↟'},{id:'coat',name:'Dubbla lager',desc:'40% mindre kyla',cost:12,icon:'✳'}];
export function buy(s,id){let item=SHOP_ITEMS.find(p=>p.id===id);if(!item)return{ok:false,reason:'invalid'};if(s.coins<item.cost)return{ok:false,reason:'coins'};if(id==='cocoa'&&s.warmth>=99)return{ok:false,reason:'warm'};if(id==='bandage'&&s.health>=3)return{ok:false,reason:'healthy'};if(s.upgrades[id])return{ok:false,reason:'owned'};s.coins-=item.cost;if(id==='cocoa')s.warmth=Math.min(100,s.warmth+45);else if(id==='bandage')s.health=Math.min(3,s.health+1);else s.upgrades[id]=true;return{ok:true};}
export function rivalCountAt(s){return Math.min(6,Math.floor(Math.max(0,s.time-15)/(SETTINGS[s.mode].deadline-35)*6));}
export function computeScore(s){return Math.max(0,installed(s)*300+s.totalCoins*20+(s.win?2000+Math.floor(Math.max(0,SETTINGS[s.mode].deadline-s.time)*10):0)-s.collapses*150-s.bearHits*40);}
export function formatTime(seconds){seconds=Math.max(0,Math.floor(seconds));return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}

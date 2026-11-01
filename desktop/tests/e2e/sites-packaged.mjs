// Run the actual packaged Mac app in its existing invisible, isolated self-test mode.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'ludvig-games/output/sites-packaged-check');
await fs.mkdir(out,{recursive:true});
const binary=path.join(root,'desktop/release/mac-arm64/Ludvig Games.app/Contents/MacOS/Ludvig Games');
const hook=`(async()=>{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const local=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()==='Local');
 if(!local)throw new Error('Local mode missing');local.click();await sleep(200);
 const play=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Play now');play.click();await sleep(400);
 const enter=square=>{const element=document.querySelector('[data-square='+square+']');element.focus();element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
 enter('e2');await sleep(100);enter('e4');await sleep(400);
 const square=document.querySelector('[data-square=e4]');square.focus();
 const moved=/white pawn/.test(square.getAttribute('aria-label'));
 return {moved};
})()`;
const environment=Object.fromEntries(['HOME','TMPDIR','AGENT_JOB_TOKEN','AGENT_RUNTIME_DIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
Object.assign(environment,{PATH:'/Users/ludvighedin/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin:/usr/sbin:/sbin',NODE_OPTIONS:'--max-old-space-size=768',LUDVIG_BIND:'127.0.0.1',LUDVIG_PORT_OFFSET:'200',LUDVIG_SELFTEST:out,LUDVIG_SELFTEST_GAME:'http://127.0.0.1:48012/',LUDVIG_SELFTEST_ROOM:hook});
const child=spawn(binary,[],{env:environment,stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;});
const timer=setTimeout(()=>child.kill('SIGTERM'),90000);
const exited=new Promise(resolve=>child.on('exit',async code=>{await fs.writeFile(path.join(out,'app.log'),output);resolve(code);}));
let available=false;
for(let attempt=0;attempt<40;attempt++){
 try{available=(await fetch('http://127.0.0.1:48000/')).status===200;if(available)break;}catch{}
 await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal(available,true,'packaged hub starts');
for(const slug of ['pace','breach','yeet-club','last-call','last-cart','penthouse-panic']){
 assert.equal((await fetch(`http://127.0.0.1:48000/${slug}/`)).status,200,`${slug} is served by the app`);
}
const store=await fetch('http://127.0.0.1:48000/api/store').then(r=>r.json());
assert.notEqual(store.ready,true,'game-only release cannot open checkout');
const exit=await exited;clearTimeout(timer);
await fs.writeFile(path.join(out,'app.log'),output);
assert.equal(exit,0,'packaged app exits cleanly');
const report=JSON.parse(await fs.readFile(path.join(out,'report.json')));
assert.ok(!report.error,report.error);
const game=report.steps.find(s=>s.step==='game');assert.equal(game.desktopScript,true);assert.equal(game.context,'chess');
const result=report.steps.find(s=>s.step==='room').answer;
assert.equal(result.moved,true,JSON.stringify(result));
console.log('PASS packaged Mac: Chess moves correctly, six imported routes load, purchases stay closed.');

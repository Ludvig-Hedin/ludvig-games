import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const desktop=path.resolve(import.meta.dirname,'..');
const app=path.join(desktop,'release/mac-arm64/Ludvig Games.app');
const resources=path.join(app,'Contents/Resources/app');
const read=(name)=>readFile(path.join(resources,name));

test('the actual Mac release contains the games and focus repair with purchases closed',async()=>{
 assert.equal(JSON.parse(await read('package.json')).version,'0.4.3');
 assert.deepEqual(JSON.parse(await read('bundle/hub/commerce/config.json')),{});
 const store=await read('bundle/hub/client/assets/store-client.js');
 assert.ok(!store.toString().startsWith('window.__LUDVIG_STORE_API='));
 const home=(await read('bundle/hub/client/index.html')).toString();
 for(const slug of ['pace','breach','yeet-club','last-call','last-cart','penthouse-panic']){
  assert.ok(home.includes(`href="/${slug}/"`),`${slug} has a card`);
  const source=await readFile(path.join(desktop,'../ludvig-games/public',slug,'index.html'));
  assert.deepEqual(await read(`bundle/hub/client/${slug}/index.html`),source,`${slug} is the checked game`);
 }
 for(const slug of ['chess','table-tennis','mind-games']){
  assert.ok(home.includes(`https://${slug}.ludvighedin.com/`),`${slug} has a local-mapped card`);
  assert.ok((await read(`bundle/${slug}/client/index.html`)).length>1000);
 }
 const cssDir='bundle/chess/client/_next/static/css';
 const styles=(await Promise.all((await readdir(path.join(resources,cssDir))).filter(x=>x.endsWith('.css')).map(x=>read(`${cssDir}/${x}`)))).join('\n');
 assert.ok(styles.includes('.board-square:focus-visible::after'));
 assert.ok(!styles.includes('.board-square:focus-visible{z-index:6'));
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
});

test('the updater archive verifies with the existing release trust key',async()=>{
 const zip=path.join(desktop,'release/Ludvig-Games-mac-arm64.zip');
 const signature=JSON.parse(await readFile(`${zip}.sig`));
 const hash=createHash('sha256');for await(const chunk of createReadStream(zip))hash.update(chunk);
 const digest=hash.digest();assert.equal(digest.toString('hex'),signature.sha256);
 const key=await readFile(path.join(desktop,'app/update-key.pem'));
 assert.deepEqual(await read('app/update-key.pem'),key);
 assert.equal(verify(null,digest,key,Buffer.from(signature.signature,'base64')),true);
});

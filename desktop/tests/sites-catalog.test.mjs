import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GAMES } from '../runtime/games.mjs';

const hub=new URL('../../ludvig-games/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('games.json',hub),'utf8'));
const imported=['pace','breach','yeet-club','last-call','last-cart','penthouse-panic'];

test('every separately bundled game is reachable from the catalogue',()=>{
 for(const game of GAMES){
  const entry=catalog.find(item=>item.slug===game.id);
  assert.ok(entry,`${game.id} is missing from the hub`);
  assert.equal(entry.hidden,false,`${game.id} must be shown in the local app`);
  const origin=new URL(entry.external).origin;
  // inject.js also recognises the existing workers.dev addresses.
  assert.ok([game.site,`https://${game.id}.ludvighedin.workers.dev`].includes(origin),`${game.id} must map to its local server`);
 }
});

test('imported games are playable in both generated hub locations and the Mac bundle',async()=>{
 const home=await readFile(new URL('public/index.html',hub),'utf8');
 const desktopHome=await readFile(new URL('../bundle/hub/client/index.html',import.meta.url),'utf8');
 for(const slug of imported){
  assert.ok(home.includes(`href="/${slug}/"`),`${slug} needs a hub card`);
  assert.ok(desktopHome.includes(`href="/${slug}/"`),`${slug} needs a Mac card`);
  for(const location of [`public/${slug}/index.html`,`public/games/${slug}/index.html`]){
   const html=await readFile(new URL(location,hub),'utf8');
   assert.ok(html.includes(`data-game="${slug}"`),`${slug} needs isolated saves`);
  }
  const bundled=await readFile(new URL(`../bundle/hub/client/${slug}/index.html`,import.meta.url),'utf8');
  assert.ok(bundled.includes(`data-game="${slug}"`));
 }
});

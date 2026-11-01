// Focused entry, input and rendering checks for the November Sites import.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'ludvig-games/output/sites-import-check');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const origin='http://127.0.0.1:4317';
try {
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.route('**/*',r=>r.request().url().startsWith(origin)||/^(data:|blob:)/.test(r.request().url())?r.continue():r.abort());
 const page=await ctx.newPage();
 const games=[['pace','#start-button'],['breach','#play-solo'],['yeet-club','#solo-btn'],['last-call','#play-btn'],['last-cart','#play-button'],['penthouse-panic','#play-button']];
 for(const [slug,start]of process.argv.includes('--chess-only')?[]:games){
  const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
  await page.goto(`${origin}/${slug}/`);await page.waitForTimeout(1200);
  assert.deepEqual(errors,[],`${slug} startup errors`);
  await page.locator(start).click();await page.waitForTimeout(3500);
  assert.deepEqual(errors,[],`${slug} play errors`);
  if(slug==='pace'){
   await page.locator('#typing-input').fill('the quick brown fox');
   assert.equal(await page.locator('#typing-input').inputValue(),'the quick brown fox');
   await page.locator('#restart-button').click();
  }else{await page.keyboard.press('Escape');await page.waitForTimeout(150);}
  console.log(`PASS ${slug}: opens and starts without runtime errors`);
  await page.screenshot({path:path.join(out,`${slug}.png`)});
  page.off('pageerror',listener);
 }
 await ctx.close();
 const chess=await browser.newContext({viewport:{width:1280,height:900}});
 const chessRoot=path.join(root,'desktop/bundle/chess/client');
 const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.rsc':'text/x-component'};
 await chess.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
  const pathname=decodeURIComponent(u.pathname);const file=path.resolve(chessRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(chessRoot+path.sep))return route.abort();
  try{await route.fulfill({body:await fs.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
 });
 const cp=await chess.newPage();cp.on('pageerror',e=>console.log('chess page error:',e.message));
 await cp.goto(origin);await cp.waitForTimeout(1500);
 await cp.getByRole('tab',{name:'Local',exact:true}).click();
 await cp.getByRole('button',{name:'Play now',exact:true}).click();
 async function focusedPiece(square){
  const target=cp.locator(`[data-square="${square}"]`);
  await cp.keyboard.press('Tab');await target.focus();
  assert.equal(await target.evaluate(e=>e.matches(':focus-visible')),true);
  const box=await target.boundingBox();const clip={x:box.x+box.width*.25,y:box.y+box.height*.25,width:box.width*.5,height:box.height*.5};
  await cp.waitForTimeout(220);
  const focused=await cp.screenshot({clip});
  await target.evaluate(e=>e.blur());
  const blurred=await cp.screenshot({clip});
  assert.deepEqual(focused,blurred,`piece on ${square} must stay visible while focused`);
 }
 async function keyboardMove(from,to){
  await cp.locator(`[data-square="${from}"]`).focus();await cp.keyboard.press('Enter');
  await cp.locator(`[data-square="${to}"]`).focus();await cp.keyboard.press('Enter');
  await cp.waitForTimeout(250);
 }
 await keyboardMove('e2','e4');await focusedPiece('e4');
 // Negative control proves the original focus layer hid the destination piece.
 const old=await cp.addStyleTag({content:'.chess-board .board-square:focus-visible{z-index:6;outline:3px solid #315cbe}'});
 await assert.rejects(()=>focusedPiece('e4'),/piece on e4/);await old.evaluate(e=>e.remove());
 await cp.locator('[data-square="d7"]').click();await cp.locator('[data-square="d5"]').click();await focusedPiece('d5');
 await cp.locator('[data-square="e4"]').click();await cp.locator('[data-square="d5"]').click();await focusedPiece('d5');
 const from=await cp.locator('[data-square="g8"]').boundingBox(),to=await cp.locator('[data-square="f6"]').boundingBox();
 await cp.mouse.move(from.x+from.width/2,from.y+from.height/2);await cp.mouse.down();
 await cp.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await cp.mouse.up();
 await cp.waitForTimeout(250);assert.match(await cp.locator('[data-square="f6"]').getAttribute('aria-label'),/black knight/);await focusedPiece('f6');
 console.log('PASS chess: keyboard, click, capture and drag keep pieces visible; original CSS fails the same check');
 await cp.getByRole('button',{name:'Import game',exact:true}).click();
 await cp.getByRole('textbox',{name:'PGN game or FEN position'}).fill('7k/P7/8/8/8/8/8/7K w - - 0 1');
 await cp.getByRole('button',{name:'Open game',exact:true}).click();
 await cp.locator('[data-square="a7"]').click();await cp.locator('[data-square="a8"]').click();
 await cp.getByRole('button',{name:'Promote to queen',exact:true}).click();
 await cp.waitForTimeout(250);assert.match(await cp.locator('[data-square="a8"]').getAttribute('aria-label'),/white queen/);await focusedPiece('a8');
 console.log('PASS chess: promoted queen remains visible while its square has focus');
 await cp.screenshot({path:path.join(out,'chess.png')});
 await chess.close();
}finally{await browser.close();}

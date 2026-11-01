import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=await build({entryPoints:[path.join(root,'dist/game/main.js')],absWorkingDir:root,bundle:true,minify:true,format:'iife',target:['es2020'],write:false,legalComments:'inline'});
let html=await readFile(path.join(root,'dist/index.html'),'utf8');
let css=await readFile(path.join(root,'dist/style.css'),'utf8');
for(const match of [...css.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)]){
  const font=await readFile(path.join(root,'dist/fonts',match[1]));
  css=css.replace(match[0],`url('data:font/ttf;base64,${font.toString('base64')}')`);
}
html=html.replace(/\s*<link rel="preload"[^>]*>/g,'');
html=html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/,'');
html=html.replace('<link rel="stylesheet" href="./style.css">',`<style>${css}</style>`);
const code=output.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
html=html.replace('<script type="module" src="./game/main.js"></script>',`<script>${code}</script>`);
html=html.replace('href="./" class="brand"','href="#" class="brand"');
await writeFile(path.join(root,'PLAY.html'),html);
console.log(`PLAY.html created: ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB; no server or network required.`);

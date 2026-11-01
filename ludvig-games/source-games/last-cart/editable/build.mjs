import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('..', { recursive: true });
await build({entryPoints:['src/main.js'],bundle:true,format:'iife',target:['es2020'],outfile:'../game.js',minify:true,sourcemap:false,legalComments:'eof'});
await Promise.all(['index.html','style.css','icon.svg'].map(file => copyFile(`src/${file}`,`../${file}`)));
console.log('LAST CART built. Open ../index.html to play.');

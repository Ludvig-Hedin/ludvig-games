import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(root,'dist/js/main.js')],outfile:path.join(root,'dist/game.bundle.js'),bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'inline',define:{'import.meta.url':'document.baseURI'}});
let html=await readFile(path.join(root,'dist/index.html'),'utf8');
html=html.replace('<script type="module" src="js/main.js"></script>','<script src="game.bundle.js"></script>');
const css=await readFile(path.join(root,'dist/styles.css'),'utf8');
const peer=await readFile(path.join(root,'dist/vendor/peerjs.min.js'),'utf8');
const game=await readFile(path.join(root,'dist/game.bundle.js'),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,10);
html=html.replace(/href="styles\.css(?:\?v=[^"]*)?"/,'href="styles.css?v='+hash(css)+'"')
  .replace(/src="game\.bundle\.js(?:\?v=[^"]*)?"/,'src="game.bundle.js?v='+hash(game)+'"');
await writeFile(path.join(root,'dist/index.html'),html);
const escapeScript=value=>value.replace(/<\/script/gi,'<\\/script');
const standalone=html.replace(/<link rel="stylesheet" href="styles\.css[^\"]*">/,()=>'<style>'+css+'</style>')
  .replace('<script src="vendor/peerjs.min.js"></script>',()=>'<script>'+escapeScript(peer)+'</script>')
  .replace(/<script src="game\.bundle\.js[^\"]*"><\/script>/,()=>'<script>'+escapeScript(game)+'</script>');
await writeFile(path.join(root,'BREACH.html'),standalone);
console.log('Built dist/game.bundle.js and self-contained BREACH.html.');

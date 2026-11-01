import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root=fileURLToPath(new URL('.',import.meta.url));
const temp=await mkdtemp(path.join(tmpdir(),'yeet-build-'));
try{
  const bundle=path.join(temp,'game.js');
  execFileSync(process.argv[2]||'esbuild',[path.join(root,'dist/main.js'),'--bundle','--format=iife','--minify','--legal-comments=inline','--outfile='+bundle],{stdio:'inherit'});
  const [source,css,js]=await Promise.all(['dist/index.html','dist/style.css',bundle].map(p=>readFile(path.isAbsolute(p)?p:path.join(root,p),'utf8')));
  const result=source.replace('<link rel="stylesheet" href="./style.css">',()=>'<style>'+css+'</style>')
    .replace('<script type="module" src="./main.js"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>')
    .replace('href="./" aria-label="YEET CLUB, startsida"','href="" aria-label="YEET CLUB, startsida"');
  await writeFile(path.join(root,'SPELA.html'),result);
  console.log('SPELA.html is ready. No network connection or local server needed to play.');
}finally{await rm(temp,{recursive:true,force:true});}

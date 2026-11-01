import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(path.join(root,'dist/vendor'),{recursive:true});
for(const name of ['three.module.js','three.core.js']) await copyFile(path.join(root,'node_modules/three/build',name),path.join(root,'dist/vendor',name));
await copyFile(path.join(root,'node_modules/three/LICENSE'),path.join(root,'dist/vendor/THREE-LICENSE.txt'));
console.log('Three.js vendored. Static game is ready in dist/.');

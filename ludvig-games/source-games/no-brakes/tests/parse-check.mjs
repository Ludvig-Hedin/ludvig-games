// Parse-checks every inline <script> in index.html with node:vm (classic scripts and modules).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './harness.mjs';
const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
let n = 0;
for (const s of scripts(fs.readFileSync(file, 'utf8'))) {
  if (/type=["']?module/.test(s.attrs)) new vm.SourceTextModule(s.code); else new vm.Script(s.code);
  n++;
}
console.log('parse ok:', n, 'inline scripts');

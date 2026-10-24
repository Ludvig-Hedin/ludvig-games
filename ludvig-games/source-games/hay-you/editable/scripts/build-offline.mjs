import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Rebuild the double-clickable, entirely offline edition. Requires esbuild on PATH,
// or set ESBUILD_BINARY_PATH to its executable. No dependencies are downloaded.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'release', 'PLAY.html'));
await mkdir(path.dirname(output), { recursive: true });
const bundle = spawnSync(process.env.ESBUILD_BINARY_PATH || 'esbuild', [
  path.join(root, 'dist/app.js'), '--bundle', '--format=iife', '--minify',
  '--target=es2020', '--charset=utf8', '--legal-comments=inline', '--log-level=warning',
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (bundle.error || bundle.status !== 0) throw new Error(bundle.error?.message || bundle.stderr);

let css = await readFile(path.join(root, 'dist/style.css'), 'utf8');
const fonts = await readFile(path.join(root, 'dist/fonts.css'), 'utf8');
css = css.replace(/@import\s+url\(['"]\.\/fonts\.css['"]\);?/, () => fonts);
let js = bundle.stdout;
let html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const mime = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
async function embed(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { await embed(full); continue; }
    const type = mime[path.extname(entry.name)];
    if (!type) continue;
    const reference = './' + path.relative(path.join(root, 'dist'), full).split(path.sep).join('/');
    const uri = 'data:' + type + ';base64,' + (await readFile(full)).toString('base64');
    css = css.split(reference).join(uri);
    js = js.split(reference).join(uri);
    html = html.split(reference).join(uri);
  }
}
await embed(path.join(root, 'dist/assets'));
if (/@import/.test(css)) throw new Error('Offline CSS still has an import.');
if (/\.\/assets\//.test(css + js + html)) throw new Error('An asset was not embedded.');
html = html.replace(/<link rel="stylesheet" href="\.\/style\.css">/, () => '<style>' + css + '</style>')
  .replace(/<script type="module" src="\.\/app\.js"><\/script>/, () => '<script>' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
if (html.includes('type="module"') || html.includes('href="./style.css"')) throw new Error('Offline entrypoint was not replaced.');
await writeFile(output, html);
console.log(`Offline edition built: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB)`);

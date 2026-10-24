import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Use Node's type eraser so security/rules tests need neither a web server nor
// installed frontend dependencies. Node >=22.13 is already required by the app.
const root = new URL('../', import.meta.url);
const directory = new URL('outputs/backend-tests/', root);
await mkdir(directory, { recursive: true });
for (const [source, target] of [
  ['lib/game.ts', 'game.mjs'],
  ['lib/rooms.ts', 'rooms.mjs'],
  ['tests/rooms.test.ts', 'rooms.test.mjs'],
]) {
  const code = stripTypeScriptTypes(await readFile(new URL(source, root), 'utf8'))
    .replaceAll('"./game"', '"./game.mjs"')
    .replaceAll('"../lib/rooms"', '"./rooms.mjs"')
    .replaceAll('"../lib/game"', '"./game.mjs"');
  await writeFile(new URL(target, directory), code);
}
await import(new URL('rooms.test.mjs', directory));

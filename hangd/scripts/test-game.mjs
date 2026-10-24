import ts from "typescript";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, ".test-build");
mkdirSync(out, { recursive: true });
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  outDir: out,
  rootDir: root,
  types: ["node"],
  noEmitOnError: true,
};
const program = ts.createProgram(
  [path.join(root, "tests/engine.test.ts")],
  options,
);
const emitted = program.emit();
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .concat(emitted.diagnostics);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
writeFileSync(path.join(out, "package.json"), '{"type":"commonjs"}\n');
const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-isolation=none", path.join(out, "tests/engine.test.js")],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);

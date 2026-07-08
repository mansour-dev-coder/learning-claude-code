// Build script: compiles src/app.jsx (JSX) into app.js (plain JS).
// Usage: node build.mjs
// Requires the `typescript` package to be resolvable (globally or locally).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

let ts;
try { ts = req("typescript"); }
catch {
  try { ts = req("/opt/node22/lib/node_modules/typescript"); }
  catch { console.error("typescript not found — npm i -g typescript"); process.exit(1); }
}

const src = fs.readFileSync(path.join(here, "src/app.jsx"), "utf8");
const out = ts.transpileModule(src, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.ESNext
  },
  reportDiagnostics: true
});

const errors = (out.diagnostics || []).filter(d => d.category === 1 && d.code !== 5110 /* module deprecation notice */);
if (errors.length) {
  for (const d of errors) {
    const line = d.start != null ? src.slice(0, d.start).split("\n").length : "?";
    console.error(`line ${line}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
  }
  process.exit(1);
}

fs.writeFileSync(path.join(here, "app.js"), out.outputText);
console.log(`built app.js (${out.outputText.length} bytes) from src/app.jsx (${src.length} bytes)`);

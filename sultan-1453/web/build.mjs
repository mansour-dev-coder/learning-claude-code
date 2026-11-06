// Builds dist/sultan-1453.html: the engine and browser UI bundled into one self-contained page.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const res = await build({ entryPoints: ['web/main.ts'], bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, loader: { '.md': 'text' }, legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('web/template.html', 'utf8').replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/sultan-1453.html', html);
console.log(`dist/sultan-1453.html ${(html.length / 1024).toFixed(0)} KB`);

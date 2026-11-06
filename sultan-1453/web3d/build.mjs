// Builds dist/sultan-1453-3d.html: the 3D client, Three.js and the engine in one self-contained page.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const res = await build({ entryPoints: ['web3d/artifact.ts'], bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, loader: { '.md': 'text' }, legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('web3d/template.html', 'utf8').replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/sultan-1453-3d.html', html);
console.log(`dist/sultan-1453-3d.html ${(html.length / 1024).toFixed(0)} KB`);

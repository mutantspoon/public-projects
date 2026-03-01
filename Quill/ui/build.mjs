/**
 * Build script: bundles JS and copies static assets to ../dist/
 */
import { mkdirSync, copyFileSync, cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

mkdirSync(join(dist, 'js'), { recursive: true });
mkdirSync(join(dist, 'css'), { recursive: true });

await build({
    entryPoints: [join(here, 'js', 'app.js')],
    bundle: true,
    outfile: join(dist, 'js', 'bundle.js'),
    format: 'iife',
    target: 'es2020',
    logLevel: 'info',
});

copyFileSync(join(here, 'index.html'), join(dist, 'index.html'));
cpSync(join(here, 'css'), join(dist, 'css'), { recursive: true, force: true });

console.log(`Built → dist/`);

/**
 * Asset build script — run with --js or --css flag.
 *
 *   node build.mjs --js    minifies client.js (content-hashed) and sw.js (fixed URL)
 *   node build.mjs --css   minifies and bundles all app CSS (content-hashed)
 *
 * Outputs land in public/dist/.
 * Each run writes its own manifest (manifest-js.json / manifest-css.json) which
 * the server reads at startup to resolve the hashed filenames.
 */

import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir    = join(__dirname, 'public/dist');
const args      = process.argv.slice(2);

mkdirSync(outdir, { recursive: true });

if (args.includes('--js')) {
  // client.js — content-hashed so Fastly can cache it immutably.
  // A new deployment produces a new hash → new URL → automatic CDN cache bust.
  const result = await build({
    entryPoints: { client: join(__dirname, 'public/client.js') },
    bundle: false,
    minify: true,
    entryNames: '[name].[hash]',
    outdir,
    metafile: true,
    absWorkingDir: __dirname,
  });

  writeFileSync(join(outdir, 'manifest-js.json'), JSON.stringify(result.metafile));

  // sw.js — minified but NOT content-hashed (browser fetches it at the fixed /sw.js URL).
  await build({
    entryPoints: [join(__dirname, 'public/sw.js')],
    bundle: false,
    minify: true,
    outfile: join(outdir, 'sw.js'),
  });

  console.log('JS build complete →', Object.keys(result.metafile.outputs).join(', '), '+ sw.js');
}

if (args.includes('--css')) {
  // styles.css imports layout.css + transitions.css — esbuild bundles the @imports.
  // Content-hashed for immutable Fastly caching; new content → new URL → auto cache bust.
  const result = await build({
    entryPoints: { styles: join(__dirname, 'templates/css/styles.css') },
    bundle: true,
    minify: true,
    entryNames: '[name].[hash]',
    outdir,
    metafile: true,
    absWorkingDir: __dirname,
  });

  writeFileSync(join(outdir, 'manifest-css.json'), JSON.stringify(result.metafile));

  console.log('CSS build complete →', Object.keys(result.metafile.outputs).join(', '));
}

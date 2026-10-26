import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes images/index.html: all generated images grouped by category, each labelled with its
 * visual key so bad images can be copied straight into --regenerate.
 * @param {string} outDir
 * @param {Object} manifest
 */
export function writeContactSheet(outDir, manifest) {
  const byCategory = {};
  for (const [key, img] of Object.entries(manifest.images)) {
    (byCategory[img.attributes.category] ??= []).push([key, img]);
  }
  const usage = {};
  for (const keys of Object.values(manifest.listings)) for (const k of keys) usage[k] = (usage[k] ?? 0) + 1;

  const sections = Object.keys(byCategory).sort().map(category => {
    const cards = byCategory[category]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, img]) => `
      <figure>
        <img src="${esc(img.file)}" alt="${esc(img.alt)}" loading="lazy" width="${img.width ?? ''}" height="${img.height ?? ''}">
        <figcaption>
          <strong>${esc(img.alt)}</strong>
          <code title="Visual key – use with --regenerate">${esc(key)}</code>
          <span>${usage[key] ?? 0} ads · seed ${img.seed}${img.prompt_variant ? ` · <mark>${esc(img.prompt_variant)}</mark>` : ''}</span>
        </figcaption>
      </figure>`).join('');
    return `<section><h2>${esc(category)} (${byCategory[category].length})</h2><div class="grid">${cards}</div></section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(manifest.service)} – generated images</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; color: #222; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  figure { margin: 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fafafa; }
  img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #eee; }
  figcaption { padding: 8px; display: grid; gap: 4px; }
  code { font-size: 11px; word-break: break-all; user-select: all; background: #eee; padding: 2px 4px; border-radius: 4px; }
  span { color: #666; font-size: 12px; }
</style>
</head>
<body>
<h1>${esc(manifest.service)} – ${Object.keys(manifest.images).length} generated images</h1>
<p>Model: ${esc(manifest.generator?.model ?? 'n/a')} · granularity ${esc(manifest.generator?.granularity ?? 'n/a')} · ${Object.keys(manifest.listings).length} ads mapped.
Click a key to select it, then regenerate with <code>--regenerate "&lt;key&gt;"</code>.</p>
${sections}
</body>
</html>
`;
  writeFileSync(join(outDir, 'index.html'), html);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

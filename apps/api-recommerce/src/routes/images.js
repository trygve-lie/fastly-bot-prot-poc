import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Serves item images at GET /images/:file. Only files referenced by the item_images table are
 * served. File names are content hashes, so responses are cached as immutable.
 * @param {Object} state - Application state from buildDemoState (uses state.images, state.imagesDir).
 * @returns {Hono}
 */
export function createImageRouter(state) {
  const app = new Hono();
  const contentTypes = new Map();
  for (const images of state.images.values()) {
    for (const image of images) contentTypes.set(image.file, image.content_type);
  }

  app.get('/images/:file', async c => {
    const file = c.req.param('file');
    const contentType = contentTypes.get(file);
    if (!contentType) return c.json({ error: 'Not found' }, 404);
    let bytes;
    try {
      bytes = await readFile(join(state.imagesDir, 'files', file));
    } catch {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.body(bytes, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  return app;
}

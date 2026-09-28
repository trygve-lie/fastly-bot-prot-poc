import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use(compress());

app.get('/', (c) => c.json({ service: 'api-mobility', status: 'ok' }));

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`api-mobility running at http://localhost:${port}`);
});

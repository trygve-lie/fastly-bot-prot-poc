import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use(compress());

app.get('/listings', (c) => c.json([
  { id: '1', title: '3-bedroom apartment', location: 'Oslo, Grünerløkka',  price: '4 200 000 kr', meta: '85 m² · 3 bed · 2 bath'    },
  { id: '2', title: 'Terraced house',      location: 'Bergen, Sandviken',  price: '5 800 000 kr', meta: '120 m² · 4 bed · 2 bath'   },
  { id: '3', title: 'Studio flat',         location: 'Trondheim, Midtbyen', price: '1 900 000 kr', meta: '32 m² · Studio · 1 bath'  },
]));

const port = process.env.PORT ? Number(process.env.PORT) : 3002;

serve({ fetch: app.fetch, port }, () => {
  console.log(`api-realestate running at http://localhost:${port}`);
});

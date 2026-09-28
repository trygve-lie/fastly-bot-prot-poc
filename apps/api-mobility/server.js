import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use(compress());

app.get('/listings', (c) => c.json([
  { id: '4', title: 'Tesla Model 3',     location: 'Oslo',      price: '389 000 kr', meta: '2022 · 45 000 km · Electric' },
  { id: '5', title: 'Volkswagen Golf',   location: 'Bergen',    price: '249 000 kr', meta: '2020 · 62 000 km · Diesel'   },
  { id: '6', title: 'BMW X3 xDrive20d', location: 'Stavanger', price: '499 000 kr', meta: '2021 · 38 000 km · Diesel'   },
]));

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`api-mobility running at http://localhost:${port}`);
});

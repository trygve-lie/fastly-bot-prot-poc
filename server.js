import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { html } from 'hono/html';
import {
  pageLayout, subPageLayout,
  homePage, verticalPage, searchPage, itemPage,
  accountPage, messagingPage,
} from './templates/index.js';

const app = new Hono();

app.use(compress());

app.use('/public/*', async (c, next) => {
  await next();
  // Only WA assets are truly immutable (version is in the path).
  // client.js changes with every deployment so must not be cached immutably.
  if (c.req.path.startsWith('/public/awesome/')) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    c.header('Cache-Control', 'no-cache');
  }
});
app.use('/public/*', serveStatic({ root: './' }));

// PWA assets served from root scope so the service worker controls the whole origin
app.get('/manifest.json', serveStatic({ path: './public/manifest.json' }));
app.get('/sw.js',         serveStatic({ path: './public/sw.js' }));
app.get('/icons/:file',   serveStatic({ root: './public' }));

// ---------------------------------------------------------------------------
// Dummy data
// ---------------------------------------------------------------------------

const VERTICALS = {
  realestate: {
    name: 'Real Estate', icon: 'house', slug: 'realestate',
    description: 'Find apartments, houses and properties for sale and rent.',
    listings: [
      {
        id: '1', title: '3-bedroom apartment', location: 'Oslo, Grünerløkka',
        price: '4 200 000 kr', meta: '85 m² · 3 bed · 2 bath',
        tags: ['Apartment', 'For sale'],
        description: 'Bright, well-maintained apartment on the 3rd floor with a south-facing balcony, modern kitchen, and newly renovated bathrooms.',
        seller: 'Kari Nordmann', memberSince: '2019',
      },
      {
        id: '2', title: 'Terraced house', location: 'Bergen, Sandviken',
        price: '5 800 000 kr', meta: '120 m² · 4 bed · 2 bath',
        tags: ['House', 'For sale'],
        description: 'Spacious terraced house with a private garden, double garage, and panoramic views of the fjord.',
        seller: 'Ole Berge', memberSince: '2021',
      },
      {
        id: '3', title: 'Studio flat', location: 'Trondheim, Midtbyen',
        price: '1 900 000 kr', meta: '32 m² · Studio · 1 bath',
        tags: ['Apartment', 'For sale'],
        description: 'Compact, well-designed studio in the city centre, ideal for students or first-time buyers. Recently renovated throughout.',
        seller: 'Sigrid Holm', memberSince: '2022',
      },
    ],
  },
  mobility: {
    name: 'Mobility', icon: 'car', slug: 'mobility',
    description: 'Find new and used cars, vans and motorbikes.',
    listings: [
      {
        id: '4', title: 'Tesla Model 3', location: 'Oslo',
        price: '389 000 kr', meta: '2022 · 45 000 km · Electric',
        tags: ['Electric', 'Sedan'],
        description: 'Long Range AWD in Pearl White. One owner, full service history, autopilot, premium interior. Includes winter wheels.',
        seller: 'Magnus Lie', memberSince: '2020',
      },
      {
        id: '5', title: 'Volkswagen Golf', location: 'Bergen',
        price: '249 000 kr', meta: '2020 · 62 000 km · Diesel',
        tags: ['Diesel', 'Hatchback'],
        description: 'Golf 8 Comfortline in Urano Grey. Well maintained with full VW service history. Heated seats and DSG automatic.',
        seller: 'Ingrid Bakke', memberSince: '2018',
      },
      {
        id: '6', title: 'BMW X3 xDrive20d', location: 'Stavanger',
        price: '499 000 kr', meta: '2021 · 38 000 km · Diesel',
        tags: ['Diesel', 'SUV'],
        description: 'xLine package, panoramic roof, HUD, laser lights and 360 camera. Excellent condition with full BMW service history.',
        seller: 'Per Stavanger', memberSince: '2017',
      },
    ],
  },
  job: {
    name: 'Jobs', icon: 'briefcase', slug: 'job',
    description: 'Find your next job across thousands of listings.',
    listings: [
      {
        id: '7', title: 'Senior Frontend Developer', location: 'Oslo · Remote',
        price: '950 000 kr / yr', meta: 'Full-time · Tech',
        tags: ['Remote', 'Tech'],
        description: 'Join our product team building the next generation of our marketplace platform. You will work with React, TypeScript and GraphQL.',
        seller: 'Finn AS', memberSince: '2005',
      },
      {
        id: '8', title: 'Product Designer', location: 'Bergen',
        price: '780 000 kr / yr', meta: 'Full-time · Design',
        tags: ['Design', 'On-site'],
        description: 'Shape user experiences across our mobile and web products. You will collaborate closely with engineers and researchers.',
        seller: 'DNB', memberSince: '2010',
      },
      {
        id: '9', title: 'Backend Engineer', location: 'Trondheim · Hybrid',
        price: '880 000 kr / yr', meta: 'Full-time · Tech',
        tags: ['Hybrid', 'Tech'],
        description: 'Build scalable APIs and data pipelines in Go and Kotlin. You will own services end-to-end from design to production.',
        seller: 'Telenor', memberSince: '2003',
      },
    ],
  },
  recommerce: {
    name: 'Recommerce', icon: 'recycle', slug: 'recommerce',
    description: 'Buy and sell second-hand electronics, furniture, sport and more.',
    listings: [
      {
        id: '10', title: 'iPhone 14 Pro 256 GB', location: 'Oslo',
        price: '7 500 kr', meta: 'Like new · Electronics',
        tags: ['Like new', 'Electronics'],
        description: 'Deep Purple, bought in January 2023. Comes with original box, two cases and a MagSafe charger. Battery health 97%.',
        seller: 'Anna Dahl', memberSince: '2021',
      },
      {
        id: '11', title: 'IKEA Kallax 4×4', location: 'Bergen',
        price: '450 kr', meta: 'Good condition · Furniture',
        tags: ['Good condition', 'Furniture'],
        description: 'White Kallax shelf unit, 147×147 cm. Small scratch on the base, otherwise in good shape. Buyer must collect.',
        seller: 'Tor Nilsen', memberSince: '2023',
      },
      {
        id: '12', title: 'Trek Marlin 7 (2021)', location: 'Stavanger',
        price: '3 200 kr', meta: 'Good condition · Sport',
        tags: ['Good condition', 'Sport'],
        description: 'Size L mountain bike. New brake pads and fresh tyres fitted this spring. Comes with bottle cage and rear rack.',
        seller: 'Hilde Moe', memberSince: '2020',
      },
    ],
  },
};

const ALL_LISTINGS = Object.values(VERTICALS).reduce((acc, v) => {
  v.listings.forEach(l => { acc[l.id] = { listing: l, vertical: v }; });
  return acc;
}, {});

// ---------------------------------------------------------------------------
// Nav drawer content (shared across home + any pageLayout usage)
// ---------------------------------------------------------------------------

const navLinks = html`
  <a href="/realestate">Real Estate</a>
  <a href="/mobility">Mobility</a>
  <a href="/job">Jobs</a>
  <a href="/recommerce">Recommerce</a>
  <wa-divider></wa-divider>
  <a href="/account">Account</a>
  <a href="/messaging">Messages</a>`;

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

// Resolve the public-facing origin regardless of whether the request arrived
// directly or via a CDN. Priority:
//   1. ORIGIN env var — explicit override, set this in production (e.g. https://typegear.app)
//   2. X-Forwarded-Proto + X-Forwarded-Host — set by Fastly and most CDNs
//   3. Host header + request protocol — fallback for local dev
function publicOrigin(c) {
  if (process.env.ORIGIN) return process.env.ORIGIN.replace(/\/$/, '');
  const proto = c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '');
  const host  = c.req.header('x-forwarded-host')  || c.req.header('host') || new URL(c.req.url).host;
  return `${proto}://${host}`;
}

app.get('/robots.txt', (c) => {
  const origin = publicOrigin(c);
  c.header('Content-Type', 'text/plain');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.text(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (c) => {
  const origin = new URL(c.req.url).origin;
  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: '/',       priority: '1.0', changefreq: 'daily' },
  ];

  for (const [key, vertical] of Object.entries(VERTICALS)) {
    urls.push({ loc: `/${key}`,        priority: '0.9', changefreq: 'daily' });
    urls.push({ loc: `/${key}/search`, priority: '0.8', changefreq: 'daily' });
    for (const listing of vertical.listings) {
      urls.push({ loc: `/${key}/item/${listing.id}`, priority: '0.7', changefreq: 'weekly' });
    }
  }

  const entries = urls.map(u => `  <url>
    <loc>${origin}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(xml);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/', (c) => c.html(pageLayout('Marketplace', homePage, navLinks, {
  description: 'Browse real estate, cars, jobs and second-hand goods on our marketplace.',
})));

// Vertical homes
for (const [key, vertical] of Object.entries(VERTICALS)) {
  app.get(`/${key}`, (c) => c.html(subPageLayout(vertical.name, verticalPage(vertical), '/', {
    description: vertical.description,
  })));
  app.get(`/${key}/search`, (c) => {
    const query = c.req.query('q') || '';
    return c.html(subPageLayout(`Search ${vertical.name}`, searchPage(vertical, query), `/${key}`, {
      description: `Search ${vertical.name.toLowerCase()} listings${query ? ` for "${query}"` : ''}.`,
    }));
  });
  app.get(`/${key}/item/:id`, (c) => {
    const entry = ALL_LISTINGS[c.req.param('id')];
    if (!entry || entry.vertical.slug !== key) return c.notFound();
    return c.html(subPageLayout(entry.listing.title, itemPage(entry.vertical, entry.listing), `/${key}/search`, {
      description: entry.listing.description,
    }));
  });
}

// User sections
app.get('/account',   (c) => c.html(subPageLayout('Account',  accountPage,   '/', {
  description: 'Manage your account, listings and saved searches.',
})));
app.get('/messaging', (c) => c.html(subPageLayout('Messages', messagingPage, '/', {
  description: 'Your messages and conversations with sellers and buyers.',
})));

// ---------------------------------------------------------------------------

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});

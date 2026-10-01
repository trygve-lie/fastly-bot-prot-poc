import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { html } from 'hono/html';
import {
  pageLayout, subPageLayout,
  homePage, verticalPage, searchPage, itemPage,
  accountPage, messagingPage,
  intentVerticalPage, apiSearchPage,
  realestateItemPage,
  mobilityItemPage,
} from './templates/index.js';


const apiMobilityBase   = process.env.API_MOBILITY_URL   ? `http://${process.env.API_MOBILITY_URL}`   : 'http://localhost:3001';
const apiRealestateBase = process.env.API_REALESTATE_URL ? `http://${process.env.API_REALESTATE_URL}` : 'http://localhost:3002';

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
app.use('/sw.js', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache'); });
app.get('/sw.js',         serveStatic({ path: './public/sw.js' }));
app.get('/icons/:file',   serveStatic({ root: './public' }));

// ---------------------------------------------------------------------------
// Dummy data
// ---------------------------------------------------------------------------

const VERTICALS = {
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

// Sitemap index — delegates to one sitemap per category.
// Google allows up to 50 000 URLs per sitemap file; each child sitemap stays well under that.
app.get('/sitemap.xml', (c) => {
  const origin = publicOrigin(c);
  const today  = new Date().toISOString().slice(0, 10);

  const sitemaps = [
    `${origin}/sitemap-static.xml`,
    `${origin}/sitemap-realestate.xml`,
    `${origin}/sitemap-mobility.xml`,
  ];

  const entries = sitemaps.map(loc => `  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n');

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Surrogate-Control', 'max-age=86400, stale-while-revalidate=3600');
  c.header('Surrogate-Key', 'sitemap');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`);
});

// Static pages — everything not driven by the API services.
app.get('/sitemap-static.xml', (c) => {
  const origin = publicOrigin(c);
  const today  = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: '/',              priority: '1.0', changefreq: 'daily'  },
    { loc: '/realestate',    priority: '0.9', changefreq: 'hourly' },
    { loc: '/realestate/search', priority: '0.8', changefreq: 'daily' },
    { loc: '/mobility',      priority: '0.9', changefreq: 'hourly' },
    { loc: '/mobility/search',   priority: '0.8', changefreq: 'daily' },
    { loc: '/job',           priority: '0.9', changefreq: 'daily'  },
    { loc: '/job/search',    priority: '0.8', changefreq: 'daily'  },
    { loc: '/recommerce',    priority: '0.9', changefreq: 'daily'  },
    { loc: '/recommerce/search', priority: '0.8', changefreq: 'daily' },
    ...Object.values(VERTICALS).flatMap(v =>
      v.listings.map(l => ({ loc: `/${v.slug}/item/${l.id}`, priority: '0.7', changefreq: 'weekly' }))
    ),
  ];

  const entries = urls.map(u => `  <url>
    <loc>${origin}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Surrogate-Control', 'max-age=86400, stale-while-revalidate=3600');
  c.header('Surrogate-Key', 'sitemap');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`);
});

// Real estate item pages — all listing IDs fetched from api-realestate.
app.get('/sitemap-realestate.xml', async (c) => {
  const origin = publicOrigin(c);
  const today  = new Date().toISOString().slice(0, 10);

  let ids = [];
  try {
    const data = await fetch(`${apiRealestateBase}/api/sitemap`).then(r => r.json());
    ids = data.listing_ids ?? [];
  } catch (_) {}

  const entries = ids.map(id => `  <url>
    <loc>${origin}/realestate/item/${id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Surrogate-Control', 'max-age=86400, stale-while-revalidate=3600');
  c.header('Surrogate-Key', 'sitemap realestate');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`);
});

// Mobility item pages — all vehicle IDs fetched from api-mobility.
app.get('/sitemap-mobility.xml', async (c) => {
  const origin = publicOrigin(c);
  const today  = new Date().toISOString().slice(0, 10);

  let ids = [];
  try {
    const data = await fetch(`${apiMobilityBase}/api/sitemap`).then(r => r.json());
    ids = data.listing_ids ?? [];
  } catch (_) {}

  const entries = ids.map(id => `  <url>
    <loc>${origin}/mobility/item/${id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  c.header('Content-Type', 'application/xml');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Surrogate-Control', 'max-age=86400, stale-while-revalidate=3600');
  c.header('Surrogate-Key', 'sitemap mobility');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/services', async (c) => {
  c.header('Cache-Control', 'no-store');
  const [mobility, realestate] = await Promise.all([
    fetch(`${apiMobilityBase}/api/search`).then(r => r.json()),
    fetch(`${apiRealestateBase}/api/search`).then(r => r.json()),
  ]);
  return c.json({ mobility, realestate });
});

app.get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=30');
  c.header('Surrogate-Control', 'max-age=60, stale-while-revalidate=10');
  const useRealestate = Math.random() < 0.5;
  const apiBase  = useRealestate ? apiRealestateBase : apiMobilityBase;
  const slug     = useRealestate ? 'realestate' : 'mobility';
  const typeKey  = useRealestate ? 'property_type' : 'vehicle_type';
  let intent = '', items = [];
  try {
    const data = await fetch(`${apiBase}/api/intent?limit=10`).then(r => r.json());
    intent = data.intent ?? '';
    items  = data.hits  ?? [];
  } catch (_) {}
  return c.html(pageLayout('Marketplace', homePage({ intentLabel: intent, items, slug, typeKey }), navLinks, {
    description: 'Browse real estate, cars, jobs and second-hand goods on our marketplace.',
  }));
});

// Vertical homes
app.get('/realestate', async (c) => {
  c.header('Cache-Control', 'public, max-age=30');
  c.header('Surrogate-Control', 'max-age=60, stale-while-revalidate=10');
  c.header('Surrogate-Key', 'realestate');
  let intent = '', items = [];
  try {
    const data = await fetch(`${apiRealestateBase}/api/intent?limit=10`).then(r => r.json());
    intent = data.intent ?? '';
    items = data.hits ?? [];
  } catch (_) {}
  return c.html(subPageLayout('Real Estate', intentVerticalPage({
    icon: 'house', name: 'Real Estate', slug: 'realestate',
    intentLabel: intent, items, typeKey: 'property_type',
  }), '/', { description: 'Find apartments, houses and properties for sale and rent.' }));
});

app.get('/mobility', async (c) => {
  c.header('Cache-Control', 'public, max-age=30');
  c.header('Surrogate-Control', 'max-age=60, stale-while-revalidate=10');
  c.header('Surrogate-Key', 'mobility');
  let intent = '', items = [];
  try {
    const data = await fetch(`${apiMobilityBase}/api/intent?limit=10`).then(r => r.json());
    intent = data.intent ?? '';
    items = data.hits ?? [];
  } catch (_) {}
  return c.html(subPageLayout('Mobility', intentVerticalPage({
    icon: 'car', name: 'Mobility', slug: 'mobility',
    intentLabel: intent, items, typeKey: 'vehicle_type',
  }), '/', { description: 'Find new and used cars, vans and motorbikes.' }));
});

// realestate — home is API-driven; search and item fetch from api-realestate
app.get('/realestate/search', async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  c.header('Surrogate-Control', 'max-age=300, stale-while-revalidate=30');
  c.header('Surrogate-Key', 'realestate realestate-search');
  const query = c.req.query('q') || '';
  let hits = [];
  try {
    const data = await fetch(`${apiRealestateBase}/api/search?q=${encodeURIComponent(query)}`).then(r => r.json());
    hits = data.hits ?? [];
  } catch (_) {}
  return c.html(subPageLayout('Search Real Estate', apiSearchPage({
    name: 'Real Estate', slug: 'realestate', query, hits, typeKey: 'property_type',
  }), '/realestate', { description: `Search real estate listings${query ? ` for "${query}"` : ''}.` }));
});
app.get('/realestate/item/:id', async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  c.header('Surrogate-Control', 'max-age=600, stale-while-revalidate=60');
  c.header('Surrogate-Key', `realestate realestate-item-${c.req.param('id')}`);
  const id = c.req.param('id');
  let listing = null, similar = [];
  try {
    const [itemRes, simRes] = await Promise.all([
      fetch(`${apiRealestateBase}/api/listings/${encodeURIComponent(id)}`),
      fetch(`${apiRealestateBase}/api/listings/${encodeURIComponent(id)}/similar?limit=5`),
    ]);
    if (itemRes.ok) listing = await itemRes.json();
    if (simRes.ok) similar = (await simRes.json()).hits ?? [];
  } catch (_) {}
  if (!listing) return c.notFound();
  return c.html(subPageLayout(listing.title, realestateItemPage(listing, similar), '/realestate/search', {
    description: listing.text,
  }));
});

// mobility — home is API-driven; search and item fetch from api-mobility
app.get('/mobility/search', async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  c.header('Surrogate-Control', 'max-age=300, stale-while-revalidate=30');
  c.header('Surrogate-Key', 'mobility mobility-search');
  const query = c.req.query('q') || '';
  let hits = [];
  try {
    const data = await fetch(`${apiMobilityBase}/api/search?q=${encodeURIComponent(query)}`).then(r => r.json());
    hits = data.hits ?? [];
  } catch (_) {}
  return c.html(subPageLayout('Search Mobility', apiSearchPage({
    name: 'Mobility', slug: 'mobility', query, hits, typeKey: 'vehicle_type',
  }), '/mobility', { description: `Search mobility listings${query ? ` for "${query}"` : ''}.` }));
});
app.get('/mobility/item/:id', async (c) => {
  c.header('Cache-Control', 'public, max-age=60');
  c.header('Surrogate-Control', 'max-age=600, stale-while-revalidate=60');
  c.header('Surrogate-Key', `mobility mobility-item-${c.req.param('id')}`);
  const id = c.req.param('id');
  let vehicle = null, similar = [];
  try {
    const [itemRes, simRes] = await Promise.all([
      fetch(`${apiMobilityBase}/api/vehicles/${encodeURIComponent(id)}`),
      fetch(`${apiMobilityBase}/api/vehicles/${encodeURIComponent(id)}/similar?limit=5`),
    ]);
    if (itemRes.ok) vehicle = await itemRes.json();
    if (simRes.ok) similar = (await simRes.json()).hits ?? [];
  } catch (_) {}
  if (!vehicle) return c.notFound();
  return c.html(subPageLayout(vehicle.title, mobilityItemPage(vehicle, similar), '/mobility/search', {
    description: vehicle.text,
  }));
});

// job
app.get('/job', (c) => c.html(subPageLayout(VERTICALS.job.name, verticalPage(VERTICALS.job), '/', {
  description: VERTICALS.job.description,
})));
app.get('/job/search', (c) => {
  const query = c.req.query('q') || '';
  return c.html(subPageLayout(`Search ${VERTICALS.job.name}`, searchPage(VERTICALS.job, query), '/job', {
    description: `Search job listings${query ? ` for "${query}"` : ''}.`,
  }));
});
app.get('/job/item/:id', (c) => {
  const entry = ALL_LISTINGS[c.req.param('id')];
  if (!entry || entry.vertical.slug !== 'job') return c.notFound();
  return c.html(subPageLayout(entry.listing.title, itemPage(entry.vertical, entry.listing), '/job/search', {
    description: entry.listing.description,
  }));
});

// recommerce
app.get('/recommerce', (c) => c.html(subPageLayout(VERTICALS.recommerce.name, verticalPage(VERTICALS.recommerce), '/', {
  description: VERTICALS.recommerce.description,
})));
app.get('/recommerce/search', (c) => {
  const query = c.req.query('q') || '';
  return c.html(subPageLayout(`Search ${VERTICALS.recommerce.name}`, searchPage(VERTICALS.recommerce, query), '/recommerce', {
    description: `Search recommerce listings${query ? ` for "${query}"` : ''}.`,
  }));
});
app.get('/recommerce/item/:id', (c) => {
  const entry = ALL_LISTINGS[c.req.param('id')];
  if (!entry || entry.vertical.slug !== 'recommerce') return c.notFound();
  return c.html(subPageLayout(entry.listing.title, itemPage(entry.vertical, entry.listing), '/recommerce/search', {
    description: entry.listing.description,
  }));
});

// User sections
app.get('/account', (c) => {
  c.header('Cache-Control', 'private, no-store');
  return c.html(subPageLayout('Account', accountPage, '/', {
    description: 'Manage your account, listings and saved searches.',
  }));
});
app.get('/messaging', (c) => {
  c.header('Cache-Control', 'private, no-store');
  return c.html(subPageLayout('Messages', messagingPage, '/', {
    description: 'Your messages and conversations with sellers and buyers.',
  }));
});

// ---------------------------------------------------------------------------

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});

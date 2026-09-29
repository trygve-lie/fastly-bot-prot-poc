import { html, raw } from 'hono/html';

function formatPrice(n) {
  return Number(n).toLocaleString('no-NO') + ' kr';
}

function formatType(type) {
  return String(type).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function itemCards(items, slug, typeKey) {
  return items.map(item => html`
    <a href="/${slug}/item/${item.listing_id}" class="listing-link">
      <wa-card>
        <div class="wa-split wa-align-items-start">
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-s">${item.title}</span>
            <span class="wa-body-s">${item.municipality}, ${item.county}</span>
            <div class="wa-cluster wa-gap-2xs">
              <wa-tag size="s">${formatType(item[typeKey])}</wa-tag>
            </div>
          </div>
          <div class="wa-stack wa-gap-2xs wa-align-items-end">
            <span class="wa-heading-s">${formatPrice(item.total_price)}</span>
          </div>
        </div>
      </wa-card>
    </a>`);
}

export function intentVerticalPage({ icon, name, slug, intentLabel, items, typeKey }) {
  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-cluster wa-gap-s wa-align-items-center">
        <wa-icon name="${icon}" class="wa-font-size-xl"></wa-icon>
        <h1 class="wa-heading-xl">${name}</h1>
      </div>

      <form action="/${slug}/search" method="get" class="wa-flank:end wa-gap-s">
        <wa-input name="q" placeholder="Search ${name.toLowerCase()}..." clearable>
          <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
        </wa-input>
        <wa-button type="submit" variant="brand" appearance="filled">Search</wa-button>
      </form>

      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Suitable for ${intentLabel}</h2>
        <div class="wa-stack wa-gap-s">
          ${raw(itemCards(items, slug, typeKey).join(''))}
        </div>
      </section>
    </div>`;
}

export function apiSearchPage({ name, slug, query, hits, typeKey }) {
  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-s">
        <h1 class="wa-heading-xl">Search ${name}</h1>
        <form action="/${slug}/search" method="get" class="wa-flank:end wa-gap-s">
          <wa-input name="q" value="${query || ''}" placeholder="Search ${name.toLowerCase()}..." clearable>
            <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
          </wa-input>
          <wa-button type="submit" variant="brand" appearance="filled">Search</wa-button>
        </form>
      </div>

      <section class="wa-stack wa-gap-s">
        <p class="wa-body-s">${hits.length} results${query ? ` for "${query}"` : ''}</p>
        <div class="wa-stack wa-gap-s">
          ${raw(itemCards(hits, slug, typeKey).join(''))}
        </div>
      </section>
    </div>`;
}

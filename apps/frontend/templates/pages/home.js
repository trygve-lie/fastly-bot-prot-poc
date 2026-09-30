import { html, raw } from 'hono/html';

function formatPrice(n) {
  return Number(n).toLocaleString('no-NO') + ' kr';
}

function formatType(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function homePage({ intentLabel = '', items = [], slug = '', typeKey = '' } = {}) {
  const cards = items.map(item => html`
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

  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-2xs">
        <h1 class="wa-heading-xl">Marketplace</h1>
        <p class="wa-body-l">Find what you're looking for.</p>
      </div>

      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Categories</h2>
        <div class="wa-grid" style="--min-column-size: 9ch;">
          <a href="/realestate" class="category-link">
            <wa-card appearance="filled-outlined">
              <div class="wa-stack wa-gap-xs wa-align-items-center">
                <wa-icon name="house" class="wa-font-size-2xl"></wa-icon>
                <span class="wa-heading-s">Real Estate</span>
              </div>
            </wa-card>
          </a>
          <a href="/mobility" class="category-link">
            <wa-card appearance="filled-outlined">
              <div class="wa-stack wa-gap-xs wa-align-items-center">
                <wa-icon name="car" class="wa-font-size-2xl"></wa-icon>
                <span class="wa-heading-s">Mobility</span>
              </div>
            </wa-card>
          </a>
          <a href="/job" class="category-link">
            <wa-card appearance="filled-outlined">
              <div class="wa-stack wa-gap-xs wa-align-items-center">
                <wa-icon name="briefcase" class="wa-font-size-2xl"></wa-icon>
                <span class="wa-heading-s">Jobs</span>
              </div>
            </wa-card>
          </a>
          <a href="/recommerce" class="category-link">
            <wa-card appearance="filled-outlined">
              <div class="wa-stack wa-gap-xs wa-align-items-center">
                <wa-icon name="recycle" class="wa-font-size-2xl"></wa-icon>
                <span class="wa-heading-s">Recommerce</span>
              </div>
            </wa-card>
          </a>
        </div>
      </section>

      ${items.length ? html`
      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Suitable for ${intentLabel}</h2>
        <div class="wa-stack wa-gap-s">
          ${raw(cards.join(''))}
        </div>
      </section>` : ''}

      <wa-button id="install-btn" variant="brand" hidden>
        <wa-icon slot="prefix" name="download"></wa-icon>
        Install app
      </wa-button>
    </div>`;
}

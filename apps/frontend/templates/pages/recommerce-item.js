import { html, raw } from 'hono/html';

function formatPrice(n) {
  return 'NOK ' + Number(n).toLocaleString('no-NO');
}

function formatType(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatAge(years) {
  if (years === 0) return 'Less than a year';
  return years === 1 ? '1 year' : `${years} years`;
}

export function recommerceItemPage(item, similar = []) {
  const tags = (item.feature_tags ?? []).map(t => html`<wa-tag size="s">${formatType(t)}</wa-tag>`);

  const similarCards = similar.map(s => html`
    <a href="/recommerce/item/${s.listing_id}" class="listing-link">
      <wa-card>
        <div class="wa-split wa-align-items-start">
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-s">${s.title}</span>
            <span class="wa-body-s">${s.municipality}, ${s.county}</span>
            <div class="wa-cluster wa-gap-2xs">
              <wa-tag size="s">${s.subcategory_label}</wa-tag>
              <wa-tag size="s">${formatType(s.condition_label)}</wa-tag>
            </div>
          </div>
          <div class="wa-stack wa-gap-2xs wa-align-items-end">
            <span class="wa-heading-s">${formatPrice(s.total_price)}</span>
          </div>
        </div>
      </wa-card>
    </a>`);

  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-2xs">
        <h1 class="wa-heading-xl">${item.title}</h1>
        <div class="wa-cluster wa-gap-xs">
          <wa-icon name="location-dot"></wa-icon>
          <span class="wa-body-m">${item.municipality}, ${item.county}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          <wa-tag size="s">${item.category_label}</wa-tag>
          <wa-tag size="s">${formatType(item.condition_label)}</wa-tag>
          ${item.shipping_available ? html`<wa-tag size="s">Shipping</wa-tag>` : html`<wa-tag size="s">Pickup only</wa-tag>`}
        </div>
      </div>

      <wa-card>
        <div class="wa-split wa-align-items-center">
          <div class="wa-stack wa-gap-3xs">
            <span class="wa-heading-l">${formatPrice(item.asking_price)}</span>
            <span class="wa-caption-s">${item.shipping_available
              ? `Total ${formatPrice(item.total_price)} incl. shipping`
              : `Pickup in ${item.municipality}`}</span>
          </div>
          <wa-button variant="brand" appearance="filled">Contact</wa-button>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Details</h2>
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-body-m"><strong>Type:</strong> ${item.subcategory_label}</span>
            ${item.brand    ? html`<span class="wa-body-m"><strong>Brand:</strong> ${item.brand}</span>` : ''}
            <span class="wa-body-m"><strong>Condition:</strong> ${formatType(item.condition_label)}</span>
            <span class="wa-body-m"><strong>Age:</strong> ${formatAge(item.age_years)}</span>
            ${item.size     ? html`<span class="wa-body-m"><strong>Size:</strong> ${item.size}</span>` : ''}
            ${item.color    ? html`<span class="wa-body-m"><strong>Colour:</strong> ${formatType(item.color)}</span>` : ''}
            ${item.material ? html`<span class="wa-body-m"><strong>Material:</strong> ${formatType(item.material)}</span>` : ''}
            <span class="wa-body-m"><strong>Delivery:</strong> ${item.shipping_available ? `Shipping ${formatPrice(item.shipping_cost)} or pickup` : 'Pickup only'}</span>
            <span class="wa-body-m"><strong>Seller:</strong> ${item.seller_type === 'shop' ? 'Second-hand shop' : 'Private'}</span>
            ${item.days_on_market != null ? html`<span class="wa-body-m"><strong>Days on market:</strong> ${item.days_on_market}</span>` : ''}
          </div>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Description</h2>
          <p class="wa-body-m">${item.text}</p>
        </div>
      </wa-card>

      ${tags.length ? html`
      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Features</h2>
          <div class="wa-cluster wa-gap-2xs">${raw(tags.join(''))}</div>
        </div>
      </wa-card>` : ''}

      ${similarCards.length ? html`
      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Similar items</h2>
        <div class="wa-stack wa-gap-s">${raw(similarCards.join(''))}</div>
      </section>` : ''}
    </div>`;
}

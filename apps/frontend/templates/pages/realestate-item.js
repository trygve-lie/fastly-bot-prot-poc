import { html, raw } from 'hono/html';

function formatPrice(n) {
  return 'NOK ' + Number(n).toLocaleString('no-NO');
}

function formatType(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function realestateItemPage(listing, similar = []) {
  const tags = (listing.amenity_tags ?? []).map(t => `<wa-tag size="s">${formatType(t)}</wa-tag>`).join('');

  const similarCards = similar.map(item => `
    <a href="/realestate/item/${item.listing_id}" class="listing-link">
      <wa-card>
        <div class="wa-split wa-align-items-start">
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-s">${item.title}</span>
            <span class="wa-body-s">${item.municipality}, ${item.county}</span>
            <div class="wa-cluster wa-gap-2xs">
              <wa-tag size="s">${formatType(item.property_type)}</wa-tag>
            </div>
          </div>
          <div class="wa-stack wa-gap-2xs wa-align-items-end">
            <span class="wa-heading-s">${formatPrice(item.total_price)}</span>
          </div>
        </div>
      </wa-card>
    </a>`).join('');

  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-2xs">
        <h1 class="wa-heading-xl">${listing.title}</h1>
        <div class="wa-cluster wa-gap-xs">
          <wa-icon name="location-dot"></wa-icon>
          <span class="wa-body-m">${listing.municipality}, ${listing.county}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          <wa-tag size="s">${formatType(listing.property_type)}</wa-tag>
          ${listing.energy_rating ? html`<wa-tag size="s">Energy ${listing.energy_rating}</wa-tag>` : ''}
        </div>
      </div>

      <wa-card>
        <div class="wa-split wa-align-items-center">
          <div class="wa-stack wa-gap-3xs">
            <span class="wa-heading-l">${formatPrice(listing.asking_price)}</span>
            <span class="wa-caption-s">Total ${formatPrice(listing.total_price)}</span>
          </div>
          <wa-button variant="brand" appearance="filled">Contact</wa-button>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Details</h2>
          <div class="wa-stack wa-gap-2xs">
            ${listing.bedrooms != null ? html`<span class="wa-body-m"><strong>Bedrooms:</strong> ${listing.bedrooms}</span>` : ''}
            ${listing.size_m2   != null ? html`<span class="wa-body-m"><strong>Size:</strong> ${listing.size_m2} m²</span>` : ''}
            ${listing.days_on_market != null ? html`<span class="wa-body-m"><strong>Days on market:</strong> ${listing.days_on_market}</span>` : ''}
            <span class="wa-body-m"><strong>Status:</strong> ${formatType(listing.listing_status ?? '')}</span>
          </div>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Description</h2>
          <p class="wa-body-m">${listing.text}</p>
        </div>
      </wa-card>

      ${tags ? html`
      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Amenities</h2>
          <div class="wa-cluster wa-gap-2xs">${raw(tags)}</div>
        </div>
      </wa-card>` : ''}

      ${similarCards.length ? html`
      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Similar listings</h2>
        <div class="wa-stack wa-gap-s">${raw(similarCards)}</div>
      </section>` : ''}
    </div>`;
}

import { html, raw } from 'hono/html';

function formatPrice(n) {
  return 'NOK ' + Number(n).toLocaleString('no-NO');
}

function formatType(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function mobilityItemPage(vehicle, similar = []) {
  const tags = (vehicle.feature_tags ?? []).map(t => `<wa-tag size="s">${formatType(t)}</wa-tag>`).join('');

  const similarCards = similar.map(item => `
    <a href="/mobility/item/${item.listing_id}" class="listing-link">
      <wa-card>
        <div class="wa-split wa-align-items-start">
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-s">${item.title}</span>
            <span class="wa-body-s">${item.municipality}, ${item.county}</span>
            <div class="wa-cluster wa-gap-2xs">
              <wa-tag size="s">${formatType(item.vehicle_type)}</wa-tag>
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
        <h1 class="wa-heading-xl">${vehicle.title}</h1>
        <div class="wa-cluster wa-gap-xs">
          <wa-icon name="location-dot"></wa-icon>
          <span class="wa-body-m">${vehicle.municipality}, ${vehicle.county}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          <wa-tag size="s">${formatType(vehicle.vehicle_type)}</wa-tag>
          <wa-tag size="s">${formatType(vehicle.fuel_type)}</wa-tag>
        </div>
      </div>

      <wa-card>
        <div class="wa-split wa-align-items-center">
          <div class="wa-stack wa-gap-3xs">
            <span class="wa-heading-l">${formatPrice(vehicle.asking_price)}</span>
            <span class="wa-caption-s">Total ${formatPrice(vehicle.total_price)}</span>
          </div>
          <wa-button variant="brand" appearance="filled">Contact</wa-button>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Details</h2>
          <div class="wa-stack wa-gap-2xs">
            ${vehicle.make      ? html`<span class="wa-body-m"><strong>Make:</strong> ${vehicle.make}</span>` : ''}
            ${vehicle.model     ? html`<span class="wa-body-m"><strong>Model:</strong> ${vehicle.model}</span>` : ''}
            ${vehicle.mileage_km != null ? html`<span class="wa-body-m"><strong>Mileage:</strong> ${Number(vehicle.mileage_km).toLocaleString('no-NO')} km</span>` : ''}
            ${vehicle.seats     != null ? html`<span class="wa-body-m"><strong>Seats:</strong> ${vehicle.seats}</span>` : ''}
            ${vehicle.days_on_market != null ? html`<span class="wa-body-m"><strong>Days on market:</strong> ${vehicle.days_on_market}</span>` : ''}
            <span class="wa-body-m"><strong>Status:</strong> ${formatType(vehicle.listing_status ?? '')}</span>
          </div>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Description</h2>
          <p class="wa-body-m">${vehicle.text}</p>
        </div>
      </wa-card>

      ${tags ? html`
      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Features</h2>
          <div class="wa-cluster wa-gap-2xs">${raw(tags)}</div>
        </div>
      </wa-card>` : ''}

      ${similarCards.length ? html`
      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Similar vehicles</h2>
        <div class="wa-stack wa-gap-s">${raw(similarCards)}</div>
      </section>` : ''}
    </div>`;
}

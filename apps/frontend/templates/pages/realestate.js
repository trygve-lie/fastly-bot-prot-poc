import { html, raw } from 'hono/html';

function formatPrice(n) {
  return Number(n).toLocaleString('no-NO') + ' kr';
}

function formatType(type) {
  return String(type).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Counties as stored in the API (Trondelag = no special chars), display label separate
const COUNTIES = [
  { value: 'Oslo',      label: 'Oslo'      },
  { value: 'Vestland',  label: 'Vestland'  },
  { value: 'Trondelag', label: 'Trøndelag' },
  { value: 'Rogaland',  label: 'Rogaland'  },
  { value: 'Agder',     label: 'Agder'     },
  { value: 'Nordland',  label: 'Nordland'  },
];

function countyOptions() {
  return COUNTIES.map(c => `<wa-option value="${c.value}">${c.label}</wa-option>`).join('');
}

// ─── Search forms ────────────────────────────────────────────────────────────

function realestateFilterForm(filters) {
  const { q = '', county = '', property_type = '', min_bedrooms = '', max_price = '' } = filters;
  return html`
    <form action="/realestate/search" method="get" class="wa-stack wa-gap-s">
      <div class="wa-flank:end wa-gap-s">
        <wa-input name="q" value="${q}" placeholder="Search real estate..." clearable>
          <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
        </wa-input>
        <wa-button type="submit" variant="brand" appearance="filled">Search</wa-button>
      </div>
      <div class="filter-row">
        <wa-select name="county" value="${county}" placeholder="County">
          ${raw(countyOptions())}
        </wa-select>
        <wa-select name="property_type" value="${property_type}" placeholder="Property type">
          <wa-option value="apartment">Apartment</wa-option>
          <wa-option value="detached">Detached</wa-option>
          <wa-option value="semi_detached">Semi-detached</wa-option>
          <wa-option value="cabin">Cabin</wa-option>
        </wa-select>
        <wa-input type="number" name="min_bedrooms" value="${min_bedrooms}"
          placeholder="Min bedrooms" min="1" max="10" style="width: 14ch;">
        </wa-input>
        <wa-input type="number" name="max_price" value="${max_price}"
          placeholder="Max price (NOK)" min="0" style="width: 18ch;">
        </wa-input>
      </div>
    </form>`;
}

function mobilityFilterForm(filters) {
  const { q = '', county = '', vehicle_type = '', fuel_type = '', max_price = '', max_mileage = '' } = filters;
  return html`
    <form action="/mobility/search" method="get" class="wa-stack wa-gap-s">
      <div class="wa-flank:end wa-gap-s">
        <wa-input name="q" value="${q}" placeholder="Search mobility..." clearable>
          <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
        </wa-input>
        <wa-button type="submit" variant="brand" appearance="filled">Search</wa-button>
      </div>
      <div class="filter-row">
        <wa-select name="county" value="${county}" placeholder="County">
          ${raw(countyOptions())}
        </wa-select>
        <wa-select name="vehicle_type" value="${vehicle_type}" placeholder="Vehicle type">
          <wa-option value="sedan">Sedan</wa-option>
          <wa-option value="suv">SUV</wa-option>
          <wa-option value="hatchback">Hatchback</wa-option>
          <wa-option value="estate">Estate</wa-option>
          <wa-option value="coupe">Coupé</wa-option>
          <wa-option value="van">Van</wa-option>
        </wa-select>
        <wa-select name="fuel_type" value="${fuel_type}" placeholder="Fuel type">
          <wa-option value="electric">Electric</wa-option>
          <wa-option value="hybrid">Hybrid</wa-option>
          <wa-option value="petrol">Petrol</wa-option>
          <wa-option value="diesel">Diesel</wa-option>
        </wa-select>
        <wa-input type="number" name="max_price" value="${max_price}"
          placeholder="Max price (NOK)" min="0" style="width: 18ch;">
        </wa-input>
        <wa-input type="number" name="max_mileage" value="${max_mileage}"
          placeholder="Max km" min="0" style="width: 12ch;">
        </wa-input>
      </div>
    </form>`;
}

// ─── Item cards ──────────────────────────────────────────────────────────────

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

// ─── Page templates ──────────────────────────────────────────────────────────

export function intentVerticalPage({ icon, name, slug, intentLabel, items, typeKey, filters = {} }) {
  const form = slug === 'realestate' ? realestateFilterForm(filters) : mobilityFilterForm(filters);
  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-cluster wa-gap-s wa-align-items-center">
        <wa-icon name="${icon}" class="wa-font-size-xl"></wa-icon>
        <h1 class="wa-heading-xl">${name}</h1>
      </div>

      ${form}

      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Suitable for ${intentLabel}</h2>
        <div class="wa-stack wa-gap-s">
          ${raw(itemCards(items, slug, typeKey).join(''))}
        </div>
      </section>
    </div>`;
}

export function apiSearchPage({ name, slug, hits, typeKey, filters = {} }) {
  const form = slug === 'realestate' ? realestateFilterForm(filters) : mobilityFilterForm(filters);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-s">
        <h1 class="wa-heading-xl">Search ${name}</h1>
        ${form}
      </div>

      <section class="wa-stack wa-gap-s">
        <p class="wa-body-s">${hits.length} results${filters.q ? ` for "${filters.q}"` : ''}${activeFilters > 1 ? ' with filters applied' : ''}</p>
        <div class="wa-stack wa-gap-s">
          ${raw(itemCards(hits, slug, typeKey).join(''))}
        </div>
      </section>
    </div>`;
}

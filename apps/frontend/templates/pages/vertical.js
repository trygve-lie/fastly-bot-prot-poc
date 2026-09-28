import { html, raw } from 'hono/html';

export function verticalPage(vertical) {
  const { name, icon, slug, listings } = vertical;
  const cards = listings.map(l => html`
    <a href="/${slug}/item/${l.id}" class="listing-link">
      <wa-card>
        <div class="wa-split wa-align-items-start">
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-s">${l.title}</span>
            <span class="wa-body-s">${l.location}</span>
            <div class="wa-cluster wa-gap-2xs">
              ${raw(l.tags.map(t => `<wa-tag size="s">${t}</wa-tag>`).join(''))}
            </div>
          </div>
          <div class="wa-stack wa-gap-2xs wa-align-items-end">
            <span class="wa-heading-s">${l.price}</span>
            <span class="wa-caption-s">${l.meta}</span>
          </div>
        </div>
      </wa-card>
    </a>`);

  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-cluster wa-gap-s wa-align-items-center">
        <wa-icon name="${icon}" class="wa-font-size-xl"></wa-icon>
        <h1 class="wa-heading-xl">${name}</h1>
      </div>

      <div class="wa-flank:end wa-gap-s">
        <wa-input placeholder="Search ${name.toLowerCase()}..." clearable>
          <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
        </wa-input>
        <wa-button href="/${slug}/search" variant="brand" appearance="filled">Search</wa-button>
      </div>

      <section class="wa-stack wa-gap-s">
        <div class="wa-split">
          <h2 class="wa-heading-m">Featured</h2>
          <wa-button href="/${slug}/search" appearance="plain" size="small">
            See all
            <wa-icon slot="suffix" name="arrow-right"></wa-icon>
          </wa-button>
        </div>
        <div class="wa-stack wa-gap-s">
          ${raw(cards.join(''))}
        </div>
      </section>
    </div>`;
}

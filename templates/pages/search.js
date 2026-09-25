import { html, raw } from 'hono/html';

export function searchPage(vertical, query) {
  const { name, slug, listings } = vertical;
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
      <div class="wa-stack wa-gap-s">
        <h1 class="wa-heading-xl">Search ${name}</h1>
        <div class="wa-flank:end wa-gap-s">
          <wa-input value="${query || ''}" placeholder="Search ${name.toLowerCase()}..." clearable>
            <wa-icon slot="prefix" name="magnifying-glass"></wa-icon>
          </wa-input>
          <wa-button variant="brand" appearance="filled">Search</wa-button>
        </div>
      </div>

      <section class="wa-stack wa-gap-s">
        <p class="wa-body-s">${listings.length} results${query ? ` for "${query}"` : ''}</p>
        <div class="wa-stack wa-gap-s">
          ${raw(cards.join(''))}
        </div>
      </section>
    </div>`;
}

import { html, raw } from 'hono/html';

export function itemPage(vertical, listing) {
  const { name, slug } = vertical;
  return html`
    <div class="page-main wa-stack wa-gap-xl">
      <div class="wa-stack wa-gap-2xs">
        <h1 class="wa-heading-xl">${listing.title}</h1>
        <div class="wa-cluster wa-gap-xs">
          <wa-icon name="location-dot"></wa-icon>
          <span class="wa-body-m">${listing.location}</span>
        </div>
        <div class="wa-cluster wa-gap-2xs">
          ${raw(listing.tags.map(t => `<wa-tag size="s">${t}</wa-tag>`).join(''))}
        </div>
      </div>

      <wa-card>
        <div class="wa-split">
          <span class="wa-heading-l">${listing.price}</span>
          <wa-button variant="brand" appearance="filled">Contact</wa-button>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">Details</h2>
          <p class="wa-body-m">${listing.meta}</p>
          <p class="wa-body-m">${listing.description}</p>
        </div>
      </wa-card>

      <wa-card>
        <div class="wa-stack wa-gap-s">
          <h2 class="wa-heading-m">About the seller</h2>
          <div class="wa-flank wa-align-items-center wa-gap-s">
            <wa-avatar label="Seller avatar">
              <wa-icon slot="icon" name="circle-user"></wa-icon>
            </wa-avatar>
            <div class="wa-stack wa-gap-3xs">
              <span class="wa-heading-s">${listing.seller}</span>
              <span class="wa-body-s">Member since ${listing.memberSince}</span>
            </div>
          </div>
          <wa-button appearance="outlined">
            <wa-icon slot="prefix" name="envelope"></wa-icon>
            Send message
          </wa-button>
        </div>
      </wa-card>
    </div>`;
}

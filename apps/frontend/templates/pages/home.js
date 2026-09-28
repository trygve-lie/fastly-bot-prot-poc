import { html } from 'hono/html';

export const homePage = html`
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
              <span class="wa-body-s">Buy, sell &amp; rent</span>
            </div>
          </wa-card>
        </a>
        <a href="/mobility" class="category-link">
          <wa-card appearance="filled-outlined">
            <div class="wa-stack wa-gap-xs wa-align-items-center">
              <wa-icon name="car" class="wa-font-size-2xl"></wa-icon>
              <span class="wa-heading-s">Mobility</span>
              <span class="wa-body-s">Cars &amp; vehicles</span>
            </div>
          </wa-card>
        </a>
        <a href="/job" class="category-link">
          <wa-card appearance="filled-outlined">
            <div class="wa-stack wa-gap-xs wa-align-items-center">
              <wa-icon name="briefcase" class="wa-font-size-2xl"></wa-icon>
              <span class="wa-heading-s">Jobs</span>
              <span class="wa-body-s">Your next role</span>
            </div>
          </wa-card>
        </a>
        <a href="/recommerce" class="category-link">
          <wa-card appearance="filled-outlined">
            <div class="wa-stack wa-gap-xs wa-align-items-center">
              <wa-icon name="recycle" class="wa-font-size-2xl"></wa-icon>
              <span class="wa-heading-s">Recommerce</span>
              <span class="wa-body-s">Second-hand</span>
            </div>
          </wa-card>
        </a>
      </div>
    </section>

    <wa-button id="install-btn" variant="brand" hidden>
      <wa-icon slot="prefix" name="download"></wa-icon>
      Install app
    </wa-button>
  </div>`;

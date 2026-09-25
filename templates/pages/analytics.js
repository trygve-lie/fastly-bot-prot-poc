import { html } from 'hono/html';

export const analyticsPage = html`
  <div class="page-main wa-stack wa-gap-xl">
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Analytics</h1>
      <p class="wa-body-l">Usage metrics for the current billing period.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">API requests</h2>
        <p class="wa-body-m">84 230 of 100 000 requests used this month.</p>
        <wa-progress-bar value="84" label="API usage"></wa-progress-bar>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Storage</h2>
        <p class="wa-body-m">12.4 GB of 20 GB used.</p>
        <wa-progress-bar value="62" label="Storage usage"></wa-progress-bar>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Active users</h2>
        <p class="wa-body-m">1 042 unique users logged in during the last 30 days.</p>
        <div class="wa-cluster">
          <wa-tag variant="success">+12% vs last month</wa-tag>
        </div>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Tip</h2>
        <wa-callout variant="success">
          <wa-icon slot="icon" name="circle-check"></wa-icon>
          You are within your plan limits. No action required.
        </wa-callout>
      </div>
    </wa-card>
  </div>`;

import { html } from 'hono/html';

export const overviewPage = html`
  <div class="page-main wa-stack wa-gap-xl">
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Overview</h1>
      <p class="wa-body-l">Your workspace at a glance.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">System status</h2>
        <p class="wa-body-m">All services are running normally. No incidents reported in the last 24 hours.</p>
        <div class="wa-cluster">
          <wa-tag variant="success">API</wa-tag>
          <wa-tag variant="success">Database</wa-tag>
          <wa-tag variant="success">Storage</wa-tag>
          <wa-tag variant="warning">CDN</wa-tag>
        </div>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Getting started</h2>
        <p class="wa-body-m">Use the menu to navigate between pages and explore the available layouts and components.</p>
        <wa-button variant="brand" size="small" href="/page1">Open Page 1</wa-button>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Notice</h2>
        <wa-callout variant="brand">
          <wa-icon slot="icon" name="circle-info"></wa-icon>
          Scheduled maintenance window is set for Sunday 02:00–04:00 UTC.
        </wa-callout>
      </div>
    </wa-card>
  </div>`;

import { html } from 'hono/html';

export function reportsPage(nextPageHref) {
  return html`
  <div class="page-main wa-stack wa-gap-xl">
    <wa-button href="${nextPageHref}" appearance="outlined" size="small">
      Continue to Export details
      <wa-icon slot="suffix" name="arrow-right" label=""></wa-icon>
    </wa-button>
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Reports</h1>
      <p class="wa-body-l">Scheduled and on-demand report summaries.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Weekly summary</h2>
        <p class="wa-body-m">Generated every Monday at 06:00 UTC. Last report covered 3 421 events across 18 services.</p>
        <div class="wa-cluster">
          <wa-tag variant="success">Delivered</wa-tag>
          <wa-tag variant="neutral">PDF</wa-tag>
        </div>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Monthly audit</h2>
        <p class="wa-body-m">Covers access logs, permission changes, and data exports for compliance review.</p>
        <wa-button appearance="outlined" size="small">Download report</wa-button>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Scheduled exports</h2>
        <wa-callout variant="brand">
          <wa-icon slot="icon" name="circle-info"></wa-icon>
          Next export runs in 3 days. See Export details for configuration.
        </wa-callout>
      </div>
    </wa-card>
  </div>`;
}

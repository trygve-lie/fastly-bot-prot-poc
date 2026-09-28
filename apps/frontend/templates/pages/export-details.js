import { html } from 'hono/html';

export function exportDetailsPage(backHref) {
  return html`
  <div class="page-main wa-stack wa-gap-xl">
    <wa-button href="${backHref}" appearance="outlined" size="small">
      <wa-icon slot="prefix" name="arrow-left" label=""></wa-icon>
      Back to Reports
    </wa-button>
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Export details</h1>
      <p class="wa-body-l">Configuration for scheduled data exports.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Next export</h2>
        <p class="wa-body-m">Destination: <strong>s3://exports.example.com/data/</strong></p>
        <p class="wa-body-m">Format: <strong>JSON (gzipped)</strong></p>
        <p class="wa-body-m">Frequency: <strong>Every 3 days at 01:00 UTC</strong></p>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Last export</h2>
        <p class="wa-body-m">Completed 3 days ago. 2.1 MB transferred, 14 820 records exported.</p>
        <div class="wa-cluster">
          <wa-tag variant="success">Success</wa-tag>
          <wa-tag variant="neutral">14 820 records</wa-tag>
        </div>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Retention</h2>
        <wa-callout variant="warning">
          <wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
          Exports older than 90 days are automatically deleted from storage.
        </wa-callout>
      </div>
    </wa-card>
  </div>`;
}

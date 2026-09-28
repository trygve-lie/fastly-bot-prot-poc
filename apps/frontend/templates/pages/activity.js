import { html } from 'hono/html';

export const activityPage = html`
  <div class="page-main wa-stack wa-gap-xl">
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Activity</h1>
      <p class="wa-body-l">Recent events across your account.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Latest events</h2>
        <p class="wa-body-m">User <strong>alice@example.com</strong> signed in from a new device.</p>
        <p class="wa-body-m">User <strong>bob@example.com</strong> updated their profile.</p>
        <p class="wa-body-m">Deployment <strong>v2.4.1</strong> completed successfully.</p>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Unresolved alerts</h2>
        <wa-callout variant="warning">
          <wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
          3 rate-limit warnings in the past hour. Review API usage.
        </wa-callout>
        <wa-callout variant="danger">
          <wa-icon slot="icon" name="circle-xmark"></wa-icon>
          Failed login attempts detected on 2 accounts.
        </wa-callout>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Labels</h2>
        <div class="wa-cluster">
          <wa-tag variant="brand">Security</wa-tag>
          <wa-tag variant="danger">High priority</wa-tag>
          <wa-tag variant="neutral">Review needed</wa-tag>
        </div>
      </div>
    </wa-card>
  </div>`;

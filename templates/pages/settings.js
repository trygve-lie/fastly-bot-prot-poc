import { html } from 'hono/html';

export const settingsPage = html`
  <div class="page-main wa-stack wa-gap-xl">
    <div class="wa-stack wa-gap-2xs">
      <h1 class="wa-heading-xl">Settings</h1>
      <p class="wa-body-l">Manage your account and preferences.</p>
    </div>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Profile</h2>
        <p class="wa-body-m">Name: <strong>Jane Doe</strong></p>
        <p class="wa-body-m">Email: <strong>jane@example.com</strong></p>
        <wa-button appearance="outlined" size="small">Edit profile</wa-button>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Notifications</h2>
        <p class="wa-body-m">Choose which events trigger an email notification.</p>
        <div class="wa-stack wa-gap-xs">
          <wa-checkbox checked>Security alerts</wa-checkbox>
          <wa-checkbox checked>Billing updates</wa-checkbox>
          <wa-checkbox>Product announcements</wa-checkbox>
          <wa-checkbox>Weekly digest</wa-checkbox>
        </div>
      </div>
    </wa-card>
    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Danger zone</h2>
        <wa-callout variant="danger">
          <wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
          Deleting your account is permanent and cannot be undone.
        </wa-callout>
        <wa-button variant="danger" appearance="outlined" size="small">Delete account</wa-button>
      </div>
    </wa-card>
  </div>`;

import { html } from 'hono/html';

export const accountPage = html`
  <div class="page-main wa-stack wa-gap-xl">
    <h1 class="wa-heading-xl">Account</h1>

    <wa-card>
      <div class="wa-stack wa-gap-m">
        <div class="wa-flank wa-align-items-center wa-gap-s">
          <wa-avatar label="User avatar" style="--size: var(--wa-space-4xl);">
            <wa-icon slot="icon" name="circle-user"></wa-icon>
          </wa-avatar>
          <div class="wa-stack wa-gap-2xs">
            <span class="wa-heading-m">Jane Doe</span>
            <span class="wa-body-s">jane@example.com</span>
          </div>
        </div>
        <wa-button appearance="outlined" size="small">Edit profile</wa-button>
      </div>
    </wa-card>

    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">My listings</h2>
        <p class="wa-body-m">You have no active listings.</p>
        <wa-button variant="brand" size="small">Create listing</wa-button>
      </div>
    </wa-card>

    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Saved searches</h2>
        <div class="wa-stack wa-gap-xs">
          <div class="wa-split">
            <span class="wa-body-m">Apartments in Oslo</span>
            <wa-button appearance="plain" size="small" href="/realestate/search">View</wa-button>
          </div>
          <wa-divider></wa-divider>
          <div class="wa-split">
            <span class="wa-body-m">Electric cars under 400 000 kr</span>
            <wa-button appearance="plain" size="small" href="/mobility/search">View</wa-button>
          </div>
        </div>
      </div>
    </wa-card>

    <wa-card>
      <div class="wa-stack wa-gap-s">
        <h2 class="wa-heading-m">Settings</h2>
        <div class="wa-stack wa-gap-xs">
          <wa-button appearance="plain" size="small">Notifications</wa-button>
          <wa-button appearance="plain" size="small">Privacy</wa-button>
          <wa-button variant="danger" appearance="plain" size="small">Delete account</wa-button>
        </div>
      </div>
    </wa-card>
  </div>`;

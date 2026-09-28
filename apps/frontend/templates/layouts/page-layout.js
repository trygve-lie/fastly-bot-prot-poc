import { html } from 'hono/html';
import { document } from '../document.js';

export function pageLayout(title, body, navContent, opts = {}) {
  return document(title, html`
    <wa-page>
      <header slot="header" class="wa-split">
        <div class="wa-cluster">
          <wa-button appearance="plain" data-drawer="open nav-drawer">
            <wa-icon name="bars" label="Open menu"></wa-icon>
          </wa-button>
          <span class="wa-heading-s">${title}</span>
        </div>
      </header>

      <main>
        ${body}
      </main>
    </wa-page>

    <wa-drawer id="nav-drawer" placement="start" label="Menu" light-dismiss>
      <nav class="wa-stack wa-gap-2xs">
        ${navContent || html`<a href="/">Home</a>`}
      </nav>
    </wa-drawer>`, opts);
}

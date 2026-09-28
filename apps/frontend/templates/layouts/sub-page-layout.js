import { html } from 'hono/html';
import { document } from '../document.js';

export function subPageLayout(title, body, backHref = '/page', opts = {}) {
  return document(title, html`
    <wa-page>
      <header slot="header">
        <div class="wa-cluster">
          <wa-button appearance="plain" href="${backHref}">
            <wa-icon name="chevron-left" label="Back"></wa-icon>
          </wa-button>
          <span class="wa-heading-s">${title}</span>
        </div>
      </header>

      <main>
        ${body}
      </main>
    </wa-page>`, opts);
}

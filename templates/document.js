import { html, raw } from 'hono/html';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inlineStyles = raw(
  readFileSync(join(__dirname, './css/layout.css'), 'utf8') +
  readFileSync(join(__dirname, './css/transitions.css'), 'utf8')
);

export function document(title, body, opts = {}) {
  const {
    waBasePath = '/public/awesome/3.13.0',
    clientScriptPath = '/public/client.js',
    description = '',
  } = opts;

  return html`<!doctype html>
<html lang="en" class="wa-theme-default wa-cloak">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#ffffff" />
    ${description ? html`<meta name="description" content="${description}" />` : ''}
    <title>${title}</title>
    <script type="module" src="${waBasePath}/webawesome.loader.js"></script>
    <link rel="prefetch" href="${waBasePath}/styles/themes/default.css" as="style" />
    <link rel="prefetch" href="${waBasePath}/styles/utilities.css" as="style" />
    <link rel="prefetch" href="${waBasePath}/styles/native.css" as="style" />
    <link rel="stylesheet" href="${waBasePath}/styles/themes/default.css" />
    <link rel="stylesheet" href="${waBasePath}/styles/utilities.css" />
    <link rel="stylesheet" href="${waBasePath}/styles/native.css" />
    <script>
      (function () {
        // document.documentElement.classList.add('wa-light');

        window.determineTransitionType = function (from, to) {
          if (!from || !to) return 'unknown';
          var fromDepth = new URL(from.url).pathname.split('/').filter(Boolean).length;
          var toDepth   = new URL(to.url).pathname.split('/').filter(Boolean).length;
          if (toDepth > fromDepth) return 'forwards';
          if (toDepth < fromDepth) return 'backwards';
          return 'unknown';
        };

        window.addEventListener('pagereveal', function (e) {
          if (!e.viewTransition) return;
          var type;
          if (window.navigation && navigation.activation) {
            type = window.determineTransitionType(navigation.activation.from, navigation.activation.entry);
          } else {
            type = sessionStorage.getItem('nav-dir') ?? 'forwards';
          }
          e.viewTransition.types.add(type);
        });
      })();
    </script>
    <style>${inlineStyles}</style>
  </head>
  <body>
    ${body}
    <script type="module" src="${clientScriptPath}"></script>
  </body>
</html>`;
}

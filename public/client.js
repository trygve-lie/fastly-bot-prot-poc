// ---------------------------------------------------------------------------
// PWA install prompt
// beforeinstallprompt fires on Chrome/Android when the app meets installability
// criteria and is not yet installed. Safari/iOS does not fire this event —
// users install via Share → Add to Home Screen manually.
// ---------------------------------------------------------------------------

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = true;
});

const installBtn = document.getElementById('install-btn');
if (installBtn) {
  // Hide if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) {
    installBtn.hidden = true;
  }

  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    installPrompt = null;
  });
}

// ---------------------------------------------------------------------------
// Drawer navigation — close before cross-document view transition fires
// ---------------------------------------------------------------------------

document.querySelectorAll('wa-drawer a[href]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    if (anchor.origin !== location.origin) return;
    const drawer = anchor.closest('wa-drawer');
    if (!drawer || !drawer.open) return;

    e.preventDefault();
    const href = anchor.href;

    drawer.open = false;
    drawer.addEventListener('wa-after-hide', () => {
      console.log('[drawer] wa-after-hide fired, navigating to', href);
      requestAnimationFrame(() => requestAnimationFrame(() => location.assign(href)));
    }, { once: true });
  });
});

// ---------------------------------------------------------------------------
// View transition type detection (outgoing page)
// ---------------------------------------------------------------------------

window.addEventListener('pageswap', (e) => {
  if (!e.viewTransition) return;
  const type = window.determineTransitionType
    ? window.determineTransitionType(e.activation.from, e.activation.entry)
    : 'forwards';
  e.viewTransition.types.add(type);
  if (!window.navigation) {
    sessionStorage.setItem('nav-dir', type);
  }
});

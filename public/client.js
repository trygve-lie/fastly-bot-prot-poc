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
      // Two rAFs let the browser repaint after the drawer close before the
      // view transition snapshot is taken, preventing layout-settling artefacts.
      requestAnimationFrame(() => requestAnimationFrame(() => location.assign(href)));
    }, { once: true });
  });
});

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

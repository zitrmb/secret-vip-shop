(function () {
  'use strict';
  const buttons = document.querySelectorAll('[data-direct-mac-download]');
  if (!buttons.length) return;

  const root = new URL(document.documentElement.dataset.root || './', location.href);
  function downloadAddress(file) {
    if (typeof file !== 'string' || !file.trim()) return null;
    try {
      const address = new URL(file, root);
      return address.protocol === 'https:' || address.origin === location.origin ? address : null;
    } catch {
      return null;
    }
  }

  fetch(new URL('downloads.json', root), { cache: 'no-store', credentials: 'omit' })
    .then(response => response.ok ? response.json() : null)
    .catch(() => null)
    .then(catalogue => {
      for (const button of buttons) {
        const product = button.dataset.dl.split(':')[0];
        const address = downloadAddress(catalogue?.plugins?.[product]?.mac);
        button.href = address ? address.href : button.dataset.fallbackHref;
        if (address?.origin === location.origin) button.setAttribute('download', '');
        if (!address) {
          const label = button.querySelector('[data-fallback-label]');
          label.textContent = label.dataset.fallbackLabel;
        }
        button.removeAttribute('aria-disabled');
      }
    });
}());

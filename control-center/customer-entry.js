/* BENUTZT-WENN: A buyer opens the existing My licenses page.
   Caller: prepared deployment appends this one script after collection.js.
   Existing sign-in, licenses and downloads remain owned by collection.js. */
(async function () {
  'use strict';
  if (document.getElementById('control-center-entry')) return;
  try {
    const response = await fetch('../downloads.json', {cache: 'no-store'});
    if (!response.ok) return;
    const config = (await response.json()).control_center;
    if (!config || config.enabled !== true || typeof config.mac !== 'string') return;
    const url = new URL(config.mac, location.href);
    if (url.protocol !== 'https:' || !['plugins.secret.vip', 'github.com'].includes(url.hostname) || url.username || url.password || !url.pathname.endsWith('.dmg')) return;
    if (document.getElementById('control-center-entry')) return;
    const footer = document.querySelector('footer');
    if (footer) { footer.style.display = 'flex'; footer.style.flexWrap = 'wrap'; footer.style.gap = '5px'; }
    const existing = document.getElementById('control-download');
    if (existing) { existing.href = url.href; existing.hidden = false; return; }
    const parent = document.querySelector('main');
    if (!parent) return;
    const row = document.createElement('div'); row.id = 'control-center-entry';
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;font-size:14px;margin:5px 0';
    const label = document.createElement('span'); label.textContent = 'Secret Control Center';
    const download = document.createElement('a'); download.className = 'secondary'; download.href = url.href; download.textContent = 'Download for Mac';
    const open = document.createElement('a'); open.className = 'secondary'; open.href = 'secretcontrolcenter://updates'; open.textContent = 'Open app';
    const help = document.createElement('a'); help.href = '../control-center/'; help.textContent = 'How it works';
    row.append(label, download, open, help); parent.prepend(row);

  } catch (_) { /* Direct plugin downloads stay available when this optional fetch fails. */ }
})();

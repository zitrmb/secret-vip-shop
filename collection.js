// BENUTZT-WENN: buyer opens success or their private collection. No analytics or Paddle here.
(function () {
  'use strict';
  var API = 'https://license.secret.vip', root = '../';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.hash.slice(1));
  var isSuccess = location.pathname.indexOf('/success/') >= 0;
  var receiptMode = !isSuccess && !!params.get('receipt');
  var access = params.get('access') || params.get('receipt') || '';
  var transaction = params.get('transaction_id') || '';
  // Fragments never enter HTTP; only this tab remembers the scoped link. No keys in storage.
  if (access) {
    try {
      sessionStorage.setItem('svp-' + (isSuccess ? 'checkout' : 'library-current'), access);
      if (!isSuccess) { sessionStorage.setItem('svp-library-mode', receiptMode ? 'receipt' : 'mail'); sessionStorage.setItem('svp-library-transaction', transaction); }
    } catch (_) {}
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    try {
      access = sessionStorage.getItem('svp-' + (isSuccess ? 'checkout' : 'library-current')) || '';
      if (!isSuccess) { receiptMode = sessionStorage.getItem('svp-library-mode') === 'receipt'; transaction = sessionStorage.getItem('svp-library-transaction') || ''; }
    } catch (_) {}
  }
  function auth(extra) { return Object.assign({ access: access, receipt: receiptMode, transaction_id: transaction }, extra || {}); }
  try { document.documentElement.dataset.theme = localStorage.getItem('svp-theme') || ''; } catch (_) {}
  $('theme').onclick = function () {
    var dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('svp-theme', dark ? 'light' : 'dark'); } catch (_) {}
  };
  async function post(path, body) {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      var r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) { var e = new Error('request'); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(timer); }
  }
  $('request-form').onsubmit = async function (ev) {
    ev.preventDefault();
    var b = $('request-form').querySelector('button'); b.disabled = true;
    try {
      await post('/v1/library/request', { email: $('email').value.trim() });
      $('request-note').textContent = 'Falls du bei uns gekauft hast, ist der Link per E-Mail unterwegs.';
    } catch (_) { $('request-note').textContent = 'Gerade klappt der Versand nicht. Bitte versuche es gleich noch einmal oder nutze den Support.'; }
    finally { b.disabled = false; }
  };
  if ($('reward')) {
    try { sessionStorage.removeItem('svp-paid-receipt'); } catch (_) {}
    var run = 0, pollTimer, delayTimer;
    async function poll(myRun, started) {
      if (myRun !== run) return;
      try {
        var result = await post('/v1/checkout/status', { access: access, transaction_id: params.get('transaction_id') || '' });
        if (myRun !== run) return;
        if (result.state === 'ready') {
          clearTimeout(delayTimer);
          $('result-title').textContent = result.licenses ? 'Gekauft. Gehört jetzt dir.' : 'Deine Bestellung ist da.';
          $('purchase-count').textContent = result.licenses + (result.licenses === 1 ? ' Lizenz' : ' Lizenzen');
          $('purchase-note').hidden = true; $('purchase-confirmed').hidden = false;
          $('delay-note').hidden = true; $('retry').hidden = true;
          $('reward').classList.add('ready');
          $('mail-note').textContent = result.mailed ? 'Schlüssel und Beleg sind per E-Mail unterwegs.' : 'Deine Lizenzen sind bereit. Die Schlüssel-Mail folgt; den Beleg schickt Paddle.';
          var link = new URL(result.collection_url);
          if (link.origin === 'https://plugins.secret.vip' && link.pathname === '/licenses/') $('open-library').href = root + 'licenses/' + link.hash;
          $('request').hidden = true;
          return;
        }
      } catch (_) {
        $('delay-note').hidden = false;
        $('delay-note').textContent = 'Dein Kauf geht nicht verloren. Wir prüfen weiter. Schlüssel und Beleg kommen auch per E-Mail.';
      }
      if (myRun !== run) return;
      if (Date.now() - started >= 120000) {
        $('purchase-note').textContent = 'Die Bestätigung braucht etwas länger.';
        $('delay-note').textContent = 'Du musst nicht erneut kaufen. Prüfe deine Kauf-Mail oder fordere deinen persönlichen Link an.';
        $('delay-note').hidden = false; $('retry').hidden = false; $('request').hidden = false;
        return;
      }
      pollTimer = setTimeout(function () { poll(myRun, started); }, 3000);
    }
    function start() {
      clearTimeout(pollTimer); clearTimeout(delayTimer);
      $('retry').hidden = true; $('purchase-note').hidden = false;
      $('purchase-note').textContent = 'Wir warten auf deine Kaufbestätigung.';
      var myRun = ++run;
      delayTimer = setTimeout(function () {
        $('delay-note').textContent = 'Die Bestätigung braucht etwas länger. Du musst nicht erneut kaufen. Deine Kauf-Mail kommt unabhängig von dieser Seite.';
        $('delay-note').hidden = false;
      }, 15000);
      poll(myRun, Date.now());
    }
    $('retry').onclick = start;
    if (/^[a-f0-9]{64}$/.test(access)) start();
    else {
      $('result-title').textContent = 'Deine Kaufbestätigung.';
      $('purchase-note').textContent = 'Deine Kauf-Mail enthält deinen persönlichen Zugang. Du kannst ihn hier erneut anfordern.';
    }
    window.addEventListener('pagehide', function () { ++run; clearTimeout(pollTimer); clearTimeout(delayTimer); });
    return;
  }
  var downloadData = {}, offset = 0, loading = false, groups = {};
  function safeDownload(value) {
    if (!value) return '';
    try {
      var u = new URL(value, new URL(root, location.href));
      if (u.origin === location.origin || (u.protocol === 'https:' && ['plugins.secret.vip', 'github.com', 'objects.githubusercontent.com'].includes(u.hostname))) return u.href;
    } catch (_) {}
    return '';
  }
  function el(tag, text, className) {
    var node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
  }
  async function reveal(license, target, button) {
    button.disabled = true;
    try {
      var res = await post('/v1/library/key', auth({ license_id: license.license_id }));
      target.textContent = res.key; target.dataset.shown = 'yes'; button.textContent = 'verbergen';
    } catch (_) { target.textContent = 'Bitte nutze deine Kauf-Mail oder versuche es erneut.'; }
    finally { button.disabled = false; }
  }
  function card(license) {
    var entries = downloadData.plugins || {};
    var entry = Object.keys(entries).find(function (name) { return (entries[name].license_product || name) === license.product; });
    var download = entries[entry] || {};
    var group = groups[license.product];
    if (!group) {
      var article = el('article', '', 'plugin');
      var image = safeDownload(download.image);
      if (image) { var img = el('img'); img.src = image; img.alt = license.title; article.appendChild(img); }
      else { var art = el('div', '◇', 'number'); art.setAttribute('aria-hidden', 'true'); article.appendChild(art); }
      article.appendChild(el('span', 'Gehört zu deiner Sammlung', 'eyebrow'));
      article.appendChild(el('h3', license.title));
      var counter = el('p', '', 'quiet'), downloads = el('div', '', 'downloads');
      article.append(counter, downloads); $('plugins').appendChild(article);
      group = groups[license.product] = { article: article, downloads: downloads, counter: counter, count: 0, active: false };
    }
    group.count++;
    group.counter.textContent = group.count + (group.count === 1 ? ' Lizenz' : ' Lizenzen');
    if (!license.revoked && !group.active) {
      group.active = true; group.downloads.replaceChildren();
      [['mac', 'Für Mac laden'], ['win', 'Für Windows laden']].forEach(function (pair) {
        var url = safeDownload(download[pair[0]]); if (!url) return;
        var a = el('a', pair[1], 'button'); a.href = url; group.downloads.appendChild(a);
      });
      if (!group.downloads.children.length) group.downloads.appendChild(el('p', 'Der Download kommt in Kürze.', 'quiet'));
    } else if (!group.active && !group.downloads.children.length) group.downloads.appendChild(el('p', 'Diese Lizenz ist nicht mehr aktiv.', 'quiet'));
    var row = el('div', '', 'license');
    row.appendChild(el('p', license.machines + ' Computer gleichzeitig', 'quiet'));
    var key = el('span', '•••• •••• •••• ••••', 'key'); key.setAttribute('data-detail', ''); row.appendChild(key);
    if (!license.revoked) {
      var actions = el('div', '', 'actions'), show = el('button', 'anzeigen', 'secondary'), copy = el('button', 'kopieren', 'secondary');
      show.setAttribute('aria-label', 'Schlüssel anzeigen für ' + license.title);
      show.onclick = function () {
        if (key.dataset.shown) { key.textContent = '•••• •••• •••• ••••'; delete key.dataset.shown; show.textContent = 'anzeigen'; }
        else reveal(license, key, show);
      };
      copy.onclick = async function () {
        copy.disabled = true;
        try {
          var res = await post('/v1/library/key', auth({ license_id: license.license_id }));
          await navigator.clipboard.writeText(res.key); copy.textContent = 'kopiert';
        } catch (_) { copy.textContent = 'Bitte anzeigen'; }
        finally { copy.disabled = false; setTimeout(function () { copy.textContent = 'kopieren'; }, 2500); }
      };
      actions.append(show, copy); row.appendChild(actions);
    }
    group.article.appendChild(row);
  }
  async function loadCollection() {
    if (loading) return; loading = true;
    try {
      var result = await post('/v1/library', auth({ offset: offset }));
      $('request').hidden = !receiptMode; $('private-collection').hidden = false;
      $('collection-note').textContent = receiptMode ? 'Dein neuer Kauf ist hier. Alle früheren Käufe findest du mit dem persönlichen Link aus deiner Kauf-Mail.' : ''; $('total').textContent = result.total;
      result.licenses.forEach(card); offset = result.next;
      $('next-page').hidden = result.next === null;
      if (!result.licenses.length && !$('plugins').children.length) $('collection-note').textContent = 'Deine Sammlung ist noch leer. Bei einem neuen Kauf erscheint dein Plugin hier.';
    } catch (e) {
      $('collection-note').textContent = e.status === 401 ? 'Bitte öffne deinen persönlichen Link oder fordere ihn unten an.' : 'Deine Sammlung ist gerade nicht erreichbar. Bitte nutze deine Kauf-Mail oder versuche es erneut.';
      $('request').hidden = false;
    } finally { loading = false; }
  }
  $('next-page').onclick = loadCollection;
  async function init() {
    try {
      var r = await fetch(root + 'downloads.json', { cache: 'no-store' }); if (r.ok) downloadData = await r.json();
    } catch (_) {}
    var center = downloadData.control_center || {}, link = safeDownload(center.mac);
    if (center.enabled === true && link) { $('control-download').href = link; $('control-download').hidden = false; $('control-soon').hidden = true; }
    // Promotion ends in Hamburg, not in the browser's chosen timezone.
    var today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    $('clipper-promo').hidden = today > (center.bonus_until || '2026-12-31');
    if (access) await loadCollection();
    else $('collection-note').textContent = 'Öffne den persönlichen Link aus deiner Kauf-Mail. Oder fordere ihn hier an.';
  }
  window.addEventListener('pagehide', function () { document.querySelectorAll('.key').forEach(function (k) { k.textContent = '•••• •••• •••• ••••'; delete k.dataset.shown; }); });
  init();
})();

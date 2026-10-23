// BENUTZT-WENN: buyer opens success or their private collection. No analytics or Paddle here.
(function () {
  'use strict';
  // Language and paths come from <html lang data-root data-home>: site/licenses/ is English, site/de/licenses/ German.
  var html = document.documentElement;
  var API = 'https://license.secret.vip', root = html.getAttribute('data-root') || '../';
  // Same page-language rule as shop.js: /<code>/ path plus matching <html lang>, otherwise full English.
  var LOCALES = ['de'];
  function pageLanguage() {
    var lang = String(html.lang || '').toLowerCase(), path = String(location.pathname || '');
    return LOCALES.indexOf(lang) >= 0 && path.indexOf('/' + lang + '/') >= 0 ? lang : 'en';
  }
  var LANG = pageLanguage(), home = LANG === 'en' ? root : html.getAttribute('data-home') || root;
  var T = LANG === 'de' ? {
    requested: 'Falls du bei uns gekauft hast, ist der Link per E-Mail unterwegs.',
    requestFailed: 'Gerade klappt der Versand nicht. Bitte versuche es gleich noch einmal oder nutze den Support.',
    bought: 'Gekauft. Gehört jetzt dir.', order: 'Deine Bestellung ist da.', license: ' Lizenz', licenses: ' Lizenzen',
    mailed: 'Schlüssel und Beleg sind per E-Mail unterwegs.', mailLater: 'Deine Lizenzen sind bereit. Die Schlüssel-Mail folgt; den Beleg schickt Paddle.',
    notLost: 'Dein Kauf geht nicht verloren. Wir prüfen weiter. Schlüssel und Beleg kommen auch per E-Mail.',
    longer: 'Die Bestätigung braucht etwas länger.',
    noRebuy: 'Du musst nicht erneut kaufen. Prüfe deine Kauf-Mail oder fordere deinen persönlichen Link an.',
    waiting: 'Wir warten auf deine Kaufbestätigung.',
    slow: 'Die Bestätigung braucht etwas länger. Du musst nicht erneut kaufen. Deine Kauf-Mail kommt unabhängig von dieser Seite.',
    confirmation: 'Deine Kaufbestätigung.', viaMail: 'Deine Kauf-Mail enthält deinen persönlichen Zugang. Du kannst ihn hier erneut anfordern.',
    show: 'anzeigen', hide: 'verbergen', copy: 'kopieren', copied: 'kopiert', showFirst: 'Bitte anzeigen', showFor: 'Schlüssel anzeigen für ',
    keyFailed: 'Bitte nutze deine Kauf-Mail oder versuche es erneut.', partOf: 'Gehört zu deiner Sammlung',
    mac: 'Für Mac laden', win: 'Für Windows laden', soon: 'Der Download kommt in Kürze.', inactive: 'Diese Lizenz ist nicht mehr aktiv.',
    computer: ' Computer gleichzeitig', computers: ' Computer gleichzeitig',
    receipt: 'Dein neuer Kauf ist hier. Alle früheren Käufe findest du mit dem persönlichen Link aus deiner Kauf-Mail.',
    empty: 'Deine Sammlung ist noch leer. Bei einem neuen Kauf erscheint dein Plugin hier.',
    openLink: 'Bitte öffne deinen persönlichen Link oder fordere ihn unten an.',
    unreachable: 'Deine Sammlung ist gerade nicht erreichbar. Bitte nutze deine Kauf-Mail oder versuche es erneut.',
    start: 'Öffne den persönlichen Link aus deiner Kauf-Mail. Oder fordere ihn hier an.'
  } : {
    requested: 'If you bought from us, the link is on its way by email.',
    requestFailed: 'Sending does not work right now. Please try again in a moment or contact support.',
    bought: 'Purchased. It\'s yours now.', order: 'Your order is here.', license: ' license', licenses: ' licenses',
    mailed: 'Your key and receipt are on their way by email.', mailLater: 'Your licenses are ready. The key email follows; Paddle sends the receipt.',
    notLost: 'Your purchase is not lost. We keep checking. Your key and receipt also arrive by email.',
    longer: 'The confirmation is taking a little longer.',
    noRebuy: 'No need to buy again. Check your purchase email or request your personal link.',
    waiting: 'Waiting for your purchase confirmation.',
    slow: 'The confirmation is taking a little longer. No need to buy again. Your purchase email arrives independently of this page.',
    confirmation: 'Your purchase confirmation.', viaMail: 'Your purchase email contains your personal access. You can request it again here.',
    show: 'show', hide: 'hide', copy: 'copy', copied: 'copied', showFirst: 'Show it first', showFor: 'Show key for ',
    keyFailed: 'Please use your purchase email or try again.', partOf: 'Part of your collection',
    mac: 'Download for Mac', win: 'Download for Windows', soon: 'The download is coming soon.', inactive: 'This license is no longer active.',
    computer: ' computer at a time', computers: ' computers at the same time',
    receipt: 'Your new purchase is here. You find all earlier purchases with the personal link from your purchase email.',
    empty: 'Your collection is still empty. After a new purchase, your plugin appears here.',
    openLink: 'Please open your personal link or request it below.',
    unreachable: 'Your collection is not reachable right now. Please use your purchase email or try again.',
    start: 'Open the personal link from your purchase email. Or request it here.'
  };
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
      $('request-note').textContent = T.requested;
    } catch (_) { $('request-note').textContent = T.requestFailed; }
    finally { b.disabled = false; }
  };
  if ($('reward')) {
    try { sessionStorage.removeItem('svp-paid-receipt'); } catch (_) {}
    var run = 0, pollTimer, delayTimer;
    // Null-sicher: eine noch zwischengespeicherte alte Seite ohne den Link darf das Warten nie brechen.
    function backShop(on) { var b = $('back-shop'); if (b) b.hidden = !on; }
    async function poll(myRun, started) {
      if (myRun !== run) return;
      try {
        var result = await post('/v1/checkout/status', { access: access, transaction_id: params.get('transaction_id') || '' });
        if (myRun !== run) return;
        if (result.state === 'ready') {
          clearTimeout(delayTimer);
          $('result-title').textContent = result.licenses ? T.bought : T.order;
          $('purchase-count').textContent = result.licenses + (result.licenses === 1 ? T.license : T.licenses);
          $('purchase-note').hidden = true; $('purchase-confirmed').hidden = false;
          $('delay-note').hidden = true; $('retry').hidden = true; backShop(false);
          $('reward').classList.add('ready');
          $('mail-note').textContent = result.mailed ? T.mailed : T.mailLater;
          var link = new URL(result.collection_url);
          // The server may link either language; the buyer stays in the language of this page.
          if (['https://plugins.secret.vip', 'https://secret-audio.com', location.origin].includes(link.origin) && /^\/([a-z]{2}\/)?licenses\/$/.test(link.pathname)) $('open-library').href = home + 'licenses/' + link.hash;
          $('request').hidden = true;
          return;
        }
      } catch (_) {
        $('delay-note').hidden = false;
        $('delay-note').textContent = T.notLost;
      }
      if (myRun !== run) return;
      if (Date.now() - started >= 120000) {
        $('purchase-note').textContent = T.longer;
        $('delay-note').textContent = T.noRebuy;
        $('delay-note').hidden = false; $('retry').hidden = false; $('request').hidden = false; backShop(true);
        return;
      }
      pollTimer = setTimeout(function () { poll(myRun, started); }, 3000);
    }
    function start() {
      clearTimeout(pollTimer); clearTimeout(delayTimer);
      $('retry').hidden = true; $('purchase-note').hidden = false;
      $('purchase-note').textContent = T.waiting;
      var myRun = ++run;
      delayTimer = setTimeout(function () {
        $('delay-note').textContent = T.slow;
        $('delay-note').hidden = false;
        // Ohne echten Kauf (Seite direkt geoeffnet) nie endlos warten: der Weg zurueck zum Shop.
        backShop(true);
      }, 15000);
      poll(myRun, Date.now());
    }
    $('retry').onclick = start;
    if (/^[a-f0-9]{64}$/.test(access)) start();
    else {
      $('result-title').textContent = T.confirmation;
      $('purchase-note').textContent = T.viaMail;
      backShop(true);
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
      target.textContent = res.key; target.dataset.shown = 'yes'; button.textContent = T.hide;
    } catch (_) { target.textContent = T.keyFailed; }
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
      article.appendChild(el('span', T.partOf, 'eyebrow'));
      article.appendChild(el('h3', license.title));
      var counter = el('p', '', 'quiet'), downloads = el('div', '', 'downloads');
      article.append(counter, downloads); $('plugins').appendChild(article);
      group = groups[license.product] = { article: article, downloads: downloads, counter: counter, count: 0, active: false };
    }
    group.count++;
    group.counter.textContent = group.count + (group.count === 1 ? T.license : T.licenses);
    if (!license.revoked && !group.active) {
      group.active = true; group.downloads.replaceChildren();
      [['mac', T.mac], ['win', T.win]].forEach(function (pair) {
        var url = safeDownload(download[pair[0]]); if (!url) return;
        var a = el('a', pair[1], 'button'); a.href = url; group.downloads.appendChild(a);
      });
      if (!group.downloads.children.length) group.downloads.appendChild(el('p', T.soon, 'quiet'));
    } else if (!group.active && !group.downloads.children.length) group.downloads.appendChild(el('p', T.inactive, 'quiet'));
    var row = el('div', '', 'license');
    row.appendChild(el('p', license.machines + (license.machines === 1 ? T.computer : T.computers), 'quiet'));
    var key = el('span', '•••• •••• •••• ••••', 'key'); key.setAttribute('data-detail', ''); row.appendChild(key);
    if (!license.revoked) {
      var actions = el('div', '', 'actions'), show = el('button', T.show, 'secondary'), copy = el('button', T.copy, 'secondary');
      show.setAttribute('aria-label', T.showFor + license.title);
      show.onclick = function () {
        if (key.dataset.shown) { key.textContent = '•••• •••• •••• ••••'; delete key.dataset.shown; show.textContent = T.show; }
        else reveal(license, key, show);
      };
      copy.onclick = async function () {
        copy.disabled = true;
        try {
          var res = await post('/v1/library/key', auth({ license_id: license.license_id }));
          await navigator.clipboard.writeText(res.key); copy.textContent = T.copied;
        } catch (_) { copy.textContent = T.showFirst; }
        finally { copy.disabled = false; setTimeout(function () { copy.textContent = T.copy; }, 2500); }
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
      $('collection-note').textContent = receiptMode ? T.receipt : ''; $('total').textContent = result.total;
      result.licenses.forEach(card); offset = result.next;
      $('next-page').hidden = result.next === null;
      if (!result.licenses.length && !$('plugins').children.length) $('collection-note').textContent = T.empty;
    } catch (e) {
      $('collection-note').textContent = e.status === 401 ? T.openLink : T.unreachable;
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
    else $('collection-note').textContent = T.start;
  }
  window.addEventListener('pagehide', function () { document.querySelectorAll('.key').forEach(function (k) { k.textContent = '•••• •••• •••• ••••'; delete k.dataset.shown; }); });
  init();
})();

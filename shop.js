// BENUTZT-WENN: plugins.secret.vip Kaufen-Knopf, Download-Links oder "Schluessel erneut schicken"
// brauchen. Nicht geheime Paddle-Werte (Client-Token, Preis-ID, Rabatt-ID) stehen in config.json,
// die Download-Links schreibt tools/release/release.sh in downloads.json.
// Ohne Paddle-Werte bleibt der Knopf "Available soon" (Seite ist trotzdem vollstaendig).
(function () {
  'use strict';
  var LICENSE = 'https://license.secret.vip';

  function $(s, r) { return (r || document).querySelector(s); }
  function all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function json(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  var root = document.documentElement.getAttribute('data-root') || '';

  // ---- Kaufen (Paddle Overlay-Checkout) ----
  // Datenschutz: Paddle.js (setzt das Cookie __cf_bm und laedt ProfitWell) laedt erst beim Klick auf
  // "Buy now" oder wenn ein Paddle-Zahlungslink (?_ptxn=...) auf dieser Seite landet - nie beim
  // blossen Seitenaufruf. Nur so stimmt "kein Cookie-Banner" (tools/legal/texts/privacy.*.html).
  // Nie einen Streichpreis zeigen: der Normalpreis wurde noch nicht verlangt (UWG § 5, PAngV § 11).
  json(root + 'config.json').then(function (cfg) {
    all('[data-price]').forEach(function (box) {
      var p = (cfg.products || {})[box.getAttribute('data-price')];
      if (!p) return;
      var active = p.launch_active !== false && !!p.discount_id && Number(p.launch_eur) < Number(p.price_eur);
      $('.now', box).textContent = '€' + (active ? p.launch_eur : p.price_eur);
      var was = $('.was', box), tag = $('.tag', box);
      if (was) was.hidden = true;
      if (tag) tag.hidden = !active;
    });
    all('[data-price-label]').forEach(function (el) {
      var p = (cfg.products || {})[el.getAttribute('data-price-label')];
      if (p) el.textContent = '€' + (p.launch_active !== false && p.discount_id ? p.launch_eur : p.price_eur);
    });
    if (!cfg.paddle || !cfg.paddle.token) return;
    var paddleState = '', waiting = [];
    function withPaddle(fn) {
      if (paddleState === 'ready') return fn();
      waiting.push(fn);
      if (paddleState) return;
      paddleState = 'loading';
      var s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = function () {
        if (cfg.paddle.environment === 'sandbox') Paddle.Environment.set('sandbox');
        Paddle.Initialize({ token: cfg.paddle.token });
        paddleState = 'ready';
        waiting.splice(0).forEach(function (f) { f(); });
      };
      s.onerror = function () { paddleState = ''; waiting = []; };
      document.head.appendChild(s);
    }
    if (/[?&]_ptxn=/.test(location.search)) withPaddle(function () {});
    all('[data-buy]').forEach(function (b) {
      var p = (cfg.products || {})[b.getAttribute('data-buy')];
      if (!p || !p.price_id) return;
      // Verkauf erst nach "Go Release" offen; ?kauftest=1 fuer den eigenen Test-Kauf
      if (!cfg.sale_open && !/[?&]kauftest=1\b/.test(location.search)) return;
      b.disabled = false; b.textContent = 'Buy now';
      b.onclick = function () {
        var o = { items: [{ priceId: p.price_id, quantity: 1 }], settings: { displayMode: 'overlay', theme: 'dark' } };
        if (p.launch_active !== false && p.discount_id) o.discountId = p.discount_id;
        var query = new URLSearchParams(location.search);
        var custom = { product: p.license_product || b.getAttribute('data-buy') };
        ['utm_source', 'utm_campaign', 'ref'].forEach(function (key) {
          var value = (query.get(key) || '').trim();
          if (value) custom[key] = value.slice(0, 120);
        });
        o.customData = custom;
        withPaddle(function () { Paddle.Checkout.open(o); });
      };
    });
  }).catch(function () {});

  // ---- Downloads ----
  json(root + 'downloads.json').then(function (d) {
    all('[data-dl]').forEach(function (a) {
      var parts = a.getAttribute('data-dl').split(':'), e = (d.plugins || {})[parts[0]];
      var url = e && e[parts[1]];
      if (!url) return;
      a.href = url; a.removeAttribute('aria-disabled'); a.classList.remove('off');
      var v = $('[data-ver="' + parts[0] + '"]');
      if (v) v.textContent = 'Version ' + e.version + (e.date ? ' - ' + e.date : '');
    });
  }).catch(function () {});

  // ---- Schluessel erneut schicken ----
  var f = $('form.key');
  if (f) f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var note = $('.note'), btn = $('button', f), mail = $('input', f).value.trim();
    if (mail.indexOf('@') < 1) { note.textContent = 'Please enter the email address you used for the purchase.'; return; }
    btn.disabled = true; note.textContent = 'Sending...';
    fetch(LICENSE + '/v1/key/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail }) })
      .then(function (r) { return r.json(); })
      .then(function () { note.textContent = 'Done. If this address bought a plugin, the key is on its way. Check your spam folder too.'; })
      .catch(function () { note.textContent = 'That did not work. Please write to support@secret.vip - we help right away.'; })
      .then(function () { btn.disabled = false; });
  });
})();

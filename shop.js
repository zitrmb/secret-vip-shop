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
  // Paddle.js laedt immer, sobald ein Token da ist: Paddle-Zahlungslinks (?_ptxn=...) landen auf
  // dieser Seite und oeffnen den Checkout selbst. Nur der Kaufen-Knopf wartet auf "Go Release".
  json(root + 'config.json').then(function (cfg) {
    if (!cfg.paddle || !cfg.paddle.token) return;
    var s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = function () {
      if (cfg.paddle.environment === 'sandbox') Paddle.Environment.set('sandbox');
      Paddle.Initialize({ token: cfg.paddle.token });
      all('[data-buy]').forEach(function (b) {
        var p = (cfg.products || {})[b.getAttribute('data-buy')];
        if (!p || !p.price_id) return;
        // Verkauf erst nach "Go Release" offen; ?kauftest=1 fuer den eigenen Test-Kauf
        if (!cfg.sale_open && !/[?&]kauftest=1\b/.test(location.search)) return;
        b.disabled = false; b.textContent = 'Buy now';
        b.onclick = function () {
          var o = { items: [{ priceId: p.price_id, quantity: 1 }], settings: { displayMode: 'overlay', theme: 'dark' } };
          if (p.discount_id) o.discountId = p.discount_id;
          Paddle.Checkout.open(o);
        };
      });
    };
    document.head.appendChild(s);
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

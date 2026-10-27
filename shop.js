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
  // Page language decides texts and checkout, never the browser (Paddle's default without settings.locale).
  // A non-English page lives under /<code>/ and says so in <html lang>; disagreement or unknown = full English.
  var LOCALES = ['de'];
  function pageLanguage() {
    var lang = String(document.documentElement.lang || '').toLowerCase(), path = String(location.pathname || '');
    return LOCALES.indexOf(lang) >= 0 && path.indexOf('/' + lang + '/') >= 0 ? lang : 'en';
  }
  var LANG = pageLanguage();
  // data-home = start of the page language (site/de/ on German pages): a purchase ends in the language it began in.
  var home = LANG === 'en' ? root : document.documentElement.getAttribute('data-home') || root;
  var T = LANG === 'de' ? {
    check: 'Kauf prüfen', checking: 'Wir prüfen deine Zahlung…', closed: 'Kauf geschlossen – nichts wurde berechnet.',
    unclear: 'Kauf geschlossen. Falls eine Zahlung durchging, kommt dein Schlüssel per E-Mail.', buy: 'Jetzt kaufen',
    code: 'Hast du einen Code?', codeLabel: 'Rabattcode', mail: 'Bitte gib die E-Mail-Adresse deines Kaufs ein.', sending: 'Wird gesendet…',
    sent: 'Erledigt. Falls mit dieser Adresse ein Plugin gekauft wurde, ist der Schlüssel unterwegs. Schau auch im Spam-Ordner nach.',
    failed: 'Das hat nicht geklappt. Bitte schreib an support@secret.vip – wir helfen sofort.'
  } : {
    check: 'Check purchase', checking: 'Checking your payment…', closed: 'Checkout closed – nothing was charged.',
    unclear: 'Checkout closed. If a payment went through, your key arrives by email.', buy: 'Buy now',
    code: 'Have a code?', codeLabel: 'Discount code', mail: 'Please enter the email address you used for the purchase.', sending: 'Sending...',
    sent: 'Done. If this address bought a plugin, the key is on its way. Check your spam folder too.',
    failed: 'That did not work. Please write to support@secret.vip - we help right away.'
  };

  // ---- Kampagnen-Kennung (utm_*, ref) ----
  // Datenschutz: nie im Browser gespeichert (kein Cookie, kein Storage). Sie wird nur aus der
  // aktuellen Adresse gelesen, beim Klick auf "Buy now" an Paddle gegeben und an Links dieser
  // Seite zur eigenen Website angehaengt (tools/legal/texts/privacy.*.html, Abschnitt 5).
  var CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_content', 'utm_campaign', 'ref'];
  function campaignFromUrl() {
    var query = new URLSearchParams(location.search), out = {};
    CAMPAIGN_KEYS.forEach(function (key) {
      var value = (query.get(key) || '').trim();
      if (value && /^[A-Za-z0-9._-]{1,80}$/.test(value)) out[key] = value;
    });
    return out;
  }
  function carryCampaign() {
    var campaign = campaignFromUrl(), keys = Object.keys(campaign);
    if (!keys.length) return;
    all('a[href]').forEach(function (a) {
      var u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
      if (u.origin !== location.origin) return;
      var before = u.href;
      keys.forEach(function (key) { if (!u.searchParams.has(key)) u.searchParams.set(key, campaign[key]); });
      if (u.href !== before) a.setAttribute('href', u.href);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carryCampaign);
  else carryCampaign();

  // ---- Kaufen (Paddle Overlay-Checkout) ----
  // Datenschutz: Paddle.js (setzt das Cookie __cf_bm und laedt ProfitWell) laedt erst beim Klick auf
  // "Buy now" oder wenn ein Paddle-Zahlungslink (?_ptxn=...) auf dieser Seite landet - nie beim
  // blossen Seitenaufruf. Nur so stimmt "kein Cookie-Banner" (tools/legal/texts/privacy.*.html).
  function regularAmount(p) { return Number(p.price_amount === undefined ? p.price_eur : p.price_amount); }
  function launchAmount(p) { return Number(p.launch_amount === undefined ? p.launch_eur : p.launch_amount); }
  function currencyFor(p, cfg) { return p.currency || cfg.price_currency || 'EUR'; }
  function money(amount, currency) {
    // German pages write euros the German way ("39 €"); whole amounts keep no decimals, as before.
    if (currency === 'EUR' && LANG === 'de') {
      var whole = Number.isInteger(Number(amount));
      return new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2}).format(amount);
    }
    return currency === 'EUR' ? '€' + amount : new Intl.NumberFormat(LANG, {style: 'currency', currency: currency}).format(amount);
  }
  function minorScale(currency) {
    return Math.pow(10, new Intl.NumberFormat('en', {style: 'currency', currency: currency}).resolvedOptions().maximumFractionDigits);
  }
  function instant(value) {
    return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  }
  function activeOffer(p, now) {
    now = now === undefined ? Date.now() : now;
    var campaigns = p.campaigns || [];
    for (var i = campaigns.length - 1; i >= 0; i--) {
      var c = campaigns[i];
      if (c.discount_id && instant(c.starts_at) <= now && now <= instant(c.expires_at) &&
          Number.isFinite(c.amount) && c.amount >= 0 && c.amount < regularAmount(p)) return c;
    }
    // A launch sells through its own payment price (launch_price_id), so the checkout shows only the
    // launch amount; the older way (list price plus discount) stays as fallback while no own price exists.
    var launchPrice = launchPriceId(p);
    if (p.launch_active === false || !(launchPrice || p.discount_id) || !Number.isFinite(launchAmount(p)) ||
        launchAmount(p) < 0 || launchAmount(p) >= regularAmount(p)) return null;
    if (p.starts_at && !(instant(p.starts_at) <= now)) return null;
    // The existing launch without a deadline stays exactly as displayed today.
    if (p.expires_at !== null && p.expires_at !== undefined && !(instant(p.expires_at) >= now)) return null;
    return {amount: launchAmount(p), price_id: launchPrice, discount_id: launchPrice ? '' : p.discount_id, starts_at: p.starts_at, expires_at: p.expires_at, launch: true};
  }
  function launchPriceId(p) {
    return typeof p.launch_price_id === 'string' && /^pri_[a-z0-9]{10,}$/.test(p.launch_price_id) && p.launch_price_id !== p.price_id ? p.launch_price_id : '';
  }
  function activeDiscount(p, now) { return !!activeOffer(p, now); }
  function berlinParts(value) {
    return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).format(new Date(value));
  }
  function historyEntry(data, product, country, currency, active, now) {
    if (!data || !Array.isArray(data.entries) || !active) return null;
    now = now === undefined ? Date.now() : now;
    var generated = instant(data.generated_at), end = instant(active.starts_at);
    if (!Number.isFinite(generated) || !Number.isFinite(end) || generated < end || generated > now) return null;
    return data.entries.find(function (r) {
      if (!r || typeof r !== 'object') return false;
      var observed = instant(r.observed_at), start = instant(r.window_start);
      if (!Number.isFinite(start)) return false;
      var endParts = berlinParts(end), startParts = berlinParts(start);
      return r.product === product && r.country === country && r.currency === currency && r.complete === true &&
        Number.isInteger(r.amount) && r.amount >= 0 && instant(r.reduction_start) === end &&
        Number.isFinite(observed) && observed < end && end - observed <= 26 * 3600000 &&
        Date.parse(endParts.slice(0, 10)) - Date.parse(startParts.slice(0, 10)) === 30 * 86400000 &&
        endParts.slice(11) === startParts.slice(11);
    }) || null;
  }
  json(root + 'config.json').then(function (cfg) {
    var history = { entries: [] };
    // Country is explicit shop configuration, never inferred from the page language.
    // Other markets retain the plain price until their own price surface is configured.
    function renderPrices() {
      all('[data-price]').forEach(function (box) {
        var product = box.getAttribute('data-price'), p = (cfg.products || {})[product];
        if (!p) return;
        var active = activeOffer(p), currency = currencyFor(p, cfg), scale = minorScale(currency);
        var nowPrice = $('.now', box), was = $('.was', box), tag = $('.tag', box);
        if (nowPrice) nowPrice.textContent = money(active ? active.amount : regularAmount(p), currency);
        var entry = historyEntry(history, product, p.country || cfg.price_country, currency, active);
        var reference = active && entry && entry.amount > Math.round(active.amount * scale);
        if (!was && reference) {
          was = document.createElement('span'); was.className = 'was'; box.appendChild(was);
        }
        if (was) {
          was.hidden = !reference;
          if (reference) was.textContent = money(entry.amount / scale, currency);
        }
        var low = $('.price-lowest', box);
        if (!low && reference) {
          low = document.createElement('span'); low.className = 'price-lowest'; box.appendChild(low);
        }
        if (low) {
          low.hidden = !reference;
          if (reference && cfg.price_texts && cfg.price_texts[LANG]) low.textContent = cfg.price_texts[LANG].lowest.replace('{price}', money(entry.amount / scale, currency));
        }
        if (tag) {
          tag.hidden = !active;
          var texts = cfg.price_texts && cfg.price_texts[LANG];
          if (active && texts) {
            var date = active.expires_at && new Intl.DateTimeFormat(LANG === 'de' ? 'de-DE' : 'en-GB', {timeZone: 'Europe/Berlin', day: '2-digit', month: LANG === 'de' ? '2-digit' : 'short', year: 'numeric'}).format(new Date(active.expires_at));
            // From last_chance_from (e.g. Black Friday) until the same real end the label says "last chance".
            var lastChance = active.launch && texts.last_chance_until && instant(p.last_chance_from) <= Date.now();
            tag.textContent = date ? texts[lastChance ? 'last_chance_until' : active.launch ? 'launch_until' : 'campaign_until'].replace('{date}', date) : texts.launch;
          }
        }
        // A dated launch also says plainly what the price is afterwards (real deadline, no strike price).
        var thenTexts = cfg.price_texts && cfg.price_texts[LANG];
        var thenShown = !!(active && active.launch && active.expires_at && thenTexts && thenTexts.launch_then);
        var then = $('.price-then', box);
        if (!then && thenShown) {
          then = document.createElement('span'); then.className = 'price-then'; box.appendChild(then);
        }
        if (then) {
          then.hidden = !thenShown;
          if (thenShown) {
            var eventName = p.expires_event && thenTexts.events && thenTexts.events[p.expires_event];
            then.textContent = (eventName && thenTexts.launch_then_event ? thenTexts.launch_then_event.replace('{event}', eventName) : thenTexts.launch_then)
              .replace('{price}', money(regularAmount(p), currency));
          }
        }
      });
      all('[data-countdown]').forEach(function (el) {
        var p = (cfg.products || {})[el.getAttribute('data-countdown')];
        var active = p && activeOffer(p);
        el.hidden = !active || !active.expires_at;
      });
      all('[data-price-label]').forEach(function (el) {
        var p = (cfg.products || {})[el.getAttribute('data-price-label')];
        if (p) { var active = activeOffer(p); el.textContent = money(active ? active.amount : regularAmount(p), currencyFor(p, cfg)); }
      });
    }
    renderPrices();
    json(root + 'price-history.json').then(function (data) { history = data; renderPrices(); }, function () {});
    // A tab left open across the deadline must also lose the campaign display.
    if (typeof setInterval === 'function') setInterval(renderPrices, 1000);
    if (!cfg.paddle || !cfg.paddle.token) return;
    var purchaseAccess = '', completedUrl = '', navigating = false;
    var successBase = new URL(home + 'success/', location.href).href;
    function accessToken() {
      var bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    }
    // Paddle-Status beim Schliessen (developer.paddle.com/paddle-js/events/checkout-closed): nur
    // "completed"/"paid" heisst bezahlt; "draft"/"ready" ohne Zahlungsversuch ist ein Abbruch.
    var PAID = /^(completed|paid|billed)$/, OPEN = /^(draft|ready)$/;
    var paymentTried = false, closeRun = 0, buyBox = null;
    function goSuccess(access, transaction) {
      navigating = true;
      location.assign(successBase + '#access=' + encodeURIComponent(access) + '&transaction_id=' + encodeURIComponent(transaction || '') + '&closed=1');
    }
    // Hinweis bleibt auf der Seite, an der Stelle des Kaufknopfs; role=status liest ihn vor.
    function note(text, access) {
      var n = buyBox && $('.buy-note', buyBox);
      if (!n) return;
      n.textContent = text;
      if (access) {
        var a = document.createElement('a');
        a.href = successBase + '#access=' + encodeURIComponent(access) + '&closed=1';
        a.textContent = T.check;
        n.appendChild(document.createTextNode(' ')); n.appendChild(a);
      }
    }
    function paidOnServer(access) {
      return fetch(LICENSE + '/v1/checkout/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access: access, transaction_id: '' }), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (r) { return r.state === 'ready'; }, function () { return false; });
    }
    // Unklarer Fall (Zahlung begonnen oder Status fehlt): der Webhook kommt oft erst Sekunden spaeter,
    // darum ein paar Sekunden nachfragen. Lieber einmal zu viel auf die Warte-Seite als ein Kauf verloren.
    function confirmClosed(access, transaction, unclear) {
      var run = ++closeRun, tries = unclear ? 6 : 1;
      note(unclear ? T.checking : T.closed);
      (function ask() {
        paidOnServer(access).then(function (paid) {
          if (run !== closeRun || navigating) return;
          if (paid) return goSuccess(access, transaction);
          if (--tries > 0) return setTimeout(ask, 1500);
          if (unclear) note(T.unclear, access);
        });
      })();
    }
    function purchaseEvent(ev) {
      var data = ev.data || {};
      if (ev.name === 'checkout.payment.initiated') paymentTried = true;
      else if (ev.name === 'checkout.payment.failed' || ev.name === 'checkout.payment.error') paymentTried = false;
      else if (ev.name === 'checkout.completed') {
        var access = (data.custom_data || {}).checkout_access || purchaseAccess;
        completedUrl = successBase + '#access=' + encodeURIComponent(access) + '&transaction_id=' + encodeURIComponent(data.transaction_id || '');
        // Replace this page in the tab history: "back" cannot reopen a paid checkout, nothing is stored.
        // Navigate before close emits checkout.closed.
        navigating = true;
        location.replace(completedUrl);
        try { Paddle.Checkout.close(); } catch (_) {}
      } else if (ev.name === 'checkout.closed' && !navigating) {
        if (completedUrl) return location.replace(completedUrl);
        var closedAccess = (data.custom_data || {}).checkout_access || purchaseAccess;
        if (!closedAccess) return;
        // A missed completion event still reaches the waiting page; a plain abort stays here.
        if (PAID.test(data.status)) return goSuccess(closedAccess, data.transaction_id);
        confirmClosed(closedAccess, data.transaction_id, paymentTried || !OPEN.test(data.status));
      }
    }
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
        Paddle.Initialize({ token: cfg.paddle.token, eventCallback: purchaseEvent, checkout: { settings: { successUrl: successBase, locale: LANG } } });
        paddleState = 'ready';
        waiting.splice(0).forEach(function (f) { f(); });
      };
      s.onerror = function () { paddleState = ''; waiting = []; };
      document.head.appendChild(s);
    }
    if (/[?&]_ptxn=/.test(location.search)) withPaddle(function () {});
    var query = new URLSearchParams(location.search);
    // Einmalcode gilt fuer jedes Produkt im gemeinsamen Shop; ungueltige Werte werden ignoriert.
    // Paddle-Codes: nur Buchstaben und Ziffern, bis 32 Zeichen, Gross/klein egal (API: create discount).
    function cleanCode(v) { v = String(v || '').replace(/\s+/g, '').toUpperCase(); return /^[A-Z0-9]{1,32}$/.test(v) ? v : ''; }
    var discountCode = cleanCode(query.get('code'));
    // Stil fuer Codefeld und Hinweis lebt hier statt in style.css: dessen Cache-Marke steckt in den
    // erzeugten Rechtsseiten (tools/legal/build_legal.py --check), der Kaufweg bleibt so in einer Datei.
    function addBuyStyle() {
      if ($('#buy-style')) return;
      var st = document.createElement('style');
      st.id = 'buy-style';
      st.textContent = '.buy-note{flex:1 1 100%;margin:-4px 0 0;font-size:14px;line-height:1.5;color:var(--muted)}'
        + '.buy-note:empty{margin-top:-14px}.buy-note a{color:var(--text);text-underline-offset:3px}'
        + '.buy-code{flex:1 1 100%;display:flex}'
        + '.buy-code-toggle{background:none;border:0;padding:6px 4px;color:var(--muted);font:14px var(--sans);text-decoration:underline;text-decoration-color:var(--line2);text-underline-offset:3px;cursor:pointer}'
        + '.buy-code-toggle:hover{color:var(--text)}'
        + '.buy-code input{flex:0 1 260px;min-width:0;min-height:44px;background:var(--bg2);border:1px solid var(--line);border-radius:999px;color:var(--text);font:15px var(--sans);letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:0 20px;outline:none;transition:border-color .15s}'
        + '.buy-code input::placeholder{color:var(--faint);letter-spacing:0;text-transform:none}.buy-code input:focus{border-color:var(--accent)}';
      document.head.appendChild(st);
    }
    all('[data-buy]').forEach(function (b) {
      var p = (cfg.products || {})[b.getAttribute('data-buy')];
      if (!p || !p.price_id) return;
      // Verkauf erst nach "Go Release" offen; ?kauftest=1 fuer den eigenen Test-Kauf
      if (!cfg.sale_open && !/[?&]kauftest=1\b/.test(location.search)) return;
      b.disabled = false; b.textContent = T.buy;
      // Paddle zeigt "Add discount" nur ohne angewendeten Rabatt; der Start-Rabatt belegt den Platz.
      // Darum ein ruhiges Codefeld direkt am Kaufknopf; ein Code ersetzt den Start-Rabatt.
      addBuyStyle();
      var box = b.parentNode, codeRow = document.createElement('div');
      codeRow.className = 'buy-code';
      codeRow.innerHTML = '<button type="button" class="buy-code-toggle" aria-expanded="false">' + T.code + '</button>'
        + '<input type="text" hidden maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="' + T.codeLabel + '" placeholder="' + T.codeLabel + '">';
      var toggle = $('button', codeRow), input = $('input', codeRow), status = document.createElement('p');
      status.className = 'buy-note'; status.setAttribute('role', 'status');
      function showCode() { toggle.hidden = true; toggle.setAttribute('aria-expanded', 'true'); input.hidden = false; }
      toggle.onclick = function () { showCode(); input.focus(); };
      input.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); b.click(); } };
      if (discountCode) { input.value = discountCode; showCode(); }
      box.insertBefore(status, b.nextSibling); box.appendChild(codeRow);
      b.onclick = function () {
        purchaseAccess = accessToken();
        completedUrl = ''; navigating = false; paymentTried = false; closeRun++;
        buyBox = box; status.textContent = '';
        var code = cleanCode(input.value);
        var selectedOffer = activeOffer(p);
        // Launch without a code: its own price, no discount, so the checkout shows only that amount.
        // A personal code keeps the list price it was made for (codes are tied to that price).
        var ownPrice = !code && selectedOffer && selectedOffer.price_id;
        var o = { items: [{ priceId: ownPrice || p.price_id, quantity: 1 }], settings: { displayMode: 'overlay', theme: 'dark', showAddDiscounts: !ownPrice, allowDiscountRemoval: true, locale: LANG, successUrl: successBase + '#access=' + purchaseAccess } };
        if (code) o.discountCode = code;
        else if (selectedOffer && selectedOffer.discount_id) o.discountId = selectedOffer.discount_id;
        var custom = { product: p.license_product || b.getAttribute('data-buy'), checkout_access: purchaseAccess, locale: LANG };
        // Read at click time from the current address only.
        var campaign = campaignFromUrl();
        Object.keys(campaign).forEach(function (key) { custom[key] = campaign[key]; });
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
    if (mail.indexOf('@') < 1) { note.textContent = T.mail; return; }
    btn.disabled = true; note.textContent = T.sending;
    fetch(LICENSE + '/v1/key/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail }) })
      .then(function (r) { return r.json(); })
      .then(function () { note.textContent = T.sent; })
      .catch(function () { note.textContent = T.failed; })
      .then(function () { btn.disabled = false; });
  });
})();

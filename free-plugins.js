// BENUTZT-WENN: Shop und Download-Seite kostenlose Produkte aus site/config.json anzeigen.
// Ein neuer Gratis-Eintrag nutzt denselben Download- und freiwilligen Opt-in-Weg.
(function () {
  'use strict';
  var html = document.documentElement;
  var root = html.getAttribute('data-root') || '';
  // Page language from <html lang data-home> (site/de/ is German): words below, product texts from config.json "<lang>".
  var home = html.getAttribute('data-home') || root, lang = html.lang === 'de' ? 'de' : 'en';
  var T = lang === 'de' ? {
    macBeta: 'Mac-Beta: unsigniert, bis eine Signatur möglich ist.', winBeta: 'Windows-Beta: unsigniert, bis eine Signatur möglich ist.',
    download: 'Laden für ', missing: 'Quellen und Builds fehlen – Download noch nicht verfügbar.',
    pending: 'Download wartet auf die Freigabe.', building: 'Build in Vorbereitung – Download noch nicht verfügbar.',
    page: 'Produktseite', notFound: 'Kostenloses Tool nicht gefunden.', failed: 'Kostenlose Tools lassen sich gerade nicht laden.',
    consent: 'Bitte setze zuerst den Haken für den Newsletter.', confirm: 'Bitte schau in dein Postfach und bestätige den Link.',
    later: 'Bitte versuch es später noch einmal.'
  } : {
    macBeta: 'Mac beta: unsigned until signing is available.', winBeta: 'Windows beta: unsigned until signing is available.',
    download: 'Download for ', missing: 'Source and builds missing — download not yet available.',
    pending: 'Download awaits release review.', building: 'Build in preparation — download not yet available.',
    page: 'Product page', notFound: 'Free tool not found.', failed: 'Free tools cannot be loaded right now.',
    consent: 'Please choose the newsletter checkbox first.', confirm: 'Please check your inbox and confirm the link.',
    later: 'Please try again later.'
  };
  // English texts sit on the product itself, other languages under products.<id>.<lang>; a missing translation shows nothing rather than English.
  function said(product, key) { return lang === 'en' ? product[key] : (product[lang] || {})[key]; }
  var target = document.querySelector('[data-free-products], [data-free-detail]');
  if (!target) return;
  var isDetail = target.hasAttribute('data-free-detail');
  // download/ lists installers only, prices belong to the shop.
  var noPrice = target.hasAttribute('data-no-price');
  var selected = isDetail ? new URLSearchParams(location.search).get('product') : null;
  function getJson(file) {
    return fetch(root + file, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(file);
      return r.json();
    });
  }
  function element(name, text, className) {
    var node = document.createElement(name);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render(config, downloads) {
    var products = (config && config.products) || {};
    Object.keys(products).forEach(function (id) {
      var product = products[id];
      if (Number(product.price_eur) !== 0 || product.kind !== 'free' || (isDetail && selected !== id)) return;
      var card = element('article', '', 'free-card');
      card.appendChild(element('h3', product.name || id));
      if (!noPrice) {
        card.appendChild(element('p', '€0', 'free-value'));
        card.appendChild(element('div', '', 'free-line'));
      }
      if (said(product, 'summary')) card.appendChild(element('p', said(product, 'summary')));
      if (said(product, 'formats')) card.appendChild(element('p', said(product, 'formats')));
      if (product.mac_beta_unsigned) card.appendChild(element('p', T.macBeta, 'small'));
      if (product.windows_beta_unsigned && product.status !== 'source_missing') card.appendChild(element('p', T.winBeta, 'small'));
      var actions = element('div', '', 'free-actions');
      var files = ((downloads || {}).plugins || {})[id] || {};
      ['mac', 'win'].forEach(function (platform) {
        var link = files[platform];
        if (typeof link !== 'string') return;
        var resolved;
        try { resolved = new URL(/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link) ? link : root + link, location.href); } catch (e) { return; }
        if (resolved.protocol !== 'https:' && resolved.origin !== location.origin) return;
        var button = element('a', T.download + (platform === 'mac' ? 'Mac' : 'Windows'), 'btn');
        button.href = resolved.href;
        if (resolved.origin === location.origin) button.setAttribute('download', '');
        button.rel = 'noopener noreferrer';
        actions.appendChild(button);
      });
      if (actions.childNodes.length) {
        card.appendChild(actions);
        if (files.version) card.appendChild(element('p', 'Version ' + files.version, 'small'));
      } else {
        card.appendChild(element('p', product.status === 'source_missing' ?
          T.missing :
          product.status === 'release_pending' ? T.pending :
          T.building, 'small'));
      }
      if (!isDetail) {
        var details = element('a', T.page, 'free-detail-link');
        details.href = home + 'free/?product=' + encodeURIComponent(id);
        card.appendChild(details);
      } else {
        document.title = (product.name || id) + ' – Secret Audio';
        var heading = document.querySelector('h1');
        if (heading) heading.textContent = product.name || id;
      }
      target.appendChild(card);
    });
    if (isDetail && !target.childNodes.length) target.textContent = T.notFound;
  }
  Promise.all([getJson('config.json'), getJson('downloads.json')])
    .then(function (result) { render(result[0], result[1]); })
    .catch(function () { target.textContent = T.failed; });

  // The checkbox is independent of downloads and starts unchecked.
  // PR 9 owns the server endpoint and Double Opt-in confirmation.
  var form = document.querySelector('.free-newsletter-form');
  if (!form) return;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var status = form.querySelector('.free-news-note');
    var consent = form.querySelector('input[name="consent"]');
    if (!consent.checked) { status.textContent = T.consent; return; }
    var email = form.querySelector('input[name="email"]').value.trim();
    var button = form.querySelector('button');
    button.disabled = true;
    fetch('https://license.secret.vip/v1/newsletter/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, consent: true })
    }).then(function (response) {
      if (!response.ok) throw new Error('subscribe');
      status.textContent = T.confirm;
      form.reset();
    }).catch(function () { status.textContent = T.later; })
      .then(function () { button.disabled = false; });
  });
})();

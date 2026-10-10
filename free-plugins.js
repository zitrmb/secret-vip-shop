// BENUTZT-WENN: Shop und Download-Seite kostenlose Produkte aus site/config.json anzeigen.
// Ein neuer Gratis-Eintrag nutzt denselben Download- und freiwilligen Opt-in-Weg.
(function () {
  'use strict';
  var root = document.documentElement.getAttribute('data-root') || '';
  var target = document.querySelector('[data-free-products], [data-free-detail]');
  if (!target) return;
  var isDetail = target.hasAttribute('data-free-detail');
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
      card.appendChild(element('p', '€0', 'free-value'));
      card.appendChild(element('div', '', 'free-line'));
      if (product.summary) card.appendChild(element('p', product.summary));
      if (product.formats) card.appendChild(element('p', product.formats));
      if (product.mac_beta_unsigned) card.appendChild(element('p', 'Mac beta: unsigned until signing is available.', 'small'));
      if (product.windows_beta_unsigned && product.status !== 'source_missing') card.appendChild(element('p', 'Windows beta: unsigned until signing is available.', 'small'));
      var actions = element('div', '', 'free-actions');
      var files = ((downloads || {}).plugins || {})[id] || {};
      ['mac', 'win'].forEach(function (platform) {
        var link = files[platform];
        if (typeof link !== 'string') return;
        var resolved;
        try { resolved = new URL(/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link) ? link : root + link, location.href); } catch (e) { return; }
        if (resolved.protocol !== 'https:' && resolved.origin !== location.origin) return;
        var button = element('a', 'Download for ' + (platform === 'mac' ? 'Mac' : 'Windows'), 'btn');
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
          'Source and builds missing — download not yet available.' :
          product.status === 'release_pending' ? 'Download awaits release review.' :
          'Build in preparation — download not yet available.', 'small'));
      }
      if (!isDetail) {
        var details = element('a', 'Product page', 'free-detail-link');
        details.href = root + 'free/?product=' + encodeURIComponent(id);
        card.appendChild(details);
      } else {
        document.title = (product.name || id) + ' - Secret VIP Plugins';
        var heading = document.querySelector('h1');
        if (heading) heading.textContent = product.name || id;
      }
      target.appendChild(card);
    });
    if (isDetail && !target.childNodes.length) target.textContent = 'Free tool not found.';
  }
  Promise.all([getJson('config.json'), getJson('downloads.json')])
    .then(function (result) { render(result[0], result[1]); })
    .catch(function () { target.textContent = 'Free tools cannot be loaded right now.'; });

  // The checkbox is independent of downloads and starts unchecked.
  // PR 9 owns the server endpoint and Double Opt-in confirmation.
  var form = document.querySelector('.free-newsletter-form');
  if (!form) return;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var status = form.querySelector('.free-news-note');
    var consent = form.querySelector('input[name="consent"]');
    if (!consent.checked) { status.textContent = 'Please choose the newsletter checkbox first.'; return; }
    var email = form.querySelector('input[name="email"]').value.trim();
    var button = form.querySelector('button');
    button.disabled = true;
    fetch('https://license.secret.vip/v1/newsletter/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, consent: true })
    }).then(function (response) {
      if (!response.ok) throw new Error('subscribe');
      status.textContent = 'Please check your inbox and confirm the link.';
      form.reset();
    }).catch(function () { status.textContent = 'Please try again later.'; })
      .then(function () { button.disabled = false; });
  });
})();

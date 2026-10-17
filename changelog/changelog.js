// BENUTZT-WENN: changelog/ oder de/changelog/ zeigt die Aenderungen je Plugin aus changelog.json.
// Sprache aus <html lang data-root>: Englisch liest "groups", Deutsch "groups_de" desselben Eintrags.
// tools/release/release_state.py ersetzt einen Eintrag je Version ganz; fehlt danach "groups_de",
// zeigt die deutsche Seite nur Version und Hinweis mit Link auf die englische Seite, nie englische Saetze.
(function () {
  'use strict';
  var html = document.documentElement, root = html.getAttribute('data-root') || '../';
  var de = html.lang === 'de';
  var T = de ? {
    labels: { Neu: 'Neu', Besser: 'Besser', Behoben: 'Behoben' }, key: 'groups_de',
    only: 'Die Änderungen dieser Version gibt es bisher nur auf Englisch: ', link: 'Änderungen ansehen',
    none: 'Änderungen erscheinen hier mit der nächsten Version.'
  } : {
    labels: { Neu: 'New', Besser: 'Improved', Behoben: 'Fixed' }, key: 'groups',
    none: 'Changes will appear here with the next release.'
  };
  var box = document.getElementById('changes');
  function json(file) { return fetch(root + file, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(file); return r.json(); }); }
  function el(name, text) { var n = document.createElement(name); if (text) n.textContent = text; return n; }
  Promise.all([json('config.json'), json('changelog.json')]).then(function (res) {
    var config = res[0], log = res[1];
    Object.keys(config.products || {}).forEach(function (id) {
      var product = config.products[id], data = (log.plugins || {})[id];
      if (!data) return;
      var article = el('article');
      article.appendChild(el('h2', (product.name || id) + ' ' + data.version));
      var groups = data[T.key];
      if (!groups) {
        var p = el('p', T.only), a = el('a', T.link);
        a.href = root + 'changelog/'; a.hreflang = 'en';
        p.appendChild(a); article.appendChild(p);
      } else {
        Object.keys(T.labels).forEach(function (key) {
          var items = groups[key] || [];
          if (!items.length) return;
          article.appendChild(el('h3', T.labels[key]));
          var list = el('ul');
          items.forEach(function (item) { list.appendChild(el('li', item)); });
          article.appendChild(list);
        });
      }
      box.appendChild(article);
    });
  }).catch(function () { box.textContent = T.none; });
})();

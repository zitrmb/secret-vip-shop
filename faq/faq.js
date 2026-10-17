/* BENUTZT-WENN: Die öffentliche Hilfe aus derselben FAQ-Datei wie der Support angezeigt wird (site/faq/ englisch, site/de/faq/ deutsch). */
'use strict';
(function () {
  // Language and the way back to site/ come from the page itself (<html lang data-root>), never from storage.
  const html = document.documentElement;
  const lang = html.lang === 'de' ? 'de' : 'en';
  const root = html.dataset.root || '../';
  const product = document.getElementById('product');
  const search = document.getElementById('search');
  const list = document.getElementById('faq-list');
  const count = document.getElementById('faq-count');
  const error = document.getElementById('faq-error');
  let entries = [];
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) search.value = params.get('q').slice(0, 100);
  const ui = {
    de: { results: 'Antworten', empty: 'Keine passende Antwort. Schreib uns gern.', failed: 'Die Hilfe konnte nicht geladen werden. Schreib uns gern.' },
    en: { results: 'answers', empty: 'No matching answer. Please write to us.', failed: 'Help could not be loaded. Please write to us.' }
  }[lang];
  function render() {
    const query = search.value.trim().toLocaleLowerCase(lang);
    const matches = entries.filter(item => (item.product === '*' || item.product === product.value) && (!query || [item.question[lang], item.answer[lang], ...item.terms[lang]].join(' ').toLocaleLowerCase(lang).includes(query)));
    list.replaceChildren();
    for (const item of matches) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const answer = document.createElement('p');
      summary.textContent = item.question[lang];
      answer.textContent = item.answer[lang];
      details.append(summary, answer);
      list.append(details);
    }
    count.textContent = matches.length + ' ' + ui.results;
    if (!matches.length && entries.length) count.textContent += ' · ' + ui.empty;
  }
  Promise.all([
    fetch(root + 'config.json').then(response => { if (!response.ok) throw Error('catalog'); return response.json(); }),
    fetch(root + 'faq/faq.json').then(response => { if (!response.ok) throw Error('faq'); return response.json(); })
  ]).then(([catalog, knowledge]) => {
    entries = knowledge.entries || [];
    for (const [id, item] of Object.entries(catalog.products || {})) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = item.name || id;
      product.append(option);
    }
    if (!product.options.length) throw Error('products');
    render();
  }).catch(() => {
    error.hidden = false;
    error.textContent = ui.failed;
  });
  for (const control of [product, search]) control.addEventListener('input', render);
})();

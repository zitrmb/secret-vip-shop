/* BENUTZT-WENN: Die öffentliche Hilfe aus derselben FAQ-Datei wie der Support angezeigt wird. */
'use strict';
(function () {
  const language = document.getElementById('language');
  const product = document.getElementById('product');
  const search = document.getElementById('search');
  const list = document.getElementById('faq-list');
  const count = document.getElementById('faq-count');
  const error = document.getElementById('faq-error');
  let entries = [];
  const params = new URLSearchParams(window.location.search);
  if (params.get('lang') === 'en') language.value = 'en';
  if (params.has('q')) search.value = params.get('q').slice(0, 100);
  const ui = {
    de: { title: 'Hilfe', intro: 'Antworten zu Installation, Lizenz, Updates und Erstattung.', language: 'Sprache', product: 'Plugin', search: 'Suche', placeholder: 'Frage oder Stichwort', contact: 'Weitere Fragen?', write: 'Schreib uns.', results: 'Antworten', empty: 'Keine passende Antwort. Schreib uns gern.', failed: 'Die Hilfe konnte nicht geladen werden. Schreib uns gern.' },
    en: { title: 'Help', intro: 'Answers about installation, licenses, updates and refunds.', language: 'Language', product: 'Plugin', search: 'Search', placeholder: 'Question or keyword', contact: 'More questions?', write: 'Write to us.', results: 'answers', empty: 'No matching answer. Please write to us.', failed: 'Help could not be loaded. Please write to us.' }
  };
  function render() {
    const lang = language.value;
    const t = ui[lang];
    document.documentElement.lang = lang;
    document.getElementById('page-title').textContent = t.title;
    document.getElementById('page-intro').textContent = t.intro;
    document.getElementById('language-label').textContent = t.language;
    document.getElementById('product-label').textContent = t.product;
    document.getElementById('search-label').textContent = t.search;
    search.placeholder = t.placeholder;
    const contact = document.getElementById('faq-contact');
    contact.firstChild.textContent = t.contact + ' ';
    contact.querySelector('a').textContent = t.write;
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
    count.textContent = matches.length + ' ' + t.results;
    if (!matches.length && entries.length) count.textContent += ' · ' + t.empty;
  }
  Promise.all([
    fetch('../config.json').then(response => { if (!response.ok) throw Error('catalog'); return response.json(); }),
    fetch('faq.json').then(response => { if (!response.ok) throw Error('faq'); return response.json(); })
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
    error.textContent = ui[language.value].failed;
  });
  language.addEventListener('input', () => { search.value = ''; render(); });
  for (const control of [product, search]) control.addEventListener('input', render);
})();

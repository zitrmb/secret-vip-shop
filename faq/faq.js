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
  // Own help page per plugin; faq/help-pages.json (build_help_pages.py) is the only map. Missing map: hub works without links.
  const helpLine = document.getElementById('product-help-line');
  const helpLink = document.getElementById('product-help');
  const helpList = document.getElementById('faq-plugin-links');
  let helpPages = new Map();
  let entries = [];
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) search.value = params.get('q').slice(0, 100);
  const ui = {
    de: { results: 'Antworten', open: 'Hilfe-Seite für {name}', empty: 'Keine passende Antwort. Schreib uns gern.', failed: 'Die Hilfe konnte nicht geladen werden. Schreib uns gern.' },
    en: { results: 'answers', open: 'Help page for {name}', empty: 'No matching answer. Please write to us.', failed: 'Help could not be loaded. Please write to us.' }
  }[lang];
  // A web address stays one block (span.faq-url, faq.css) that moves to the next line as a whole; only if it is wider
  // than the line it wraps after each run of slashes and before each dot (<wbr>, the text stays the same) instead of
  // cutting a word. The block is the whole word around the address. build_help_pages.py builds the help pages the same way.
  const urlPattern = /(\S*?)(https?:\/\/\S+?)([.,;:!?)]*)(?=\s|$)/g;
  function answerNodes(text) {
    const nodes = [];
    let at = 0;
    for (const match of text.matchAll(urlPattern)) {
      if (match.index > at) nodes.push(text.slice(at, match.index));
      const block = document.createElement('span');
      block.className = 'faq-url';
      if (match[1]) block.append(match[1]);
      match[2].replace(/\/+(?=[^\/])/g, '$&\0').replace(/\./g, '\0.').split('\0').filter(Boolean).forEach((part, i) => {
        if (i) block.append(document.createElement('wbr'));
        block.append(part);
      });
      if (match[3]) block.append(match[3]);
      nodes.push(block);
      at = match.index + match[0].length;
    }
    if (at < text.length) nodes.push(text.slice(at));
    return nodes;
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase(lang);
    const matches = entries.filter(item => (item.product === '*' || item.product === product.value) && (!query || [item.question[lang], item.answer[lang], ...item.terms[lang]].join(' ').toLocaleLowerCase(lang).includes(query)));
    list.replaceChildren();
    for (const item of matches) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const answer = document.createElement('p');
      summary.textContent = item.question[lang];
      answer.append(...answerNodes(item.answer[lang]));
      details.append(summary, answer);
      list.append(details);
    }
    count.textContent = matches.length + ' ' + ui.results;
    if (!matches.length && entries.length) count.textContent += ' · ' + ui.empty;
    const page = helpPages.get(product.value);
    if (helpLine) helpLine.hidden = !page;
    if (page) {
      helpLink.href = page;
      helpLink.textContent = ui.open.replace('{name}', product.options[product.selectedIndex].textContent);
    }
  }
  Promise.all([
    fetch(root + 'config.json').then(response => { if (!response.ok) throw Error('catalog'); return response.json(); }),
    fetch(root + 'faq/faq.json').then(response => { if (!response.ok) throw Error('faq'); return response.json(); }),
    fetch(root + 'faq/help-pages.json').then(response => response.ok ? response.json() : {}).catch(() => ({}))
  ]).then(([catalog, knowledge, help]) => {
    entries = knowledge.entries || [];
    for (const [id, item] of Object.entries({ ...(catalog.products || {}), ...(knowledge.products || {}) })) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = item.name || id;
      product.append(option);
    }
    if (!product.options.length) throw Error('products');
    // Same order and names as the selection; only products with their own page get a link.
    if (helpList) {
      for (const option of product.options) {
        const href = (help.pages || {})[option.value];
        if (typeof href !== 'string' || !/^[a-z0-9-]+\/$/.test(href)) continue;
        helpPages.set(option.value, href);
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = href;
        link.textContent = option.textContent;
        item.append(link);
        helpList.append(item);
      }
      document.getElementById('faq-plugins').hidden = !helpPages.size;
    }
    // ?product=<id> opens the help of one plugin directly (link from a plugin or a mail); unknown ids keep the first entry.
    const wanted = params.get('product');
    if (wanted && Array.from(product.options).some(option => option.value === wanted)) product.value = wanted;
    render();
  }).catch(() => {
    error.hidden = false;
    error.textContent = ui.failed;
  });
  for (const control of [product, search]) control.addEventListener('input', render);
})();

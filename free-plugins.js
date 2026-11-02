(function () {
'use strict';
var html = document.documentElement;
var root = html.getAttribute('data-root') || '';
var home = html.getAttribute('data-home') || root;
var lang = html.lang === 'de' ? 'de' : 'en';
var target = document.querySelector('[data-free-products], [data-free-detail]');
if (!target) return;
var isDetail = target.hasAttribute('data-free-detail');
var noPrice = target.hasAttribute('data-no-price');
var selected = isDetail ? new URLSearchParams(location.search).get('product') : null;
function element(name, text, className) {
var result = document.createElement(name);
if (text) result.textContent = text;
if (className) result.className = className;
return result;
}
function render(data, downloads) {
var products = data.config.products || {}, text = data.text;
var ids = Object.keys(products).filter(function (id) {
var product = products[id];
return Number(product.price_eur) === 0 && product.kind === 'free' && (!isDetail || !selected || selected === id);
});
if (lang !== 'en' && ids.some(function (id) {
var p = products[id];
return ['summary', 'formats'].some(function (key) { return p[key] && !(p[lang] && p[lang][key]); });
})) { window.SecretFreeDownload.englishPage(); return; }
target.replaceChildren();
target.removeAttribute('aria-busy');
ids.forEach(function (id) {
var product = products[id], words = lang === 'en' ? product : product[lang];
var card = element('article', '', 'free-card');
card.appendChild(element('h3', product.name));
if (!noPrice) {
card.appendChild(element('p', '€0', 'free-value'));
card.appendChild(element('div', '', 'free-line'));
}
var published = ((downloads || {}).plugins || {})[id] || {};
['summary', 'formats'].forEach(function (key) {
if (key === 'formats' && product.status === 'coming_soon' && (published.mac || published.win)) return;
if (words && words[key]) card.appendChild(element('p', words[key]));
});
var fallback = element('div'); fallback.setAttribute('data-free-download-fallback', '');
if (product.mac_beta_unsigned) fallback.appendChild(element('p', text.macBeta, 'small'));
if (product.windows_beta_unsigned && product.status !== 'source_missing') fallback.appendChild(element('p', text.winBeta, 'small'));
var actions = element('div', '', 'free-actions');
var files = ((downloads || {}).plugins || {})[id] || {};
['mac', 'win'].forEach(function (platform) {
var link = files[platform]; if (typeof link !== 'string') return;
var resolved;
try { resolved = new URL(/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link) ? link : root + link, location.href); } catch (error) { return; }
if (resolved.protocol !== 'https:' && resolved.origin !== location.origin) return;
var button = element('a', text.download + (platform === 'mac' ? 'Mac' : 'Windows'), 'btn');
button.href = resolved.href;
if (resolved.origin === location.origin) button.setAttribute('download', '');
button.rel = 'noopener noreferrer'; actions.appendChild(button);
});
if (actions.childNodes.length) {
fallback.appendChild(actions);
if (files.version) fallback.appendChild(element('p', text.version + files.version, 'small'));
} else {
fallback.appendChild(element('p', product.status === 'source_missing' ? text.missing :
product.status === 'release_pending' ? text.pending : text.building, 'small'));
}
card.appendChild(fallback);
window.SecretFreeDownload.mount(card, id, data);
if (!isDetail) {
var details = element('a', text.page, 'free-detail-link');
details.href = product.page ? home + product.page : home + 'free/?product=' + encodeURIComponent(id);
card.appendChild(details);
} else if (selected) {
document.title = product.name + ' – Secret Audio';
var heading = document.querySelector('h1'); if (heading) heading.textContent = product.name;
}
target.appendChild(card);
});
if (isDetail && !target.childNodes.length) target.textContent = text.notFound;
}
window.SecretFreeDownload.load().then(function (data) {
return fetch(root + 'downloads.json', { cache: 'no-store', credentials: 'omit' }).then(function (response) {
if (!response.ok) return {};
return response.json();
}).catch(function () { return {}; }).then(function (downloads) { render(data, downloads); });
}).catch(function () {
target.removeAttribute('aria-busy');
if (target.dataset.freeFailure) target.textContent = target.dataset.freeFailure;
});
}());

(function () {
'use strict';
var html = document.documentElement;
var root = html.getAttribute('data-root') || '';
var home = html.getAttribute('data-home') || root;
var language = html.lang || 'en';
var pending;
function keepWords(container) {
if (['ja', 'zh-CN'].indexOf(language) === -1 || typeof Intl.Segmenter !== 'function') return;
var segmenter = new Intl.Segmenter(language, { granularity: 'word' });
var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
acceptNode: function (entry) {
return entry.nodeValue.trim() && entry.parentElement &&
!entry.parentElement.closest('script,style,textarea,pre,[data-free-word]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
}
});
var entries = [];
for (var entry = walker.nextNode(); entry; entry = walker.nextNode()) entries.push(entry);
entries.forEach(function (entry) {
var fragment = document.createDocumentFragment();
Array.from(segmenter.segment(entry.nodeValue)).forEach(function (part) {
if (!part.isWordLike) { fragment.appendChild(document.createTextNode(part.segment)); return; }
var word = document.createElement('span'); word.dataset.freeWord = ''; word.style.whiteSpace = 'nowrap';
word.textContent = part.segment; fragment.appendChild(word);
});
var group = document.createElement('span'); group.dataset.freeWord = 'group';
group.appendChild(fragment); entry.replaceWith(group);
});
}
keepWords(document.body);
function getJson(file) {
return fetch(root + file, { cache: 'no-store', credentials: 'omit' }).then(function (response) {
if (!response.ok) throw new Error('catalogue');
return response.json();
});
}
function englishPage() {
var link = document.querySelector('a.lang-switch[hreflang="en"]');
if (!link) return;
var target = new URL(link.href, location.href);
location.replace(target.pathname + location.search + location.hash);
}
function complete(text, original) {
return text && original && Object.keys(original).every(function (key) {
return typeof original[key] === 'object' ? complete(text[key], original[key]) :
typeof text[key] === 'string' && (original[key].length === 0 || text[key].length > 0);
});
}
function load() {
if (!pending) pending = Promise.all([getJson('config.json'), getJson('free-download-texts.json')]).then(function (data) {
var texts = data[1];
if (!complete(texts[language], texts.en)) {
if (language !== 'en') englishPage();
throw new Error('language');
}
var value = { config: data[0], text: texts[language], lang: language };
return getJson('downloads.json').catch(function () { return {}; }).then(function (catalogue) { value.downloads = catalogue; return value; });
});
return pending;
}
function node(tag, text, cls) {
var result = document.createElement(tag);
if (text) result.textContent = text;
if (cls) result.className = cls;
return result;
}
function mount(host, id, data) {
var config = data.config, text = data.text;
var product = (config.products || {})[id];
if (host.querySelector('.free-download-form') ||
!product || product.kind !== 'free' || Number(product.price_eur) !== 0 ||
!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.free_request_product || '')) return false;
var endpoint;
try { endpoint = new URL(config.free_download.endpoint); } catch (error) { return false; }
if (endpoint.protocol !== 'https:' && endpoint.origin !== location.origin) return false;
var fallbackNodes = host.querySelectorAll('[data-free-download-fallback]');
fallbackNodes.forEach(function (fallback) { fallback.textContent = text.pending; });
if (!config.free_download || config.free_download.enabled !== true) return false;
var approved = text.approved.form;
var verification = text.verification;
var offer = node('div', '', 'free-download-offer');
offer.appendChild(node('h3', approved.title.replace('Secret Analyser 1.0', product.name)));
fallbackNodes.forEach(function (fallback) { fallback.hidden = true; });
var form = node('form', '', 'free-download-form');
form.setAttribute('aria-label', product.name + ' — ' + text.submit);
form.noValidate = true;
var address = node('input');
address.type = 'email'; address.name = 'email'; address.required = true;
address.autocomplete = 'email'; address.maxLength = 254; address.placeholder = text.placeholder;
var emailLabel = node('label', text.email, 'free-email-label');
emailLabel.appendChild(address);
var button = node('button', text.submit, 'btn'); button.type = 'submit';
var controls = node('div', '', 'free-download-controls');
controls.appendChild(emailLabel); controls.appendChild(button);
var notice = node('p', verification.notice, 'small free-download-privacy');
var newsletter = node('input');
newsletter.type = 'checkbox'; newsletter.name = 'newsletter'; newsletter.checked = false; newsletter.defaultChecked = false;
newsletter.id = 'free-newsletter-' + id; newsletter.setAttribute('aria-describedby', newsletter.id + '-help');
var choice = node('label', '', 'free-newsletter-choice');
choice.appendChild(newsletter); choice.appendChild(node('span', text.newsletter));
var help = node('p', text.newsletter_help, 'small free-newsletter-help');
help.id = newsletter.id + '-help';
function linkedParagraph(value, placeholder, url) {
var paragraph = node('p', '', 'small free-download-privacy');
var match = value.match(/^(.*?)\[([^\]]+)\]\(\{\{[^}]+\}\}\)(.*)$/);
if (!match) { paragraph.textContent = value; return paragraph; }
paragraph.appendChild(document.createTextNode(match[1]));
var link = node('a', match[2]); link.href = url; paragraph.appendChild(link);
paragraph.appendChild(document.createTextNode(match[3])); return paragraph;
}
var privacy = linkedParagraph(approved.privacy, 'privacy_url', home + 'privacy/#free-download');
var license = linkedParagraph(approved.license, 'license_url', root + (language === 'de' ? 'de/' : '') + 'eula/');
var status = node('p', '', 'free-download-status');
status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
[controls, notice, choice, help, privacy, license, status].forEach(function (part) { form.appendChild(part); });
var busy = false;
function show(message, state) {
status.textContent = message; keepWords(status); form.dataset.state = state;
address.setAttribute('aria-invalid', state === 'invalid_email' ? 'true' : 'false');
}
form.addEventListener('submit', function (event) {
event.preventDefault();
if (busy) return;
address.value = address.value.trim();
if (!address.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.value)) {
show(text.invalid_email, 'invalid_email'); address.focus(); return;
}
busy = true; button.disabled = true; address.readOnly = true; newsletter.disabled = true;
form.setAttribute('aria-busy', 'true'); button.textContent = text.sending; show(text.sending, 'sending');
var controller = new AbortController();
var timeout = setTimeout(function () { controller.abort(); }, 12000);
fetch(endpoint.href, {
method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal: controller.signal,
body: JSON.stringify({ email: address.value, product: product.free_request_product, lang: data.lang,
newsletter: newsletter.checked, consent_text_id: text.consent_text_id })
}).then(function (response) {
return response.json().catch(function () { return {}; }).then(function (body) {
if (response.status === 202 && body.ok === true) {
form.reset(); show(body.newsletter === 'unavailable' ? text.newsletter_failed : text.success, 'success'); return;
}
var state = response.status === 429 ? 'rate_limited' : response.status === 404 ? 'unavailable' :
response.status === 400 && ['invalid_email', 'invalid_product', 'invalid_request'].indexOf(body.error) !== -1 ? body.error : 'unexpected';
show(text[state], state);
});
}).catch(function () { show(text.network, 'network'); }).then(function () {
clearTimeout(timeout); busy = false; button.disabled = false; address.readOnly = false; newsletter.disabled = false;
form.removeAttribute('aria-busy'); button.textContent = text.submit;
});
});
offer.appendChild(form);
host.appendChild(offer); keepWords(host);
return true;
}
window.SecretFreeDownload = { load: load, mount: mount, englishPage: englishPage };
if (document.querySelector('[data-free-download-product]')) load().then(function (data) {
document.querySelectorAll('[data-free-download-product]').forEach(function (host) {
mount(host, host.getAttribute('data-free-download-product'), data);
});
}).catch(function () {  });
}());

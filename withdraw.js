/* Cancel contract / Vertrag widerrufen: two steps (enter, confirm).
   Nothing is sent before the person presses the confirm button; that one click posts the details to cfg.endpoint.
   The mailto link and the copy text stay as the fallback without scripts or when sending fails.
   The server answers ok only after our support inbox got the declaration; mail 'sent' means the buyer receipt went out too. */
(function () {
  'use strict';
  var page = document.getElementById('withdraw');
  var cfgEl = document.getElementById('withdraw-config');
  if (!page || !cfgEl) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var form = page.querySelector('form.withdraw-form');
  var review = page.querySelector('.withdraw-review');
  var note = page.querySelector('[data-withdraw-note]');
  var send = page.querySelector('[data-withdraw-send]');
  var back = page.querySelector('[data-withdraw-back]');
  var area = page.querySelector('[data-withdraw-text]');
  var copy = page.querySelector('[data-withdraw-copy]');
  var copied = page.querySelector('[data-withdraw-copied]');
  var submit = page.querySelector('[data-withdraw-submit]');
  var errBox = page.querySelector('[data-withdraw-error]');
  var pending = page.querySelector('[data-withdraw-pending]');
  var fallback = page.querySelector('[data-withdraw-fallback]');
  var done = page.querySelector('[data-withdraw-done]');
  var doneWhen = page.querySelector('[data-withdraw-done-when]');
  var doneMail = page.querySelector('[data-withdraw-done-mail]');
  var current = null;
  var lang = document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB';

  function stamp() {
    try {
      return new Date().toLocaleString(lang, { dateStyle: 'long', timeStyle: 'medium' }) + ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')';
    } catch (e) { return new Date().toString(); }
  }
  function field(n) { return (form.elements[n].value || '').replace(/[\r\n]+/g, ' ').trim(); }
  function message(v, time) {
    return cfg.body_intro + '\n\n' +
      cfg.b_name + ': ' + v.name + '\n' +
      cfg.b_order + ': ' + v.order + '\n' +
      cfg.b_email + ': ' + v.email + '\n' +
      cfg.b_time + ': ' + time + '\n';
  }
  function setNote(t) { if (note) note.textContent = t || ''; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = { name: field('name'), order: field('order'), email: field('email') };
    if (!v.name || !v.order || !v.email) { setNote(cfg.err_required); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { setNote(cfg.err_email); return; }
    setNote('');
    var time = stamp();
    var text = message(v, time);
    ['name', 'order', 'email'].forEach(function (k) { page.querySelector('[data-w="' + k + '"]').textContent = v[k]; });
    page.querySelector('[data-w="time"]').textContent = time;
    area.value = text;
    send.setAttribute('href', 'mailto:' + cfg.to + '?subject=' + encodeURIComponent(cfg.subject) + '&body=' + encodeURIComponent(text));
    current = v;
    if (errBox) errBox.textContent = '';
    form.hidden = true;
    review.hidden = false;
    if (copied) copied.textContent = '';
    review.scrollIntoView({ block: 'start' });
  });

  back.addEventListener('click', function () {
    review.hidden = true;
    form.hidden = false;
    var first = form.querySelector('input');
    if (first) first.focus();
  });

  function fill(t, k, val) { return String(t || '').replace('{' + k + '}', val); }
  function showDone(res, v) {
    if (pending) pending.hidden = true;
    if (fallback) fallback.hidden = true;
    doneWhen.textContent = fill(cfg.done_when, 'when', res.received || '');
    doneMail.textContent = res.mail === 'sent' ? fill(cfg.done_mail, 'email', v.email) : (cfg.done_nomail || '');
    done.hidden = false;
    done.focus();
  }
  function fail(t) {
    if (errBox) errBox.textContent = t;
    if (submit) { submit.disabled = false; submit.textContent = submit.getAttribute('data-label') || submit.textContent; }
  }

  // The only network call on this page: runs on the click of the confirm button, never on load or on form submit.
  if (submit) submit.addEventListener('click', function () {
    if (!current || !cfg.endpoint || submit.disabled) return;
    var v = current;
    submit.setAttribute('data-label', submit.textContent);
    submit.disabled = true;
    submit.textContent = cfg.sending || submit.textContent;
    if (errBox) errBox.textContent = '';
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: v.name, order: v.order, email: v.email, locale: cfg.locale || 'en' }),
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (r.status === 200 && r.body && r.body.ok) showDone(r.body, v);
      else fail(r.status === 429 ? cfg.err_rate : cfg.err_send);
    }, function () {
      if (timer) clearTimeout(timer);
      fail(cfg.err_send);
    });
  });

  copy.addEventListener('click', function () {
    area.select();
    var done = function () { if (copied) copied.textContent = cfg.copied; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(area.value).then(done, function () { try { document.execCommand('copy'); done(); } catch (e) {} });
    } else { try { document.execCommand('copy'); done(); } catch (e) {} }
  });
})();

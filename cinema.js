// BENUTZT-WENN: eine Seite von plugins.secret.vip Filme, Hell/Dunkel oder Einblendungen zeigt (alle Seiten laden es).
// Poster zuerst; Video erst sichtbar und nach dem Laden der Seite; Handy 720p; reduzierte Bewegung oder Datensparen = nur Poster.
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var small = matchMedia('(max-width: 720px)');

  // Hell / Dunkel: ohne Wahl ist die Seite dunkel (Standard, auch bei hellem System); die gespeicherte Wahl gilt seitenweit.
  try { var saved = localStorage.getItem('svp-theme'); if (saved === 'light' || saved === 'dark') doc.dataset.theme = saved; } catch (e) {}
  function isDark() { return doc.dataset.theme !== 'light'; }
  var icons = {
    dark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>',
    light: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></svg>'
  };
  // The switch sits beside the link row, not inside it: on phones the row scrolls and fades out at the edge.
  var nav = document.querySelector('nav .links');
  var toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle && nav) {
    toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'theme-switch'; toggle.setAttribute('data-theme-toggle', '');
    nav.parentNode.appendChild(toggle);
  }
  // Words come from the switch itself (data-light, data-dark, data-aria-*: tools/legal/site-chrome.json per page language).
  function paintToggle() {
    if (!toggle) return;
    var dark = isDark(), d = toggle.dataset;
    var span = document.createElement('span');
    span.textContent = dark ? (d.light || 'Light') : (d.dark || 'Dark');
    toggle.innerHTML = dark ? icons.light : icons.dark;
    toggle.appendChild(span);
    toggle.setAttribute('aria-label', dark ? (d.ariaLight || 'Switch to light appearance') : (d.ariaDark || 'Switch to dark appearance'));
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      doc.dataset.theme = next;
      try { localStorage.setItem('svp-theme', next); } catch (e) {}
      paintToggle();
    });
    paintToggle();
  }

  // Einmalcode (?code=) und Kampagne bleiben beim Wechsel zu Shop- und Produktseiten erhalten.
  var query = new URLSearchParams(location.search);
  var code = query.get('code') || '';
  if (/^[A-Z0-9]{1,32}$/.test(code)) {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var href = a.getAttribute('href');
      if (!/(^|\/)(pricing|plugins\/[a-z0-9-]+)\/$|^(\.\.\/)*(\.\/)?$/.test(href)) return;
      a.setAttribute('href', href + (href.indexOf('?') < 0 ? '?' : '&') + 'code=' + encodeURIComponent(code));
    });
  }

  // Einblendungen beim Scrollen
  var reveal = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduce.matches) {
    var shown = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); shown.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(reveal, function (el) { shown.observe(el); });
  } else {
    Array.prototype.forEach.call(reveal, function (el) { el.classList.add('is-in'); });
  }

  // Filme
  var films = Array.prototype.slice.call(document.querySelectorAll('[data-film]'));
  if (!films.length) return;
  var paused = false, loaded = document.readyState === 'complete';
  var button = document.querySelector('[data-motion-toggle]');
  function allowed() { return !reduce.matches && !saveData && !paused; }
  function attach(frame) {
    var video = frame.querySelector('video');
    if (!video || video.dataset.ready) return video;
    var base = frame.getAttribute('data-film'), size = small.matches ? '720' : '1080';
    var av1 = video.canPlayType('video/webm; codecs="av01.0.08M.10"');
    video.src = base + '-' + size + (av1 ? '.webm' : '.mp4');
    video.dataset.ready = '1';
    // AV1 failed to load or decode: fall back to H.264 once; if that fails too, the poster stays.
    video.addEventListener('error', function () {
      if (/\.webm$/.test(video.src)) { video.src = base + '-' + size + '.mp4'; if (frame.dataset.visible && allowed()) start(frame); }
    });
    video.addEventListener('playing', function () { frame.classList.add('playing'); });
    return video;
  }
  function start(frame) {
    if (!allowed() || !loaded || !frame.dataset.visible) return;
    var video = attach(frame);
    if (!video) return;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }
  function stop(frame) { var v = frame.querySelector('video'); if (v && v.dataset.ready) v.pause(); }
  var watch = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.dataset.visible = '1'; start(e.target); }
      else { delete e.target.dataset.visible; stop(e.target); }
    });
  }, { rootMargin: '120px 0px' });
  films.forEach(function (f) { watch.observe(f); });
  // Videos warten, bis die Seite fertig ist, damit Text und Poster zuerst stehen.
  if (!loaded) window.addEventListener('load', function () { setTimeout(function () { loaded = true; films.forEach(start); }, 600); });
  if (button) {
    if (reduce.matches || saveData) button.hidden = true;
    button.addEventListener('click', function () {
      paused = !paused;
      films.forEach(function (f) { if (paused) stop(f); else start(f); });
      button.setAttribute('aria-pressed', paused ? 'true' : 'false');
      var de = doc.lang === 'de';
      button.querySelector('span').textContent = paused ? (de ? 'Film abspielen' : 'Play film') : (de ? 'Film anhalten' : 'Pause film');
    });
  }
  reduce.addEventListener && reduce.addEventListener('change', function () {
    films.forEach(function (f) { if (reduce.matches) { stop(f); f.classList.remove('playing'); } else start(f); });
  });
})();

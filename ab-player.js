// BENUTZT-WENN: a product page of plugins.secret.vip shows a before/after listening example ([data-ab] section).
// The section names its manifest (data-ab-manifest) and its words (data-ab-*), so every product and page language
// reuses this file unchanged; several sections on one page are fine (one per language preview), and
// data-ab-decimal sets the decimal mark of the level line (de: ","). Manifest: {"ready": true, "pairs": [{"id", "title", "listen_for",
// "dry": {"m4a", "webm", "lufs"}, "wet": {"m4a", "webm", "lufs"}}]}, paths relative to the manifest.
// Missing, empty, "ready": false or no valid pair = the section stays hidden (no placeholder for customers).
// Fair by construction: both versions start at the same sample in one AudioContext and switching is a 30 ms
// crossfade at the same spot; both are pulled down to the quieter LUFS value (never boosted), so the louder
// version never wins by volume. Audio loads only on the first press of Play, never with the page.
(function () {
  'use strict';
  var sections = document.querySelectorAll('[data-ab]');
  if (!sections.length || !window.fetch) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var FADE = 0.03;
  // One AudioContext and one playing example for the whole page, also across several sections.
  var ctx = null, current = null;

  function audio() {
    if (!ctx) {
      ctx = new AC();
      // Safari 17+: play like media, also with the ringer switch off (Audio Session API).
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function decode(buf) {
    return new Promise(function (ok, bad) { var r = ctx.decodeAudioData(buf, ok, bad); if (r && r.then) r.then(ok, bad); });
  }
  function fetchSide(s) {
    var i = 0;
    function next() {
      var url = s.files[i++];
      if (!url) return Promise.reject(new Error('no playable file'));
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(decode).catch(next);
    }
    return next();
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function clock(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }
  var ICON_PLAY = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" fill="currentColor"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 3.5h3.5v13H5zM11.5 3.5H15v13h-3.5z" fill="currentColor"/></svg>';

  function setup(section) {
    var list = section.querySelector('[data-ab-list]') || section;
    var d = section.dataset;
    var W = {
      dry: d.abDry || 'Original', wet: d.abWet || 'With the plugin', play: d.abPlay || 'Play', pause: d.abPause || 'Pause',
      listen: d.abListen || 'What to listen for', level: d.abLevel || 'Level-matched: both play at', version: d.abVersion || 'Version',
      position: d.abPosition || 'Position', loading: d.abLoading || 'Loading...', failed: d.abFailed || 'This example could not be loaded.',
      decimal: d.abDecimal || '.'
    };
    var manifestUrl = new URL(d.abManifest || 'manifest.json', location.href);
    function safePath(p) { return typeof p === 'string' && /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,200}$/.test(p) && p.indexOf('..') < 0; }
    function side(s) {
      if (!s || typeof s !== 'object' || typeof s.lufs !== 'number' || !isFinite(s.lufs)) return null;
      var files = [];
      var webm = document.createElement('audio').canPlayType('audio/webm; codecs="opus"') !== '';
      // Smaller Opus first where the browser plays it, AAC as the fallback everywhere.
      (webm ? ['webm', 'm4a'] : ['m4a']).forEach(function (k) { if (safePath(s[k])) files.push(new URL(s[k], manifestUrl).href); });
      return files.length ? { files: files, lufs: s.lufs } : null;
    }
    function valid(p) {
      if (!p || typeof p !== 'object' || typeof p.title !== 'string' || !p.title.trim()) return null;
      var dry = side(p.dry), wet = side(p.wet);
      if (!dry || !wet) return null;
      var target = Math.min(dry.lufs, wet.lufs);
      dry.gain = Math.pow(10, (target - dry.lufs) / 20); wet.gain = Math.pow(10, (target - wet.lufs) / 20);
      return { id: String(p.id || ''), title: p.title.trim(), hint: typeof p.listen_for === 'string' ? p.listen_for.trim() : '', dry: dry, wet: wet, target: target };
    }
    function Player(pair) {
      var self = this;
      this.pair = pair; this.side = 'dry'; this.offset = 0; this.playing = false; this.buffers = null; this.loading = null;
      var card = this.card = el('article', 'pp-ab');
      if (pair.id) card.dataset.abId = pair.id;
      var head = el('div', 'pp-ab-head');
      head.appendChild(el('h3', '', pair.title));
      head.appendChild(el('p', 'pp-ab-level', W.level + ' ' + pair.target.toFixed(1).replace('-', '−').replace('.', W.decimal) + ' LUFS'));
      card.appendChild(head);
      if (pair.hint) {
        var hint = el('p', 'pp-ab-hint'); hint.appendChild(el('b', '', W.listen)); hint.appendChild(document.createTextNode(pair.hint));
        card.appendChild(hint);
      }
      var row = el('div', 'pp-ab-controls');
      var play = this.playBtn = el('button', 'pp-ab-play'); play.type = 'button';
      var group = el('div', 'pp-ab-switch'); group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', W.version + ': ' + pair.title);
      this.radios = {};
      ['dry', 'wet'].forEach(function (k) {
        var b = el('button', 'pp-ab-option', W[k]); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.side = k;
        b.addEventListener('click', function () { self.choose(k, true); });
        b.addEventListener('keydown', function (ev) {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(ev.key) < 0) return;
          ev.preventDefault(); self.choose(k === 'dry' ? 'wet' : 'dry', true); self.radios[self.side].focus();
        });
        self.radios[k] = b; group.appendChild(b);
      });
      row.appendChild(play); row.appendChild(group); card.appendChild(row);
      var time = el('div', 'pp-ab-time');
      var seek = this.seek = el('input', 'pp-ab-seek'); seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = '1'; seek.value = '0';
      seek.setAttribute('aria-label', W.position + ': ' + pair.title);
      seek.addEventListener('input', function () { self.jump(seek.value / 1000); });
      this.clockEl = el('span', 'pp-ab-clock', '0:00');
      time.appendChild(seek); time.appendChild(this.clockEl); card.appendChild(time);
      this.note = el('p', 'pp-ab-note'); this.note.setAttribute('role', 'status'); card.appendChild(this.note);
      play.addEventListener('click', function () { self.playing ? self.pause() : self.start(); });
      this.paintPlay(); this.choose('dry', false);
    }
    Player.prototype.paintPlay = function () {
      this.playBtn.innerHTML = this.playing ? ICON_PAUSE : ICON_PLAY;
      this.playBtn.setAttribute('aria-label', (this.playing ? W.pause : W.play) + ': ' + this.pair.title);
      this.card.classList.toggle('is-playing', this.playing);
    };
    Player.prototype.choose = function (k, user) {
      this.side = k;
      for (var s in this.radios) {
        var on = s === k;
        this.radios[s].setAttribute('aria-checked', on ? 'true' : 'false');
        this.radios[s].tabIndex = on ? 0 : -1;
      }
      this.card.dataset.abSide = k;
      if (user && this.gains) this.fade();
    };
    Player.prototype.fade = function () {
      var t = ctx.currentTime, self = this;
      ['dry', 'wet'].forEach(function (k) {
        var g = self.gains[k].gain, v = k === self.side ? self.pair[k].gain : 0;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + FADE);
      });
    };
    Player.prototype.load = function () {
      var self = this;
      if (!this.loading) {
        this.note.textContent = W.loading;
        this.loading = Promise.all([fetchSide(this.pair.dry), fetchSide(this.pair.wet)]).then(function (b) {
          self.buffers = { dry: b[0], wet: b[1] };
          // Loop over the common length, so both versions stay on the same sample forever.
          self.length = Math.min(b[0].duration, b[1].duration);
          self.note.textContent = '';
        });
        this.loading.catch(function () { self.fail(); });
      }
      return this.loading;
    };
    Player.prototype.fail = function () {
      this.card.hidden = true; this.stopNodes(0);
      if (!list.querySelector('.pp-ab:not([hidden])')) section.hidden = true;
    };
    Player.prototype.position = function () {
      if (!this.playing) return this.offset;
      // Before the scheduled start (or while the device wakes up) the clock is still behind t0: stay on the spot.
      return (this.offset + Math.max(0, ctx.currentTime - this.t0)) % this.length;
    };
    Player.prototype.start = function () {
      var self = this;
      audio();
      if (current && current !== this) current.pause();
      current = this;
      this.load().then(function () {
        if (current !== self) return;
        var c = ctx, t0 = c.currentTime + 0.04;
        self.stopNodes(0);
        self.master = c.createGain(); self.master.connect(c.destination);
        self.gains = {}; self.nodes = [];
        ['dry', 'wet'].forEach(function (k) {
          var g = c.createGain(), n = c.createBufferSource();
          g.gain.value = k === self.side ? self.pair[k].gain : 0;
          n.buffer = self.buffers[k]; n.loop = true; n.loopStart = 0; n.loopEnd = self.length;
          n.connect(g); g.connect(self.master); n.start(t0, self.offset % self.length);
          self.gains[k] = g; self.nodes.push(n);
        });
        self.t0 = t0; self.playing = true; self.paintPlay(); self.tick();
      }, function () {});   // a failed load is handled in load(): this card hides
    };
    Player.prototype.stopNodes = function (fade) {
      if (!this.nodes) return;
      var t = ctx.currentTime, m = this.master.gain;
      m.cancelScheduledValues(t); m.setValueAtTime(m.value, t); m.linearRampToValueAtTime(0, t + fade);
      this.nodes.forEach(function (n) { try { n.stop(t + fade + 0.005); } catch (_) {} });
      this.nodes = null; this.gains = null;
    };
    Player.prototype.pause = function () {
      // Pressed again while still loading: drop the pending start.
      if (!this.playing) { if (current === this) current = null; return; }
      this.offset = this.position(); this.playing = false; this.stopNodes(0.02); this.paintPlay(); this.draw();
    };
    Player.prototype.jump = function (frac) {
      if (!this.length) { this.seek.value = '0'; return; }
      var was = this.playing;
      if (was) { this.stopNodes(0.01); this.playing = false; }
      this.offset = Math.min(frac, 0.999) * this.length;
      if (was) this.start(); else this.draw();
    };
    Player.prototype.draw = function () {
      if (!this.length) return;
      var p = this.position();
      this.seek.value = String(Math.round(p / this.length * 1000));
      this.clockEl.textContent = clock(p) + ' / ' + clock(this.length);
    };
    Player.prototype.tick = function () {
      var self = this;
      if (!this.playing) return;
      this.draw();
      requestAnimationFrame(function () { self.tick(); });
    };

    fetch(manifestUrl.href, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m || m.ready !== true || !Array.isArray(m.pairs)) return;
      var pairs = m.pairs.slice(0, 12).map(valid).filter(Boolean);
      if (!pairs.length) return;
      pairs.forEach(function (p) { list.appendChild(new Player(p).card); });
      section.hidden = false;
      section.dataset.abState = 'ready';
    }).catch(function () {});
  }
  Array.prototype.forEach.call(sections, setup);
})();

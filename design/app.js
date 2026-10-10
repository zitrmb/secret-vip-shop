// SecretNotes — UI-Logik. Läuft identisch im Dev-Hub (Browser, localStorage) und im nativen
// iPlug2-Plugin (WKWebView/WebView2; C++-Bridge für Config-Datei, Plugin-State, Host-Name).
// Reiner API-Client gegen https://notes.secret.vip – alle HTTP-Aufrufe per fetch() von hier.
(function () {
  'use strict';

  var API_DEFAULT = 'https://notes.secret.vip';
  var UI_VERSION = '1.3.0';
  var POLL_MS = 5000;          // Abgleich mit Server
  var INIT_TIMEOUT_MS = 4000;  // nativ: so lange auf SecretNotesInit warten, dann ohne Host-Stand starten
  var TYPING_HOLD_MS = 2500;   // beim Tippen nicht überschreiben
  var SAVE_DEBOUNCE_MS = 800;  // Speichern nach letztem Tastendruck
  var STATUS_OK_MS = 3000;     // grüne Meldungen so lange zeigen, dann ausblenden
  var LS_CONFIG = 'svpnotes_config';
  var LS_STATE = 'svpnotes_state';
  var NAME_RE = /^(?!\.)[^\/\\\x00-\x1f\x7f]{1,200}$/;
  var GENERIC_RE = /^(untitled|unbenannt|ohne titel|sans titre|new project|neues projekt|live set)/i;   // unbenanntes Projekt = kein Name

  // --- Bridge: nativ (iPlug2-WebView) oder Browser/Hub ---
  var NATIVE = !!((window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.callback) ||
                  (window.chrome && window.chrome.webview)) && window.top === window;   // im Hub-iframe: Browser-Modus
  function send(m) { try { if (typeof IPlugSendMsg === 'function') IPlugSendMsg(m); } catch (e) {} }
  // iPlug2 ruft diese Callbacks auf (Parameter/Msgs) – hier ohne Parameter nicht gebraucht
  ['SPVFD', 'SCVFD', 'SCMFD', 'SAMFD', 'SMMFD', 'SSMFD'].forEach(function (n) {
    if (typeof window[n] !== 'function') window[n] = function () {};
  });

  // --- Persistenz: nativ → C++ (Config-Datei / Plugin-Chunk), sonst localStorage ---
  var Store = NATIVE ? {
    read: function () { return {}; },   // Anfangsstand kommt per SecretNotesInit aus C++
    write: function (k, v) { send({ msg: k === LS_CONFIG ? 'CONFIG' : 'STATE', data: v }); }
  } : {
    read: function (k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } },
    write: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // --- Zustand ---
  var cfg = Object.assign({ url: API_DEFAULT, email: null, token: null, name: null }, Store.read(LS_CONFIG));
  var st = Object.assign({ note: null, text: '', updated_at: null, dirty: false, auto: false }, Store.read(LS_STATE));
  var etag = null, meta = null, readOnly = false, online = null;
  var project = '', projSeen = null, projCount = 0;   // Projektname vom Host (nativ), auto = Notiz folgt dem Projektnamen
  var lastKey = 0, saving = false, saveTimer = null, ticking = false, stopRetry = false, conflictMerged = false;
  var notesList = [];

  // ?api=http://... erlaubt einen anderen Server (nur für Tests)
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('api')) { cfg.url = q.get('api').replace(/\/+$/, ''); saveConfig(); }
  } catch (e) {}

  // --- DOM ---
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('text'), elStatus = $('status'), elName = $('noteName'), elOwner = $('owner'), elMore = $('moreBelow');
  var elLoginRow = $('loginRow'), elEmail = $('email'), elPw = $('password');
  var btnLogin = $('btnLogin'), btnLogout = $('btnLogout'), btnSite = $('btnSite'), brand = $('brand');
  var elCapRow = $('captchaRow'), elCapImg = $('captchaImg'), elCap = $('captcha'), btnCapNew = $('btnCaptchaNew');
  var capId = null;   // Kennung des angezeigten Sicherheitscodes (Einmal-Code, 10 min); null = keine Captcha-Zeile
  var picker = $('picker'), nameInput = $('nameInput'), nameList = $('nameList');
  var menu = $('menu'), btnMenu = $('btnMenu'), btnPick = $('btnPick'), chkAuto = $('chkAuto');

  // --- Helfer ---
  function log(msg) { try { console.log('[SecretNotes] ' + msg); } catch (e) {} } // nie Text/Passwort/Token loggen
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  var hostLabel = null, pluginVersion = null, configPath = null;   // nativ aus C++: Host, Plugin-Version, Config-Datei
  function hostName() {
    if (hostLabel) return hostLabel;
    var p = navigator.platform || '';
    return 'SVP Dev Hub (' + (/Mac/i.test(p) ? 'Mac' : /Win/i.test(p) ? 'Windows' : 'Browser') + ')';
  }
  function saveConfig() { Store.write(LS_CONFIG, { url: cfg.url, email: cfg.email, token: cfg.token, name: cfg.name }); }
  function persist() { Store.write(LS_STATE, { note: st.note, text: st.text, updated_at: st.updated_at, dirty: st.dirty, auto: !!st.auto }); }
  function requestProject() { if (NATIVE) send({ msg: 'PROJECT' }); }
  function loggedIn() { return !!cfg.token; }
  function typingHold() { return Date.now() - lastKey < TYPING_HOLD_MS; }
  function notePath() { return '/api/notes/' + encodeURIComponent(st.note); }

  // Status unten rechts: Warnungen/Fehler bleiben, Erfolg (grün) und Zwischenstände blenden nach kurzer Zeit aus
  var statusTimer = null, greeted = false;
  function setStatus(text, kind) {
    clearTimeout(statusTimer); statusTimer = null;
    elStatus.textContent = text;
    elStatus.className = 'status show' + (kind ? ' ' + kind : '');
    if (kind === 'ok') statusTimer = setTimeout(hideStatus, STATUS_OK_MS);
  }
  function hideStatus() {
    clearTimeout(statusTimer);
    elStatus.classList.remove('show');
    statusTimer = setTimeout(function () { statusTimer = null; if (!elStatus.classList.contains('show')) elStatus.textContent = ''; }, 2000);   // nach dem Ausblenden leeren
  }
  function idleStatus() {
    if (!loggedIn()) { greeted = false; return setStatus('Abgemeldet – E-Mail + Passwort eingeben', 'warn'); }
    if (readOnly) return setStatus('Nur lesen', 'warn');
    if (greeted) return hideStatus();   // „angemeldet als …“ nur einmal kurz nach Start/Anmeldung
    greeted = true;
    setStatus('angemeldet als ' + (cfg.name || cfg.email || '?') + ' ✓', 'ok');
  }

  function api(method, path, body, headers) {
    var h = Object.assign({}, headers || {});
    if (cfg.token) h['Authorization'] = 'Bearer ' + cfg.token;
    var opts = { method: method, headers: h, cache: 'no-store' };
    if (body !== undefined && body !== null) { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(cfg.url + path, opts);
  }

  // Netzfehler ≠ zwingend offline (z. B. CORS). Kurz gegenprüfen, damit die Meldung stimmt.
  function classifyNetError() {
    if (navigator.onLine === false) return Promise.resolve('offline');
    return fetch(cfg.url + '/api/health', { cache: 'no-store' })
      .then(function (r) { return r.ok ? 'reachable' : 'offline'; }, function () { return 'offline'; });
  }
  function onNetError(context) {
    online = false;
    return classifyNetError().then(function (kind) {
      if (kind === 'reachable') { log(context + ': Verbindungsfehler trotz erreichbarem Server (CORS?)'); setStatus('⚠︎ Verbindungsfehler – erneuter Versuch in 5 s', 'err'); return; }
      setStatus(st.dirty ? '⚠︎ offline – lokal gespeichert, Abgleich folgt' : '⚠︎ offline – erneuter Versuch in 5 s', 'warn');
    });
  }

  // --- Anzeige ---
  function renderHeader() {
    if (st.note) { elName.textContent = st.note; elName.classList.remove('empty'); elName.title = st.auto ? 'Name = Projektname (automatisch) – klicken zum Ändern' : 'Notiz wählen'; }
    else { elName.textContent = 'Ohne Namen'; elName.classList.add('empty'); elName.title = 'Notiz benennen'; }
    var owner = '';
    if (meta && meta.mine === false && meta.owner) {
      owner = '· von ' + (meta.owner.name || meta.owner.email) + (meta.permission === 'read' ? ' (nur lesen)' : '');
    }
    elOwner.textContent = owner;
    ta.readOnly = readOnly;   // ohne Namen darf man tippen – bleibt im Projekt, geht erst mit Namen zum Server
    ta.classList.toggle('nonote', !st.note);
    ta.placeholder = st.note ? '' : (NATIVE
      ? 'Projekt speichern – die Notiz bekommt automatisch den Projektnamen.\nOder oben auf „Ohne Namen“ klicken und selbst benennen.'
      : 'Oben auf „Ohne Namen“ klicken und der Notiz einen Namen geben.');
    renderMenu();
    if (logModel) { if (logOn && lastRO !== readOnly) renderLog(); }
    lastRO = readOnly;
  }
  var lastRO = false;
  function renderAuth() {
    var on = loggedIn();
    elLoginRow.classList.toggle('hidden', on);
    if (on) captchaHide();
    btnLogout.classList.toggle('hidden', !on);
    if (!on && cfg.email) elEmail.value = cfg.email;
    renderMenu();
  }
  function renderMenu() {
    var on = loggedIn();
    $('menuAccount').textContent = on ? 'Angemeldet als ' + (cfg.name || cfg.email || '?') + (cfg.name && cfg.email ? ' (' + cfg.email + ')' : '') : 'Nicht angemeldet';
    $('menuLoginHint').classList.toggle('hidden', on);
    $('menuNote').textContent = st.note || 'Ohne Namen';
    $('rowAuto').classList.toggle('hidden', !NATIVE);
    chkAuto.checked = !!st.auto;
    $('menuNoteHint').textContent = !st.note
      ? (NATIVE ? 'Sobald das Projekt gespeichert ist, wird sein Name übernommen.' : 'Notiz über „Wechseln …“ benennen.')
      : (meta && meta.mine === false ? 'Geteilte Notiz von ' + (meta.owner ? (meta.owner.name || meta.owner.email) : '?') + (readOnly ? ' – nur lesen.' : ' – mit Schreibrecht.') : (project && project !== st.note ? 'Projekt heißt „' + project + '“ – Name wurde fest gewählt.' : ''));
    $('menuServer').textContent = String(cfg.url || API_DEFAULT).replace(/^https?:\/\//, '');
    $('menuHost').textContent = hostName();
    $('menuVersion').textContent = pluginVersion ? pluginVersion + ' (UI ' + UI_VERSION + ')' : 'UI ' + UI_VERSION;
    $('rowConfig').classList.toggle('hidden', !configPath);
    if (configPath) { $('menuConfig').textContent = String(configPath).replace(/^\/Users\/[^\/]+/, '~'); $('menuConfig').title = configPath; }
  }
  function openMenu() { renderMenu(); menu.classList.remove('hidden'); btnMenu.classList.add('open'); closePicker(); }
  function closeMenu() { menu.classList.add('hidden'); btnMenu.classList.remove('open'); }
  function setText(t, keepCursor) {
    var focused = document.activeElement === ta;
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = t;
    if (focused && keepCursor) {
      ta.selectionStart = Math.min(s, t.length);
      ta.selectionEnd = Math.min(e, t.length);
    }
    updateMore();
    if (logOn && logModel) renderLog();
  }
  // Steht unter dem sichtbaren Bereich noch Text? → Verlauf + Pfeil unten einblenden
  function updateMore() {
    var more = ta.scrollHeight - ta.clientHeight - ta.scrollTop > 6;
    elMore.classList.toggle('show', more);
  }
  function applyMeta(d) {
    meta = { mine: d.mine, permission: d.permission, owner: d.owner, exists: d.exists };
    readOnly = d.permission === 'read';
    renderHeader();
  }

  // --- Abmelden erzwungen (401) ---
  function onUnauthorized() {
    log('401 → Token verworfen');
    cfg.token = null; cfg.name = null; saveConfig();
    renderAuth();
    setStatus('Abgemeldet – E-Mail + Passwort eingeben', 'warn');
  }

  // --- Laden ---
  function load(force) {
    if (!loggedIn() || !st.note) return Promise.resolve();
    var headers = {};
    if (etag && !force) headers['If-None-Match'] = etag;
    return api('GET', notePath(), null, headers).then(function (r) {
      var cameBack = online === false;
      if (r.status === 304) { online = true; if (cameBack) idleStatus(); return; }
      if (r.status === 401) return onUnauthorized();
      if (r.status === 400 || r.status === 404) { setStatus('⚠︎ Ungültiger Notizname', 'err'); return; }
      if (r.status !== 200) { setStatus('⚠︎ Serverfehler ' + r.status + ' – erneuter Versuch in 5 s', 'err'); return; }
      var newEtag = r.headers.get('ETag');
      return r.json().then(function (d) {
        online = true;
        applyMeta(d);
        if (!force && (st.dirty || typingHold())) { log('load: lokale Änderung/Tippen – nicht überschrieben'); return; }
        var unchanged = d.updated_at === st.updated_at && d.text === st.text;
        etag = newEtag;
        if (unchanged) { if (cameBack) idleStatus(); return; }
        st.text = d.text; st.updated_at = d.updated_at; st.dirty = false; persist();
        setText(d.text, true);
        log('load: Serverstand übernommen');
        idleStatus();
      });
    }, function () { return onNetError('load'); });
  }

  // --- Speichern ---
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; save(0); }, SAVE_DEBOUNCE_MS);
  }
  function save(attempt) {
    if (!loggedIn() || !st.note || saving || readOnly) return Promise.resolve();
    saving = true;
    setStatus('speichert …');
    var textAtSave = st.text, base = st.updated_at;
    return api('PUT', notePath(), { text: textAtSave, base_updated_at: base }).then(function (r) {
      if (r.status === 200) {
        return r.json().then(function (d) {
          online = true; stopRetry = false;
          st.updated_at = d.updated_at; etag = null;
          applyMeta(Object.assign({ mine: d.permission === 'owner', exists: true }, d));
          if (st.text === textAtSave) st.dirty = false;
          persist();
          if (conflictMerged) { conflictMerged = false; setStatus('⚠︎ Konflikt – beide Versionen zusammengeführt', 'warn'); }
          else setStatus('gespeichert ' + hhmm(), 'ok');
          log('save: 200');
          saving = false;
          if (st.dirty) scheduleSave();
        });
      }
      if (r.status === 409) {
        return r.json().then(function (d) {
          saving = false;
          if (attempt >= 3) { setStatus('⚠︎ Konflikt – erneuter Versuch in 5 s', 'err'); return; }
          var local = st.text;
          if (d.updated_at === null) {
            // auf dem Server gelöscht → neu anlegen
            st.updated_at = null; persist();
            log('save: 409 (gelöscht) → neu anlegen');
            return save(attempt + 1);
          }
          var merged;
          if (!local.trim() || local === d.text) merged = d.text;         // nichts Eigenes → Serverstand
          else if (!d.text.trim()) merged = local;                          // Server leer → eigenes behalten
          else merged = d.text + '\n\n— — — lokale Version (' + hhmm() + ') — — —\n' + local;
          st.text = merged; st.updated_at = d.updated_at;
          if (merged === d.text) { st.dirty = false; etag = null; persist(); setText(merged, true); idleStatus(); log('save: 409 → Serverstand übernommen'); return; }
          conflictMerged = merged !== local;
          st.dirty = true; persist(); setText(merged, false);
          log('save: 409 → zusammengeführt, erneut speichern');
          return save(attempt + 1);
        });
      }
      saving = false;
      if (r.status === 403) {
        readOnly = true; st.dirty = false; persist(); etag = null;
        setStatus('Nur lesen', 'warn'); renderHeader();
        log('save: 403 → nur lesen');
        return load(true);
      }
      if (r.status === 401) return onUnauthorized();
      if (r.status === 413) { stopRetry = true; setStatus('⚠︎ Zu groß (max. 1 MB) – nicht gespeichert', 'err'); return; }
      if (r.status === 400) { stopRetry = true; setStatus('⚠︎ Ungültiger Notizname', 'err'); return; }
      setStatus('⚠︎ Serverfehler ' + r.status + ' – erneuter Versuch in 5 s', 'err');
    }, function () { saving = false; return onNetError('save'); });
  }

  // --- Abgleich-Takt (alle 5 s) ---
  function tick() {
    requestProject();
    if (ticking || !loggedIn() || !st.note) return;
    ticking = true;
    var p;
    if (st.dirty && !saving && !saveTimer && !stopRetry) p = save(0);
    else if (typingHold()) p = Promise.resolve();
    else p = load(false);
    p.then(function () { ticking = false; }, function () { ticking = false; });
  }
  function sync() { return st.dirty ? save(0) : load(false); }

  // --- Konto ---
  function checkMe() {
    return api('GET', '/api/me').then(function (r) {
      if (r.status === 401) return onUnauthorized();
      if (r.status !== 200) return;
      return r.json().then(function (d) {
        online = true;
        cfg.name = d.user.name; cfg.email = d.user.email; saveConfig();
        idleStatus();
      });
    }, function () { return onNetError('me'); });
  }
  // Sicherheitscode (Captcha) vom Server: verlangt er ihn (403 captcha_required, nach 3 Fehlversuchen
  // pro IP oder Konto), erscheint die Zeile über dem Login. Einmal-Code, 10 Minuten gültig.
  function captchaShow() {
    capId = null; elCap.value = ''; elCapImg.innerHTML = '';
    elCapRow.classList.remove('hidden');
    return fetch(cfg.url + '/api/captcha', { cache: 'no-store' }).then(function (r) {
      if (r.status !== 200) throw new Error('captcha ' + r.status);
      return r.json();
    }).then(function (c) {
      capId = c.id; elCapImg.innerHTML = c.svg; elCap.focus();
    }, function () {
      elCapImg.textContent = '?';
      setStatus('Sicherheitscode konnte nicht geladen werden – Bild anklicken für neuen Versuch', 'err');
    });
  }
  function captchaHide() {
    capId = null; elCap.value = ''; elCapImg.innerHTML = '';
    elCapRow.classList.add('hidden');
  }
  function login() {
    var email = elEmail.value.trim(), pw = elPw.value;
    elPw.value = '';
    if (!email || !pw) { setStatus('E-Mail + Passwort eingeben', 'warn'); return; }
    if (capId && !elCap.value.trim()) { setStatus('Bitte den Sicherheitscode aus dem Bild eingeben', 'warn'); elCap.focus(); return; }
    btnLogin.disabled = true;
    setStatus('meldet an …');
    var body = { email: email, password: pw, device: hostName() };
    if (capId) body.captcha = { id: capId, answer: elCap.value.trim() };
    fetch(cfg.url + '/api/login', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      pw = null; body = null;
      if (r.status === 200) {
        return r.json().then(function (d) {
          captchaHide();
          cfg.email = d.user.email; cfg.token = d.token; cfg.name = d.user.name; saveConfig();
          online = true; stopRetry = false; greeted = false;
          renderAuth(); idleStatus();
          log('login ok');
          refreshNotes();
          if (st.note) sync();
        });
      }
      if (r.status === 401) {
        if (capId) captchaShow();   // Einmal-Code ist verbraucht
        return setStatus('E-Mail oder Passwort falsch (zurücksetzen: notes.secret.vip)', 'err');
      }
      if (r.status === 403) {
        return r.json().then(function (d) {
          if (d && d.error === 'captcha_required') {
            setStatus(capId ? 'Sicherheitscode falsch – bitte Passwort erneut und das neue Bild eingeben' : 'Bitte Passwort erneut und den Sicherheitscode aus dem Bild eingeben', 'warn');
            return captchaShow();
          }
          if (d && d.error === 'email_unverified') return setStatus('E-Mail noch nicht bestätigt – bitte den Link aus unserer E-Mail öffnen (Absender hello@secret.vip)', 'warn');
          if (d && d.error === 'quota_exceeded') return setStatus('Zu viele Geräte-Zugänge (max. 50) – alte auf notes.secret.vip unter Konto löschen', 'err');
          setStatus('Anmeldung abgelehnt (403)', 'err');
        }, function () { setStatus('Anmeldung abgelehnt (403)', 'err'); });
      }
      if (r.status === 429) return setStatus('Zu viele Versuche – bitte 15 Minuten warten', 'err');
      setStatus('Anmeldung fehlgeschlagen (' + r.status + ')', 'err');
    }, function () {
      pw = null; body = null;
      setStatus('⚠︎ offline – Anmeldung nicht möglich', 'warn');
    }).then(function () { btnLogin.disabled = false; });
  }
  function logout() {
    var p = loggedIn() ? api('POST', '/api/logout').then(function () {}, function () {}) : Promise.resolve();
    p.then(function () {
      cfg.token = null; cfg.name = null; saveConfig();
      readOnly = false; meta = null; etag = null; notesList = [];
      renderAuth(); renderHeader();
      setStatus('Abgemeldet – E-Mail + Passwort eingeben', 'warn');
      log('logout');
    });
  }

  // --- Notiz-Auswahl ---
  function refreshNotes() {
    if (!loggedIn()) return Promise.resolve();
    return api('GET', '/api/notes').then(function (r) {
      if (r.status === 401) return onUnauthorized();
      if (r.status !== 200) return;
      return r.json().then(function (d) { notesList = d.notes || []; renderList(); });
    }, function () {});
  }
  function renderList() {
    var filter = nameInput.value.trim().toLowerCase();
    nameList.innerHTML = '';
    var items = notesList.filter(function (n) { return !filter || n.name.toLowerCase().indexOf(filter) >= 0; });
    var exact = notesList.some(function (n) { return n.name === nameInput.value.trim(); });
    if (project && (project !== st.note || !st.auto) && (!filter || project.toLowerCase().indexOf(filter) >= 0)) {
      var liP = document.createElement('li'); liP.className = 'project';
      liP.innerHTML = '<span class="n"></span><span class="m">Projektname (automatisch)</span>';
      liP.firstChild.textContent = project;
      liP.onclick = function () { chooseNote(project, true); };
      nameList.appendChild(liP);
    }
    if (nameInput.value.trim() && !exact) {
      var liNew = document.createElement('li'); liNew.className = 'new';
      liNew.innerHTML = '<span class="n"></span><span class="m">neu anlegen</span>';
      liNew.firstChild.textContent = nameInput.value.trim();
      liNew.onclick = function () { chooseNote(nameInput.value.trim()); };
      nameList.appendChild(liNew);
    }
    items.forEach(function (n) {
      var li = document.createElement('li');
      var m = n.mine ? 'eigene' : 'von ' + (n.owner.name || n.owner.email) + (n.permission === 'read' ? ' (nur lesen)' : '');
      li.innerHTML = '<span class="n"></span><span class="m"></span>';
      li.children[0].textContent = n.name; li.children[1].textContent = m;
      li.onclick = function () { chooseNote(n.name); };
      nameList.appendChild(li);
    });
    if (!items.length && !nameInput.value.trim()) {
      var liE = document.createElement('li'); liE.innerHTML = '<span class="m">keine Notizen – Namen eintippen</span>';
      nameList.appendChild(liE);
    }
  }
  function openPicker() {
    picker.classList.remove('hidden');
    nameInput.value = st.note || '';
    renderList();
    refreshNotes();
    nameInput.focus(); nameInput.select();
  }
  function closePicker() { picker.classList.add('hidden'); }
  // auto = Name kommt vom Projekt (folgt dann Umbenennungen); manuell gewählt = fest.
  // Text, der ohne Namen getippt wurde, wandert in die neue Notiz mit.
  function chooseNote(name, auto) {
    name = (name || '').trim();
    if (!name) { closePicker(); return; }
    if (!NAME_RE.test(name)) { if (!auto) $('pickerHint').textContent = 'Ungültig: 1–200 Zeichen, kein / oder \\, nicht mit . beginnen'; return; }
    closePicker();
    if (name === st.note) { if (!!st.auto !== !!auto) { st.auto = !!auto; persist(); renderHeader(); } return; }
    var carry = st.note ? '' : st.text;
    var pending = (st.dirty && loggedIn() && st.note) ? save(0) : Promise.resolve();
    pending.then(function () {
      clearTimeout(saveTimer); saveTimer = null;
      st = { note: name, text: carry, updated_at: null, dirty: !!carry, auto: !!auto };
      etag = null; meta = null; readOnly = false; stopRetry = false;
      persist(); renderHeader(); setText(carry, false);
      log(auto ? 'note = Projektname' : 'note gewählt');
      idleStatus();
      if (loggedIn()) { if (carry) save(0); else load(true); }
      else if (!auto) ta.focus();
    });
  }
  // Projekt umbenannt / „Speichern unter“ bei automatischem Namen: Text mitnehmen, alte Notiz bleibt auf dem Server
  function followProject(name) {
    clearTimeout(saveTimer); saveTimer = null;
    var text = st.text;
    st = { note: name, text: text, updated_at: null, dirty: !!text, auto: true };
    etag = null; meta = null; readOnly = false; stopRetry = false;
    persist(); renderHeader();
    log('note folgt Projektnamen');
    idleStatus();
    if (loggedIn()) { if (text) save(0); else load(true); }
  }

  // --- Studio-Log (Design E) ---
  // Die Notiz bleibt REINER TEXT (notes.secret.vip ändert sich nicht). Die Struktur ist nur eine Sicht darüber:
  //   Bereich = Überschrift "## Mix", Häkchen = "- [ ]" / "- [x]", Songstelle = Suffix " @1:24" (Zeit) oder " @T33" (Takt).
  //   Text vor der ersten Überschrift = Bereich "Notizen". Jede Zeile bleibt als Original stehen und wird nur
  //   verändert, wenn man genau sie bearbeitet – darum ist Text → Ansicht → Text verlustfrei.
  var LOG_DEFAULT = 'Notizen';
  var LS_VIEW = 'svpnotes_view', LS_MARK = 'svpnotes_mark';
  var HEAD_RE = /^## +(\S.*?)\s*$/;
  var TODO_RE = /^(\s*- \[)([ xX]?)(\] ?)(.*)$/;
  var MARK_RE = /^(.*?)(\s+|^)@(\d{1,3}:\d{2}|T\d{1,4})$/;
  var BOX_RE = /^(?:- )?\[([ xX]?)\]\s/;   // "[ ] " am Zeilenanfang wird zum Kästchen
  function rowInfo(line) {
    var m = TODO_RE.exec(line), info, body;
    if (m) { info = { kind: 'todo', pre: m[1], chk: m[2], mid: m[3], text: m[4] }; }
    else if (/^\s*$/.test(line)) return { kind: 'blank', raw: line };
    else info = { kind: 'plain', text: line };
    var k = MARK_RE.exec(info.text);
    if (k) { info.text = k[1]; info.gap = k[2]; info.mark = k[3]; }
    return info;
  }
  function composeRow(r) {
    if (r.kind === 'blank') return r.raw;
    var tail = r.mark ? (r.gap === undefined ? ' ' : r.gap) + '@' + r.mark : '';
    return (r.kind === 'todo' ? r.pre + r.chk + r.mid : '') + r.text + tail;
  }
  function parseLog(text) {
    var lines = text.split('\n'), secs = [], m, open = 0, i;
    var cur = { title: LOG_DEFAULT, head: -1, start: 0, end: lines.length, open: 0, todos: 0, content: false };
    for (i = 0; i < lines.length; i++) {
      var l = lines[i];
      if ((m = HEAD_RE.exec(l))) { cur.end = i; secs.push(cur); cur = { title: m[1], head: i, start: i + 1, end: lines.length, open: 0, todos: 0, content: false }; continue; }
      if (l !== '' && /\S/.test(l)) cur.content = true;
      if ((m = TODO_RE.exec(l))) { cur.todos++; if (m[2] === ' ' || m[2] === '') cur.open++; }
    }
    secs.push(cur);
    if (secs.length > 1 && !secs[0].content) secs.shift();   // leerer Vorspann zählt nicht als Bereich
    return { lines: lines, secs: secs };
  }
  // Ansicht → Text: Überschriften + Zeilen wieder zusammensetzen (für die Rundreise-Probe)
  function buildLog(model) {
    var out = [], hasFirst = model.secs.length && model.secs[0].head === -1;
    if (!hasFirst) out = out.concat(model.lines.slice(0, model.secs[0].head));   // ignorierter leerer Vorspann
    model.secs.forEach(function (s) {
      if (s.head >= 0) out.push(model.lines[s.head]);
      for (var i = s.start; i < s.end; i++) out.push(composeRow(rowInfo(model.lines[i])));
    });
    return out.join('\n');
  }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  var elLog = $('log'), elBodyBox = document.querySelector('.body'), elTabs = $('tabs'), elRows = $('rows');
  var btnMark = $('btnMark'), btnUnit = $('btnUnit'), chkLog = $('chkLog');
  var logOn = true, logModel = null, logText = null, logAct = 0, logActTitle = null, lastRow = -1, edit = null;
  var tp = null, tpMiss = 0, markUnit = 'bar', addingSec = false;
  try { logOn = localStorage.getItem(LS_VIEW) !== 'text'; markUnit = localStorage.getItem(LS_MARK) === 'time' ? 'time' : 'bar'; } catch (e) {}

  function logSync() {
    if (logModel && logText === ta.value) return;
    logText = ta.value; logModel = parseLog(logText);
    var k = -1, s = logModel.secs;
    for (var i = 0; i < s.length; i++) if (s[i].title === logActTitle) { k = i; break; }
    logAct = k >= 0 ? k : Math.min(logAct, s.length - 1);
  }
  function activeSec() { return logModel.secs[logAct]; }
  // Text schreiben wie beim Tippen im Textfeld (Speichern, Stand merken, Status)
  function logCommit() {
    logText = logModel.lines.join('\n'); ta.value = logText; reparse(); onEdited();
  }
  function reparse() {   // Zeilenzahl oder Häkchen haben sich geändert → Bereichsgrenzen neu, Tab bleibt
    logModel = parseLog(logText);
    var k = -1;
    for (var i = 0; i < logModel.secs.length; i++) if (logModel.secs[i].title === logActTitle) { k = i; break; }
    logAct = k >= 0 ? k : Math.min(logAct, logModel.secs.length - 1);
  }
  function secSig(m) { return m.secs.map(function (x) { return x.head + ':' + x.title; }).join('|'); }
  var tabSig = '';
  function writeLine(i, info) { logModel.lines[i] = composeRow(info); logCommit(); }

  function renderTabs() {
    elTabs.textContent = ''; tabSig = secSig(logModel);
    logModel.secs.forEach(function (s, k) {
      var b = document.createElement('button');
      b.className = 'tab' + (k === logAct ? ' on' : ''); b.dataset.k = k;
      var n = document.createElement('span'); n.className = 'tn'; n.textContent = s.title; b.appendChild(n);
      if (s.open) { var c = document.createElement('b'); c.textContent = s.open; b.appendChild(c); }
      elTabs.appendChild(b);
    });
    if (addingSec) {
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = 'secInput'; inp.maxLength = 60; inp.placeholder = 'Name';
      ['keydown', 'keyup', 'keypress'].forEach(function (ev) { inp.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addSection(inp.value); }
        if (e.key === 'Escape') { addingSec = false; renderTabs(); }
      });
      inp.addEventListener('blur', function () { if (addingSec) { addingSec = false; renderTabs(); } });
      elTabs.appendChild(inp); inp.focus();
    } else if (!readOnly) {
      var a = document.createElement('button'); a.className = 'tab add'; a.id = 'tabAdd'; a.textContent = '+ Bereich'; elTabs.appendChild(a);
    }
  }
  function fillRow(li, i) {
    var info = rowInfo(logModel.lines[i]);
    li.className = 'r ' + (info.kind === 'todo' ? 'todo' : info.kind) + (info.kind === 'todo' && info.chk !== ' ' && info.chk !== '' ? ' done' : '') + (i === lastRow ? ' sel' : '');
    li.dataset.i = i; li.textContent = '';
    var cb = document.createElement('span'); cb.className = 'cb'; li.appendChild(cb);
    var t = document.createElement('span'); t.className = 'tx'; t.textContent = info.kind === 'blank' ? '' : info.text; li.appendChild(t);
    if (info.mark) { var s = document.createElement('span'); s.className = 'st'; s.textContent = info.mark.charAt(0) === 'T' ? 'Takt ' + info.mark.slice(1) : info.mark; li.appendChild(s); }
  }
  function renderRows() {
    var s = activeSec(), frag = document.createDocumentFragment();
    for (var i = s.start; i < s.end; i++) {
      // die Leerzeile vor der nächsten Überschrift ist nur Abstand
      if (i === s.end - 1 && s.end < logModel.lines.length && logModel.lines[i] === '') continue;
      var li = document.createElement('li'); fillRow(li, i); frag.appendChild(li);
    }
    if (!readOnly) { var ad = document.createElement('li'); ad.className = 'r addrow'; ad.id = 'rowAdd'; ad.textContent = '+ Neue Zeile'; frag.appendChild(ad); }
    elRows.textContent = ''; elRows.appendChild(frag);
  }
  function renderLog() {
    if (!logOn) return;
    logSync(); edit = null; logActTitle = activeSec().title;
    renderTabs(); renderRows(); renderMark();
  }
  function rowEl(i) { return elRows.querySelector('li[data-i="' + i + '"]'); }
  function refreshCounts() {   // nach Häkchen/Tippen: nur Zahlen neu, Zeilen bleiben stehen
    if (secSig(logModel) !== tabSig) { renderLog(); return; }   // Überschrift neu/weg → Bereichsliste neu
    var tabs = elTabs.querySelectorAll('.tab[data-k]');
    logModel.secs.forEach(function (s, k) {
      var b = tabs[k], c = b && b.querySelector('b');
      if (!b) return;
      if (s.open && !c) { c = document.createElement('b'); b.appendChild(c); }
      if (c) { if (s.open) c.textContent = s.open; else c.remove(); }
    });
  }
  function guardWrite() { if (readOnly) { setStatus('Nur lesen', 'warn'); return false; } return true; }

  function toggleRow(i) {
    if (!guardWrite()) return;
    var info = rowInfo(logModel.lines[i]);
    if (info.kind !== 'todo') return;
    info.chk = (info.chk === ' ' || info.chk === '') ? 'x' : ' ';
    writeLine(i, info);
    var li = rowEl(i); if (li) fillRow(li, i);
    refreshCounts();
  }
  function insertRowAfter(i, line) { logModel.lines.splice(i + 1, 0, line); logCommit(); }
  function endEdit() {
    if (!edit) return;
    var i = edit.i; edit = null;
    var li = rowEl(i); if (li) fillRow(li, i);
    refreshCounts();
  }
  function startEdit(i) {
    if (!guardWrite()) return;
    if (edit) { if (edit.i === i) return; endEdit(); }
    var li = rowEl(i); if (!li) return;
    var info = rowInfo(logModel.lines[i]);
    lastRow = i; elRows.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel'); }); li.classList.add('sel');
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'edit'; inp.spellcheck = false;
    inp.value = info.kind === 'blank' ? '' : info.text;
    var tx = li.querySelector('.tx'); li.replaceChild(inp, tx);
    edit = { i: i, inp: inp };
    ['keydown', 'keyup', 'keypress'].forEach(function (ev) { inp.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    inp.addEventListener('input', function () { editInput(i, inp, li); });
    inp.addEventListener('keydown', function (e) { editKey(e, i, inp); });
    inp.addEventListener('blur', function () { if (edit && edit.inp === inp) endEdit(); });
    inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  }
  function editInput(i, inp, li) {
    lastKey = Date.now();
    var info = rowInfo(logModel.lines[i]), v = inp.value, m;
    if (info.kind !== 'todo' && (m = BOX_RE.exec(v))) {   // "[ ] " tippen → Kästchen
      var keep = info.mark ? { mark: info.mark, gap: info.gap } : {};
      info = Object.assign({ kind: 'todo', pre: '- [', chk: m[1] === '' ? ' ' : m[1], mid: '] ', text: v.slice(m[0].length) }, keep);
      inp.value = info.text; li.classList.remove('plain', 'blank'); li.classList.add('todo');
      li.classList.toggle('done', info.chk !== ' ');
    } else if (info.kind === 'blank') info = { kind: 'plain', text: v };
    else info.text = v;
    writeLine(i, info);
  }
  function editKey(e, i, inp) {
    var info = rowInfo(logModel.lines[i]), s = activeSec();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (info.kind === 'todo' && info.text === '' && !info.mark) {   // leere Häkchen-Zeile + Enter → Liste beenden
        writeLine(i, { kind: 'blank', raw: '' }); endEdit(); return;
      }
      var next = info.kind === 'todo' ? '- [ ] ' : '';
      endEdit(); insertRowAfter(i, next); renderRows(); startEdit(i + 1);
    } else if (e.key === 'Backspace' && inp.value === '' && inp.selectionStart === 0 && !info.mark) {
      e.preventDefault();
      if (info.kind === 'todo') { writeLine(i, { kind: 'plain', text: '' }); var li = rowEl(i); edit = null; fillRow(li, i); startEdit(i); }
      else if (i > s.start) { edit = null; logModel.lines.splice(i, 1); logCommit(); lastRow = i - 1; renderRows(); startEdit(i - 1); }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      var j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j >= s.start && j < s.end && rowEl(j)) { e.preventDefault(); endEdit(); startEdit(j); }
    } else if (e.key === 'Escape') { e.preventDefault(); inp.blur(); }
  }
  function addRow() {
    if (!guardWrite()) return;
    var s = activeSec(), at = s.end - 1;
    while (at >= s.start && !/\S/.test(logModel.lines[at])) at--;   // hinter die letzte belegte Zeile
    if (at < s.start) at = s.head >= 0 ? s.head : -1;
    if (edit) endEdit();
    var line = '- [ ] ';
    if (at === -1 && logModel.lines.length === 1 && logModel.lines[0] === '') logModel.lines[0] = line;   // leere Notiz
    else logModel.lines.splice(at + 1, 0, line);
    logCommit(); refreshCounts(); renderRows(); startEdit(at + 1 < 0 ? 0 : at + 1);
  }
  function addSection(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    addingSec = false;
    if (!name || !guardWrite()) { renderTabs(); return; }
    if (logText === '') logModel.lines = ['## ' + name]; else logModel.lines.push('## ' + name);
    logCommit();
    logAct = logModel.secs.length - 1; logActTitle = name;
    renderLog();
  }

  // Songstelle: Host-Position (Sekunden / Takt) → " @1:24" bzw. " @T33" an die Zeile hängen
  function markText() {
    if (!tp) return null;
    return markUnit === 'bar' ? 'T' + tp.bar : fmtTime(tp.sec);
  }
  function renderMark() {
    var t = markText();
    btnMark.disabled = !t;
    btnMark.textContent = t ? '⏱ ' + (markUnit === 'bar' ? 'Takt ' + tp.bar : t) : '⏱ keine Songposition';
    btnMark.title = t ? 'Stelle im Song in die Zeile schreiben' : 'Der Host liefert keine Songposition (z. B. Standalone) – Stelle merken geht dort nicht.';
    btnUnit.disabled = !t;
    btnUnit.textContent = markUnit === 'bar' ? 'Zeit' : 'Takt';
    btnUnit.title = markUnit === 'bar' ? 'Stattdessen die Zeit merken' : 'Stattdessen den Takt merken';
  }
  function markNow() {
    var t = markText();
    if (!t || !guardWrite()) return;
    var i = edit ? edit.i : lastRow, s = activeSec();
    if (i < s.start || i >= s.end || rowInfo(logModel.lines[i]).kind === 'blank') {
      addRow();   // keine Zeile gewählt → neue Häkchen-Zeile nur mit Stelle
      i = edit ? edit.i : -1;
      if (i < 0) return;
    }
    var info = rowInfo(logModel.lines[i]);
    info.mark = t; if (info.gap === undefined) info.gap = ' ';
    writeLine(i, info);
    if (edit) { var inp = edit.inp; edit = null; fillRow(rowEl(i), i); startEdit(i); }
    else fillRow(rowEl(i), i);
  }
  window.SecretNotesTransport = function (t) {
    tpMiss = 0;
    tp = t && t.ok && isFinite(t.sec) && isFinite(t.bar) ? { sec: +t.sec, bar: +t.bar } : null;
    renderMark();
  };
  function pollTransport() {
    if (!NATIVE || !logOn || document.hidden) return;
    if (++tpMiss > 3 && tp) { tp = null; renderMark(); }   // keine Antwort (alter Plugin-Stand) → Knopf grau
    send({ msg: 'TRANSPORT' });
  }
  function setLogOn(on) {
    logOn = on; elBodyBox.classList.toggle('textmode', !on);
    (on ? document.querySelector('.songbar') : elBodyBox).insertBefore(elStatus, on ? btnMark : null);   // Status wandert mit
    try { localStorage.setItem(LS_VIEW, on ? 'log' : 'text'); } catch (e) {}
    if (on) { logModel = null; renderLog(); } else { endEdit(); }
    chkLog.checked = on;
  }
  elTabs.addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    if (b.id === 'tabAdd') { if (!guardWrite()) return; addingSec = true; renderTabs(); return; }
    if (edit) endEdit();
    logAct = +b.dataset.k; logActTitle = activeSec().title; lastRow = -1; renderTabs(); renderRows();
  });
  elRows.addEventListener('click', function (e) {
    var li = e.target.closest('li');
    if (!li) return;
    if (li.id === 'rowAdd') { addRow(); return; }
    var i = +li.dataset.i;
    if (e.target.classList.contains('cb')) { toggleRow(i); return; }
    if (e.target.tagName !== 'INPUT') startEdit(i);
  });
  btnMark.addEventListener('mousedown', function (e) { e.preventDefault(); });   // Fokus (und damit die Zeile) behalten
  btnMark.addEventListener('click', markNow);
  btnUnit.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btnUnit.addEventListener('click', function () {
    markUnit = markUnit === 'bar' ? 'time' : 'bar';
    try { localStorage.setItem(LS_MARK, markUnit); } catch (e) {}
    renderMark();
  });
  chkLog.addEventListener('change', function () { setLogOn(chkLog.checked); });
  setInterval(pollTransport, 500);
  // Für Proben (Browser-Labor): reine Funktionen, kein Zugriff auf Konto/Token
  window.SecretNotesLog = { parse: parseLog, build: buildLog, row: rowInfo, compose: composeRow, fmtTime: fmtTime };

  // --- Events ---
  // iPlug2 fängt keydown/keyup auf document-Ebene ab (außer type="text") und blockt sie →
  // in Textarea/E-Mail/Passwort auf Element-Ebene stoppen, sonst kann man nicht tippen.
  [ta, elEmail, elPw, nameInput].forEach(function (el) {
    ['keydown', 'keyup', 'keypress'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
  });
  // Nach jeder Änderung des Textes (Tippen im Textfeld oder in der Studio-Log-Ansicht)
  function onEdited() {
    st.text = ta.value; st.dirty = true; stopRetry = false; lastKey = Date.now(); persist();
    if (!st.note) setStatus('ohne Namen – nur im Projekt gespeichert', 'warn');
    else if (loggedIn()) scheduleSave();
    else setStatus('Abgemeldet – lokal gespeichert', 'warn');
  }
  ta.addEventListener('input', function () {
    if (readOnly) { setStatus('Nur lesen', 'warn'); return; }
    onEdited();
  });
  ta.addEventListener('keydown', function () { if (readOnly) setStatus('Nur lesen', 'warn'); lastKey = Date.now(); });
  ta.addEventListener('input', updateMore);
  ta.addEventListener('scroll', updateMore);
  window.addEventListener('resize', updateMore);
  elName.addEventListener('click', function () { closeMenu(); openPicker(); });
  nameInput.addEventListener('input', renderList);
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); chooseNote(nameInput.value); }
    if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
  });
  document.addEventListener('mousedown', function (e) {
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && e.target !== elName) closePicker();
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btnMenu.contains(e.target)) closeMenu();
  });
  btnMenu.addEventListener('click', function () { if (menu.classList.contains('hidden')) openMenu(); else closeMenu(); });
  btnPick.addEventListener('click', function () { closeMenu(); openPicker(); });
  chkAuto.addEventListener('change', function () {
    if (chkAuto.checked) { if (project) chooseNote(project, true); else { st.auto = true; persist(); renderHeader(); } }
    else { st.auto = false; persist(); renderHeader(); }
  });
  btnLogin.addEventListener('click', login);
  elPw.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  elCap.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  btnCapNew.addEventListener('click', function () { captchaShow(); });
  elCapImg.addEventListener('click', function () { captchaShow(); });
  elEmail.addEventListener('keydown', function (e) { if (e.key === 'Enter') elPw.focus(); });
  btnLogout.addEventListener('click', function () { closeMenu(); logout(); });
  function openSite() { closeMenu(); window.open(cfg.url, '_blank'); }
  btnSite.addEventListener('click', openSite);
  brand.addEventListener('click', openSite);
  window.addEventListener('online', function () { tick(); });

  // --- Fenstergröße (nur nativ, freier Drag-Griff unten rechts) ---
  (function initResize() {
    var handle = $('resizeHandle');
    if (!handle) return;
    if (!NATIVE) { handle.classList.add('hidden'); return; }
    var sx = 0, sy = 0, sw = 0, sh = 0;
    var mv = function (e) { send({ msg: 'RESIZE', width: Math.round(sw + e.clientX - sx), height: Math.round(sh + e.clientY - sy) }); };
    var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      sx = e.clientX; sy = e.clientY; sw = window.innerWidth; sh = window.innerHeight;
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  })();

  // Fenster geht zu, während noch ungespeichert: letzter Versuch (keepalive, best effort)
  window.addEventListener('pagehide', function () {
    if (!st.dirty || !loggedIn() || !st.note || readOnly) return;
    try {
      fetch(cfg.url + notePath(), {
        method: 'PUT', keepalive: true, cache: 'no-store',
        headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: st.text, base_updated_at: st.updated_at })
      });
    } catch (e) {}
  });

  // --- Start: erst lokaler Stand, dann Server ---
  var booted = false, lastInit = null;
  function boot() {
    booted = true;
    renderHeader(); renderAuth();
    setText(st.text, false);
    setLogOn(logOn);
    if (loggedIn()) {
      setStatus('verbinde …');
      checkMe().then(function () { if (st.note) return sync(); }).then(refreshNotes);
    } else idleStatus();
    setInterval(tick, POLL_MS);
    requestProject(); setTimeout(requestProject, 1000);   // zwei Lesungen → Name nach ~1 s statt 5 s
  }

  // Nativ: Antwort auf PROJECT – "" = unbekannt/unbenannt. Erst bei zwei gleichen Lesungen handeln
  // (offene Dialoge oder fremde Fenster liefern kurzzeitig falsche Titel).
  window.SecretNotesProject = function (name) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name) || GENERIC_RE.test(name)) name = '';   // C++ filtert schon, hier doppelt (Hub/andere Plattformen)
    if (name === projSeen) projCount++; else { projSeen = name; projCount = 1; }
    var changed = name !== project;
    project = name;
    if (changed) renderHeader();
    if (!booted || !name || projCount < 2) return;
    if (!st.note) chooseNote(name, true);
    else if (st.auto && name !== st.note) followProject(name);
  };

  // Nativ: C++ ruft SecretNotesInit({config, state, host, configPath}) – beim Öffnen und nach Host-Restore
  window.SecretNotesInit = function (d) {
    d = d || {};
    var key = JSON.stringify([d.config || {}, d.state || {}]);
    if (booted && key === lastInit) return;   // doppelter Init (REQUEST_INIT + OnUIOpen)
    lastInit = key;
    if (d.host) hostLabel = String(d.host);
    if (d.version) pluginVersion = String(d.version);
    if (d.configPath) configPath = String(d.configPath);
    cfg = Object.assign({ url: API_DEFAULT, email: null, token: null, name: null }, d.config || {});
    cfg.url = String(cfg.url || API_DEFAULT).replace(/\/+$/, '');
    var ns = Object.assign({ note: null, text: '', updated_at: null, dirty: false, auto: false }, d.state || {});
    if (!booted) { st = ns; return boot(); }
    // schon gestartet (Projekt neu geladen, Undo, Preset): neuen Stand übernehmen
    if (ns.note !== st.note || ns.text !== st.text || ns.updated_at !== st.updated_at) {
      clearTimeout(saveTimer); saveTimer = null;
      st = ns; etag = null; meta = null; readOnly = false; stopRetry = false;
      renderHeader(); setText(st.text, false);
      log('init: Stand vom Host übernommen');
    }
    renderAuth(); idleStatus();
    if (loggedIn() && st.note) sync();
  };

  if (NATIVE) {
    setStatus('lädt …'); send({ msg: 'REQUEST_INIT' });
    setTimeout(function () {
      if (booted) return;
      log('init: keine Antwort vom Plugin nach ' + INIT_TIMEOUT_MS + ' ms – Start ohne Host-Stand');
      boot();
      setStatus('⚠︎ Plugin-Bridge antwortet nicht – nichts wird gespeichert', 'err');
    }, INIT_TIMEOUT_MS);
  } else boot();

  // Für Tests/Debug (kein Token, kein Passwort)
  window.SecretNotes = { version: UI_VERSION, native: NATIVE, state: function () { return { note: st.note, auto: !!st.auto, project: project, dirty: st.dirty, updated_at: st.updated_at, readOnly: readOnly, online: online, loggedIn: loggedIn(), host: hostName() }; } };
})();

// Geteilte Listen (Einkaufsliste, Aufgaben): Server (Worker/KV) ist die Quelle der Wahrheit.
// Änderungen gehen als Einzeloperationen raus (hintereinander), danach gilt der Serverstand.
(function () {
  'use strict';
  var D = window.DATA;
  var NAMES = ['groceries', 'chores', 'meals', 'recipes'];
  var state = { rev: {}, queue: Promise.resolve(), pending: 0, failed: {}, day: '' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }

  // Aufgaben wiederholen sich täglich: "erledigt" gilt nur für den Tag, an dem es abgehakt wurde.
  function inflate(name, items) {
    if (name === 'chores') {
      var t = todayStr();
      items.forEach(function (c) {
        c.done = c.doneOn === t;
        if (!c.done) delete c.doneBy;
      });
    }
    return items;
  }

  function apply(name, data) {
    state.rev[name] = data.rev || 0;
    if (name === 'recipes') {
      var custom = data.items || [];
      var customIds = new Set(custom.map(function (c) { return c.id; }));
      var base = (window.BASE_RECIPES || []).filter(function (b) { return !customIds.has(b.id); });
      D.recipes = base.concat(custom);
    } else {
      D[name] = inflate(name, data.items || []);
    }
    App.emit('lists', name);
  }

  function load(name) {
    var headers = {};
    if (state.rev[name]) headers['If-None-Match'] = '"rev-' + state.rev[name] + '"';
    return fetch('/api/list/' + name, { headers: headers, cache: 'default' })
      .then(function (r) {
        if (r.status === 304) return null;
        return r.ok ? r.json() : null;
      })
      .then(function (d) { if (d && state.pending === 0 && d.rev !== state.rev[name]) apply(name, d); })
      .catch(function () {});
  }

  function post(name, op) {
    function go() {
      var pin = '';
      try { pin = localStorage.getItem('upload_pin') || ''; } catch (e) {}
      return fetch('/api/list/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pin': pin },
        body: JSON.stringify(op)
      });
    }
    return go().then(function (r) {
      if (r.status !== 401) return r;
      var pin = window.prompt('PIN zum Speichern:');
      if (!pin) return r;
      try { localStorage.setItem('upload_pin', pin); } catch (e) {}
      return go();
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function send(name, op) {
    state.pending++;
    state.queue = state.queue.then(function () {
      return post(name, op).then(function (d) {
        if (state.pending === 1) apply(name, d);   // nur der letzte Stand der Warteschlange zählt
      }).catch(function () {
        state.failed[name] = true;
        App.toast('Konnte nicht speichern (PIN oder Netz)', { icon: 'bolt', ms: 4000 });
      });
    }).then(function () {
      state.pending--;
      if (state.pending === 0) {
        NAMES.forEach(function (n) { if (state.failed[n]) { state.failed[n] = false; state.rev[n] = -1; load(n); } });
      }
    });
  }

  function clean(name, item) {
    var o = {};
    Object.keys(item).forEach(function (k) { if (k !== 'done' || name === 'groceries') o[k] = item[k]; });
    if (name === 'chores') o.doneOn = item.done ? todayStr() : null;
    return o;
  }

  App.todayStr = todayStr;
  App.Lists = {
    upsert: function (name, items) { send(name, { upsert: items.map(function (i) { return clean(name, i); }) }); },
    remove: function (name, ids) { send(name, { remove: ids }); },
    uid: function (prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); },
    reload: function () { NAMES.forEach(load); }
  };

  state.day = todayStr();
  App.on('minute', function () {
    if (state.day !== todayStr()) {          // Mitternacht: Aufgaben wieder offen
      state.day = todayStr();
      inflate('chores', D.chores);
      App.emit('lists', 'chores');
    }
  });
  var pollTick = 0;
  setInterval(function () {
    if (window.App && window.App.mode === 'night') return; // Nachts Server-Polling pausieren
    pollTick++;
    ['groceries', 'chores', 'meals'].forEach(load);
    if (pollTick % 10 === 0) load('recipes');
  }, 45000);
  App.on('mode', function (m) {
    if (m === 'day') NAMES.forEach(load);
  });
  NAMES.forEach(load);
})();

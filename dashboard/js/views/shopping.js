// Shopping: categorized list (left) + quick-add with usuals (right).
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, subtab: 'groceries', store: 'all', query: '', drawer: false, pending: {}, flash: null };
  var DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  // Vom Handy hinzugefügte Artikel haben noch keine Kategorie: hier einsortieren (nur lokal).
  function fixCats() {
    D.groceries.forEach(function (g) { if (!g.cat || g.cat === 'Sonstiges') g.cat = categorize(g.name); });
  }

  function open() { return D.groceries.filter(function (g) { return !g.done && (V.store === 'all' || g.store === V.store); }); }
  function done() { return D.groceries.filter(function (g) { return g.done && (V.store === 'all' || g.store === V.store); }); }
  function storeName(id) { return D.stores.filter(function (s) { return s.id === id; })[0].name; }

  function categorize(name) {
    var n = name.toLowerCase();
    var hit = D.catalog.filter(function (c) { return c[0].toLowerCase() === n; })[0] ||
      D.catalog.filter(function (c) { var a = c[0].toLowerCase(); return a.indexOf(n) > -1 || n.indexOf(a) > -1; })[0] ||
      D.catalog.filter(function (c) { return n.split(/\s+/).some(function (w) { return w.length > 3 && c[0].toLowerCase().indexOf(w) > -1; }); })[0];
    return hit ? hit[1] : 'Sonstiges';
  }
  function find(name, isDone) {
    return D.groceries.filter(function (g) { return !!g.done === isDone && g.name.toLowerCase() === name.toLowerCase(); })[0];
  }

  function mealsHTML() {
    var curDay = (App.now().getDay() + 6) % 7;
    var mealsMap = {};
    (D.meals || []).forEach(function (m) { mealsMap[m.day] = m; });
    return '<div class="s-meals-wrap">' + DAYS.map(function (dayName, idx) {
      var m = mealsMap[idx] || { id: 'm_' + idx, day: idx, title: '', ingredients: '' };
      var isToday = idx === curDay;
      return '<div class="s-meal-col' + (isToday ? ' is-today' : '') + '" data-day="' + idx + '">' +
        '<div>' +
        '  <div class="s-meal-day">' + App.esc(dayName) + (isToday ? ' · Heute' : '') + '</div>' +
        '  <div class="s-meal-title' + (!m.title ? ' is-empty' : '') + '" data-edit-meal="' + idx + '">' + (m.title ? App.esc(m.title) : '+ Gericht planen') + '</div>' +
        (m.ingredients ? '  <div class="s-meal-ing"><b>Zutaten:</b> ' + App.esc(m.ingredients) + '</div>' : '') +
        '</div>' +
        '<div class="s-meal-foot">' +
        '  <button class="s-meal-btn" data-edit-meal="' + idx + '">' + (m.title ? 'Bearbeiten' : 'Planen') + '</button>' +
        (m.ingredients ? '  <button class="s-meal-btn s-meal-btn--cart" data-cart-meal="' + idx + '">🛒 Auf Liste</button>' : '') +
        '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function openMealSheet(dayIdx) {
    var dayName = DAYS[dayIdx];
    var m = (D.meals || []).filter(function (x) { return x.day === dayIdx; })[0] || { id: 'm_' + dayIdx, day: dayIdx, title: '', ingredients: '' };
    var html = '<div class="t-sheet-head"><div><b>' + App.esc(dayName) + '</b><small>Gericht &amp; Zutaten planen</small></div><button class="btn-close" id="mClose">✕</button></div>' +
      '<div style="padding:16px 0;display:flex;flex-direction:column;gap:12px">' +
      '<label class="label">Gericht</label>' +
      '<input id="mDish" class="s-input" style="height:56px;padding:0 16px;background:var(--paper-2);border-radius:12px;border:1px solid var(--line);font-size:20px" placeholder="z. B. Pasta Carbonara, Ofengemüse..." value="' + App.esc(m.title) + '">' +
      '<label class="label">Zutaten (durch Komma getrennt)</label>' +
      '<input id="mIng" class="s-input" style="height:56px;padding:0 16px;background:var(--paper-2);border-radius:12px;border:1px solid var(--line);font-size:18px" placeholder="z. B. Spaghetti, Eier, Speck, Parmesan" value="' + App.esc(m.ingredients) + '">' +
      '<div style="display:flex;gap:10px;margin-top:10px">' +
      '<button id="mSave" class="btn btn--solid" style="flex:1">Speichern</button>' +
      (m.title ? '<button id="mDel" class="btn btn--ghost" style="color:var(--alert)">Löschen</button>' : '') +
      '</div></div>';
    App.sheet(html, {
      onMount: function (el, close) {
        var dishInp = el.querySelector('#mDish');
        var ingInp = el.querySelector('#mIng');
        dishInp.focus();
        el.querySelector('#mClose').onclick = close;
        el.querySelector('#mSave').onclick = function () {
          var title = dishInp.value.trim();
          var ing = ingInp.value.trim();
          m.title = title;
          m.ingredients = ing;
          var next = (D.meals || []).filter(function (x) { return x.id !== m.id; });
          if (title || ing) next.push(m);
          D.meals = next;
          App.Lists.upsert('meals', [m]);
          close();
          render();
          App.toast('Plan für ' + dayName + ' gespeichert', { icon: 'check' });
        };
        var delBtn = el.querySelector('#mDel');
        if (delBtn) delBtn.onclick = function () {
          D.meals = (D.meals || []).filter(function (x) { return x.id !== m.id; });
          App.Lists.remove('meals', [m.id]);
          close();
          render();
          App.toast('Gericht gelöscht', { icon: 'check' });
        };
      }
    });
  }

  function addIngredientsToCart(ingString) {
    if (!ingString) return;
    var items = ingString.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    items.forEach(function (name) { add(name); });
    App.toast(items.length + ' Zutaten zur Einkaufsliste hinzugefügt! 🛒', { icon: 'cart' });
  }

  function row(g) {
    return '<div class="s-row' + (V.pending[g.id] ? ' is-checking' : '') + '" data-id="' + g.id + '">' +
      '<button class="s-hit" data-check="' + g.id + '">' +
      '<span class="s-box">' + App.icon('check', 22) + '</span>' +
      '<span class="s-name"><b>' + App.esc(g.name) + '</b>' + (g.note ? '<small>' + App.esc(g.note) + '</small>' : '') + '</span>' +
      (V.store === 'all' && g.store !== 'rewe' ? '<span class="s-store">' + storeName(g.store) + '</span>' : '') +
      '</button>' +
      '<div class="s-qty"><button data-qty="-1" data-id="' + g.id + '" aria-label="Weniger">' + App.icon('minus', 22) + '</button><span class="num">' + g.qty + '</span><button data-qty="1" data-id="' + g.id + '" aria-label="Mehr">' + App.icon('plus', 22) + '</button></div>' +
      '</div>';
  }

  function listHTML() {
    var items = open(), order = D.catOrder[V.store].concat(['Sonstiges']);
    var groups = order.map(function (cat) { return { cat: cat, items: items.filter(function (g) { return g.cat === cat; }) }; }).filter(function (x) { return x.items.length; });
    var d = done();
    return (items.length ? groups.map(function (gr) {
      return '<div class="s-cat" data-cat="' + gr.cat + '"><div class="s-cat-h"><span class="label">' + gr.cat + '</span><span class="label" data-cat-count>' + gr.items.length + '</span></div>' + gr.items.map(row).join('') + '</div>';
    }).join('') : '<div class="s-empty serif">Alles erledigt.<br><i>Nichts mehr einzukaufen.</i></div>') +
      (d.length ? '<div class="s-drawer' + (V.drawer ? ' is-open' : '') + '">' +
        '<button class="s-drawer-h" data-drawer><span>' + App.icon('check', 22) + ' Erledigt <b class="num">(' + d.length + ')</b></span><span class="label">' + (V.drawer ? 'Ausblenden' : 'Anzeigen') + '</span></button>' +
        (V.drawer ? '<div class="s-drawer-list">' + d.map(function (g) {
          return '<button class="s-got" data-revive="' + g.id + '">' + App.esc(g.name) + '<span class="label">Wiederherstellen</span></button>';
        }).join('') + '<button class="btn btn--ghost s-clear" data-clear>' + d.length + ' erledigte Artikel löschen</button></div>' : '') +
        '</div>' : '');
  }

  function suggestHTML() {
    var q = V.query.trim().toLowerCase();
    if (q) {
      var matches = D.catalog.filter(function (c) { return c[0].toLowerCase().indexOf(q) === 0; })
        .concat(D.catalog.filter(function (c) { var i = c[0].toLowerCase().indexOf(q); return i > 0; })).slice(0, 5);
      var exact = matches.some(function (m) { return m[0].toLowerCase() === q; });
      return '<div class="label">Vorschläge</div><div class="s-ac">' + matches.map(function (m) {
        var on = find(m[0], false);
        return '<button class="s-ac-row" data-add="' + App.esc(m[0]) + '"><b>' + App.esc(m[0]) + '</b><span class="label">' + (on ? 'Auf der Liste · ×' + on.qty : m[1]) + '</span>' + App.icon('plus', 26) + '</button>';
      }).join('') + (exact ? '' : '<button class="s-ac-row s-ac-row--new" data-add="' + App.esc(V.query.trim()) + '"><b>Hinzufügen: “' + App.esc(V.query.trim()) + '”</b><span class="label">' + categorize(V.query) + '</span>' + App.icon('plus', 26) + '</button>') + '</div>';
    }
    return '<div class="label">Häufig gekauft · Zum Hinzufügen tippen</div><div class="s-usuals">' + D.usuals.map(usualTile).join('') + '</div>';
  }
  function usualTile(name) {
    var on = find(name, false);
    return '<button class="s-tile' + (on ? ' is-on' : '') + '" data-add="' + App.esc(name) + '">' +
      '<b>' + App.esc(name) + '</b><span>' + (on ? App.icon('check', 16) + 'Auf der Liste' + (on.qty > 1 ? ' ×' + on.qty : '') : categorize(name)) + '</span></button>';
  }

  // ---- granular updates (full list + usuals rebuild costs ~500ms on the wall tablet)
  function swap(old, html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    old.parentNode.replaceChild(tmp.firstChild, old);
  }
  function refreshSuggestFor(g) {
    if (V.query.trim()) return paintSuggest();
    var t = V.el.querySelector('.s-usuals [data-add="' + App.esc(g.name) + '"]');
    if (t) swap(t, usualTile(g.name));
  }
  function catCount(cat) {
    var c = V.el.querySelector('.s-cat[data-cat="' + cat + '"]');
    if (!c) return;
    var n = c.querySelectorAll('.s-row').length;
    if (!n) c.parentNode.removeChild(c);
    else c.querySelector('[data-cat-count]').textContent = n;
  }
  function inView(g) { return !g.done && (V.store === 'all' || g.store === V.store); }
  function insertRow(g) {
    var cat = V.el.querySelector('.s-cat[data-cat="' + g.cat + '"]');
    if (!inView(g)) return paintHead();
    if (!cat) return paintList();
    var tmp = document.createElement('div');
    tmp.innerHTML = row(g);
    cat.appendChild(tmp.firstChild);
    catCount(g.cat);
    paintHead();
  }
  function removeRow(g) {
    var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]');
    var drawer = V.el.querySelector('.s-drawer');
    if (!r || !drawer || V.drawer || !open().length) return paintList();
    r.parentNode.removeChild(r);
    catCount(g.cat);
    drawer.querySelector('.num').textContent = '(' + done().length + ')';
    paintHead();
  }
  function flash(g) {
    var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]');
    if (!r) return;
    r.classList.add('is-flash');
    if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    setTimeout(function () { r.classList.remove('is-flash'); }, 1200);
  }

  function paintList() { fixCats(); var l = V.el.querySelector('.s-list'); var st = l.scrollTop; l.innerHTML = listHTML(); l.scrollTop = st; paintHead(); }
  function paintSuggest() { V.el.querySelector('.s-suggest').innerHTML = suggestHTML(); }
  function paintHead() {
    var all = D.groceries.filter(function (g) { return !g.done; });
    V.el.querySelector('.s-count').innerHTML = '<span class="num">' + open().length + '</span> offen';
    V.el.querySelector('.s-stores').innerHTML = [['all', 'Alle']].concat(D.stores.map(function (s) { return [s.id, s.name]; })).map(function (s) {
      var n = s[0] === 'all' ? all.length : all.filter(function (g) { return g.store === s[0]; }).length;
      return '<button class="' + (V.store === s[0] ? 'is-on' : '') + '" data-store="' + s[0] + '">' + s[1] + ' <span class="num">' + n + '</span></button>';
    }).join('');
  }
  function render() {
    if (V.subtab === 'meals') {
      V.el.innerHTML = '<div class="shop" style="grid-template-columns:1fr;grid-template-rows:auto 1fr">' +
        '<header class="s-head"><div><div class="label">Kochen &amp; Planen</div><h1 class="serif">Wochen-Essensplan</h1></div>' +
        '<div class="s-tab-bar">' +
        '  <button class="' + (V.subtab === 'groceries' ? 'is-on' : '') + '" data-subtab="groceries">Einkaufsliste</button>' +
        '  <button class="' + (V.subtab === 'meals' ? 'is-on' : '') + '" data-subtab="meals">Wochenplan</button>' +
        '</div></header>' +
        mealsHTML() +
        '</div>';
      return;
    }

    V.el.innerHTML = '<div class="shop">' +
      '<header class="s-head"><div><div class="label">Gemeinsame Liste</div><h1 class="serif">Einkaufsliste</h1></div>' +
      '<div class="s-tab-bar">' +
      '  <button class="' + (V.subtab === 'groceries' ? 'is-on' : '') + '" data-subtab="groceries">Einkaufsliste</button>' +
      '  <button class="' + (V.subtab === 'meals' ? 'is-on' : '') + '" data-subtab="meals">Wochenplan</button>' +
      '</div>' +
      '<div class="s-count"></div><div class="seg s-stores"></div></header>' +
      '<div class="s-list"></div>' +
      '<aside class="s-side">' +
      '  <div class="s-add">' +
      '    <label class="s-input-wrap">' + App.icon('plus', 30) + '<input class="s-input" placeholder="Artikel hinzufügen…" autocomplete="off" enterkeyhint="done"></label>' +
      '  </div>' +
      '  <div class="s-suggest"></div>' +
      '</aside></div>';
    var input = V.el.querySelector('.s-input');
    input.value = V.query;
    input.addEventListener('input', function () { V.query = input.value; paintSuggest(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value.trim()) { add(input.value); } });
    paintList(); paintSuggest();
  }

  function add(name) {
    name = name.trim();
    var g = find(name, false), msg;
    if (g) {
      g.qty++;
      msg = 'Bereits auf der Liste · jetzt <b>×' + g.qty + '</b> ' + App.esc(g.name);
      var q = V.el.querySelector('.s-list [data-id="' + g.id + '"] .s-qty .num');
      if (q) q.textContent = g.qty;
    } else if ((g = find(name, true))) {
      g.done = false; g.qty = 1;
      msg = 'Wieder hinzugefügt: <b>' + App.esc(g.name) + '</b>';
      paintList();
    } else {
      var cat = D.catalog.filter(function (c) { return c[0].toLowerCase() === name.toLowerCase(); })[0];
      g = { id: D._gid(), name: cat ? cat[0] : name.charAt(0).toUpperCase() + name.slice(1), cat: categorize(name), qty: 1, store: V.store === 'all' ? 'rewe' : V.store, done: false, note: '' };
      D.groceries.push(g);
      msg = '<b>' + App.esc(g.name) + '</b> hinzugefügt zu ' + g.cat;
      if (V.subtab === 'groceries') insertRow(g);
    }
    App.Lists.upsert('groceries', [g]);
    var hadQuery = !!V.query.trim();
    V.query = '';
    var input = V.el ? V.el.querySelector('.s-input') : null;
    if (input) input.value = '';
    if (V.subtab === 'groceries') {
      if (hadQuery) paintSuggest(); else refreshSuggestFor(g);
      flash(g);
    }
    App.emit('data');
    App.toast(msg, { icon: 'cart', ms: 3000 });
  }

  function check(g) {
    V.pending[g.id] = true;
    var rowEl = V.el.querySelector('[data-id="' + g.id + '"]');
    rowEl.classList.add('is-checking');
    setTimeout(function () {
      if (!V.pending[g.id]) return;
      delete V.pending[g.id];
      g.done = true;
      App.Lists.upsert('groceries', [g]);
      removeRow(g);
      refreshSuggestFor(g);
      App.emit('data');
    }, 1200);
    App.toast('<b>' + App.esc(g.name) + '</b> abgehakt', {
      icon: 'check',
      undo: function () {
        var wasDone = g.done;
        delete V.pending[g.id];
        g.done = false;
        App.Lists.upsert('groceries', [g]);
        if (wasDone) paintList();
        else { var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]'); if (r) r.classList.remove('is-checking'); }
        refreshSuggestFor(g);
        App.emit('data');
      }
    });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-subtab]'))) {
      V.subtab = t.dataset.subtab;
      return render();
    }
    if ((t = e.target.closest('[data-edit-meal]'))) {
      return openMealSheet(parseInt(t.dataset.editMeal, 10));
    }
    if ((t = e.target.closest('[data-cart-meal]'))) {
      var dIdx = parseInt(t.dataset.cartMeal, 10);
      var m = (D.meals || []).filter(function (x) { return x.day === dIdx; })[0];
      if (m && m.ingredients) addIngredientsToCart(m.ingredients);
      return;
    }
    if ((t = e.target.closest('[data-check]'))) {
      var g = D.groceries.filter(function (x) { return x.id === t.dataset.check; })[0];
      if (g && !V.pending[g.id]) check(g);
      else if (g) { delete V.pending[g.id]; t.parentNode.classList.remove('is-checking'); }
      return;
    }
    if ((t = e.target.closest('[data-qty]'))) {
      var q = D.groceries.filter(function (x) { return x.id === t.dataset.id; })[0];
      q.qty = Math.max(1, q.qty + +t.dataset.qty);
      App.Lists.upsert('groceries', [q]);
      t.parentNode.querySelector('.num').textContent = q.qty;
      refreshSuggestFor(q);
      return;
    }
    if ((t = e.target.closest('[data-add]'))) return add(t.dataset.add);
    if ((t = e.target.closest('[data-store]'))) { V.store = t.dataset.store; return paintList(); }
    if ((t = e.target.closest('[data-drawer]'))) { V.drawer = !V.drawer; return paintList(); }
    if ((t = e.target.closest('[data-revive]'))) {
      var r = D.groceries.filter(function (x) { return x.id === t.dataset.revive; })[0];
      r.done = false; App.Lists.upsert('groceries', [r]); paintList(); paintSuggest(); App.emit('data');
      return App.toast('Wieder hinzugefügt: <b>' + App.esc(r.name) + '</b>', { icon: 'cart', ms: 2500 });
    }
    if ((t = e.target.closest('[data-clear]'))) {
      var gone = done();
      D.groceries = D.groceries.filter(function (x) { return gone.indexOf(x) < 0; });
      App.Lists.remove('groceries', gone.map(function (x) { return x.id; }));
      V.drawer = false;
      paintList();
      App.toast(gone.length + ' Artikel gelöscht', {
        icon: 'check', undo: function () { D.groceries = D.groceries.concat(gone); App.Lists.upsert('groceries', gone); paintList(); }
      });
    }
  }

  App.on('lists', function (name) {
    if (!V.el || !V.el.firstChild || App.current !== 'shopping') return;
    if (Object.keys(V.pending).length) return;
    if (name === 'groceries' && V.subtab === 'groceries') { paintList(); paintSuggest(); }
    else if (name === 'meals' && V.subtab === 'meals') { render(); }
  });

  App.register('shopping', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    }
  });
})();

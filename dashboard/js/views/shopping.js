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

  function mealsViewHTML(isStandalone) {
    var curDay = (App.now().getDay() + 6) % 7;
    var mealsMap = {};
    (D.meals || []).forEach(function (m) { mealsMap[m.day] = m; });
    return '<div class="meals-view">' +
      '<header class="meals-head"><div><div class="label">Kochen &amp; Planen</div><h1 class="serif">Wochen-Essensplan</h1></div>' +
      '<div class="meals-actions">' +
      '  <button class="s-m-btn" data-rcp-action="browse">📖 Rezepte stöbern</button>' +
      '  <button class="s-m-btn" data-rcp-action="dice">🎲 Schnelle Idee</button>' +
      '  <button class="s-m-btn s-m-btn--ai" data-rcp-action="ai">✨ KI-Rezept</button>' +
      (isStandalone ? '  <button class="s-m-btn s-m-btn--cart" data-go="shopping">' + App.icon('cart', 16) + ' Einkaufsliste</button>' : '  <button class="s-m-btn s-m-btn--cart" data-subtab="groceries">' + App.icon('cart', 16) + ' Einkaufsliste</button>') +
      '</div></header>' +
      '<div class="s-meals-wrap">' + DAYS.map(function (dayName, idx) {
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
        '  <button class="s-meal-btn s-meal-btn--rcp" data-pick-rcp="' + idx + '">💡 Rezept</button>' +
        (m.ingredients ? '  <button class="s-meal-btn s-meal-btn--cart" data-cart-meal="' + idx + '">' + App.icon('cart', 16) + ' Auf Liste</button>' : '') +
        '</div>' +
        '</div>';
    }).join('') + '</div>' +
    '</div>';
  }

  function openMealSheet(dayIdx) {
    var dayName = DAYS[dayIdx];
    var m = (D.meals || []).filter(function (x) { return x.day === dayIdx; })[0] || { id: 'm_' + dayIdx, day: dayIdx, title: '', ingredients: '' };
    var html = '<div class="t-sheet-head"><div><b>' + App.esc(dayName) + '</b><small>Gericht &amp; Zutaten planen</small></div></div>' +
      '<div style="padding:16px 0;display:flex;flex-direction:column;gap:12px">' +
      '<button id="mPickRcp" class="btn btn--ghost" style="border:1px solid #3b82f6;color:#3b82f6;margin-bottom:6px">💡 Aus Rezept-Datenbank wählen</button>' +
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
        el.querySelector('#mPickRcp').onclick = function () {
          close();
          openRecipeFinderSheet(dayIdx, 'browse');
        };
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
          if (M.el) renderMeals();
          App.emit('data');
          App.toast('Plan für ' + dayName + ' gespeichert', { icon: 'check' });
        };
        var delBtn = el.querySelector('#mDel');
        if (delBtn) delBtn.onclick = function () {
          D.meals = (D.meals || []).filter(function (x) { return x.id !== m.id; });
          App.Lists.remove('meals', [m.id]);
          close();
          render();
          if (M.el) renderMeals();
          App.emit('data');
          App.toast('Gericht gelöscht', { icon: 'check' });
        };
      }
    });
  }

  function openRecipeFinderSheet(dayIdx, mode) {
    if (dayIdx == null) dayIdx = (App.now().getDay() + 6) % 7;
    var targetDayName = DAYS[dayIdx];
    var currentTab = (mode === 'ai') ? 'ai' : 'catalog';
    var curCategory = 'all';
    var aiCategory = 'airfryer';
    var aiResult = null;

    function getRecipes() {
      return (D.recipes && D.recipes.length) ? D.recipes : (window.BASE_RECIPES || []);
    }

    if (mode === 'dice') {
      var all = getRecipes();
      if (all.length) aiResult = all[Math.floor(Math.random() * all.length)];
    }

    var html = '<div class="t-sheet-head">' +
      '<div><b>High-Protein Rezepte &amp; Inspiration</b><small>Für ' + App.esc(targetDayName) + ' · Airfryer, Reiskocher, Backofen, Pfanne</small></div>' +
      '</div>' +
      '<div class="rcp-sheet">' +
      '  <div class="rcp-nav">' +
      '    <button class="rcp-nav-btn is-active" id="rcpTabCat">📖 Rezept-Katalog (' + getRecipes().length + ')</button>' +
      '    <button class="rcp-nav-btn" id="rcpTabAi">✨ KI-Chef (Gemini)</button>' +
      '  </div>' +
      '  <div id="rcpCatView">' +
      '    <div class="rcp-filter-row">' +
      '      <button class="rcp-chip is-on" data-cat="all">Alle</button>' +
      '      <button class="rcp-chip" data-cat="airfryer">🍟 Airfryer</button>' +
      '      <button class="rcp-chip" data-cat="ricecooker">🍚 Reiskocher</button>' +
      '      <button class="rcp-chip" data-cat="oven">🥘 Backofen</button>' +
      '      <button class="rcp-chip" data-cat="pan">🍳 Pfanne</button>' +
      '      <input class="rcp-search" id="rcpSearch" placeholder="🔍 Suchen (z. B. Hähnchen, Lachs, Reis)...">' +
      '    </div>' +
      '    <div class="rcp-grid" id="rcpGrid"></div>' +
      '  </div>' +
      '  <div id="rcpAiView" style="display:none;" class="rcp-ai-box">' +
      '    <div style="font-size:14px;color:var(--mute)">Gib deine Zutaten oder Gelüste ein – Gemini zaubert ein maßgeschneidertes High-Protein-Rezept:</div>' +
      '    <input class="rcp-ai-input" id="aiInp" placeholder="z. B. Hähnchenbrust, Reis und Brokkoli im Reiskocher (min. 40g Protein)...">' +
      '    <div class="rcp-filter-row">' +
      '      <span class="label" style="margin-right:4px">Gerät:</span>' +
      '      <button class="rcp-chip is-on" data-ai-cat="airfryer">🍟 Airfryer</button>' +
      '      <button class="rcp-chip" data-ai-cat="ricecooker">🍚 Reiskocher</button>' +
      '      <button class="rcp-chip" data-ai-cat="oven">🥘 Backofen</button>' +
      '      <button class="rcp-chip" data-ai-cat="pan">🍳 Pfanne</button>' +
      '    </div>' +
      '    <div style="display:flex;gap:10px;align-items:center">' +
      '      <button class="rcp-ai-btn" id="aiBtn" style="flex:1">Rezept kreieren ✨</button>' +
      '      <button class="rcp-act-btn" id="aiKeyBtn" style="flex:none;padding:10px 14px">🔑 API-Key</button>' +
      '    </div>' +
      '    <div id="aiOut"></div>' +
      '  </div>' +
      '</div>';

    App.sheet(html, {
      cls: 'sheet--wide sheet-pad',
      onMount: function (el, close) {
        var catView = el.querySelector('#rcpCatView');
        var aiView = el.querySelector('#rcpAiView');
        var tabCat = el.querySelector('#rcpTabCat');
        var tabAi = el.querySelector('#rcpTabAi');
        var grid = el.querySelector('#rcpGrid');
        var searchInp = el.querySelector('#rcpSearch');
        var aiInp = el.querySelector('#aiInp');
        var aiBtn = el.querySelector('#aiBtn');
        var aiOut = el.querySelector('#aiOut');
        var aiKeyBtn = el.querySelector('#aiKeyBtn');

        function setTab(t) {
          currentTab = t;
          tabCat.classList.toggle('is-active', t === 'catalog');
          tabAi.classList.toggle('is-active', t === 'ai');
          catView.style.display = t === 'catalog' ? 'block' : 'none';
          aiView.style.display = t === 'ai' ? 'flex' : 'none';
          if (t === 'ai' && aiInp) aiInp.focus();
        }

        tabCat.onclick = function () { setTab('catalog'); };
        tabAi.onclick = function () { setTab('ai'); };

        function applyRecipeToDay(r) {
          var next = (D.meals || []).filter(function (x) { return x.day !== dayIdx; });
          var m = {
            id: 'm_' + dayIdx,
            day: dayIdx,
            title: r.title,
            ingredients: (r.ingredients || []).join(', ')
          };
          next.push(m);
          D.meals = next;
          App.Lists.upsert('meals', [m]);
          close();
          render();
          if (M.el) renderMeals();
          App.emit('data');
          App.toast('<b>' + App.esc(r.title) + '</b> für ' + targetDayName + ' eingeplant! 🍳', { icon: 'check' });
        }

        function renderGrid() {
          var q = (searchInp.value || '').toLowerCase().trim();
          var list = getRecipes().filter(function (r) {
            var mCat = curCategory === 'all' || r.category === curCategory;
            var mQ = !q || r.title.toLowerCase().indexOf(q) > -1 ||
              (r.description && r.description.toLowerCase().indexOf(q) > -1) ||
              (r.ingredients && r.ingredients.some(function (i) { return i.toLowerCase().indexOf(q) > -1; }));
            return mCat && mQ;
          });

          if (!list.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--mute)">Keine Rezepte gefunden</div>';
            return;
          }

          grid.innerHTML = list.map(function (r) {
            return '<div class="rcp-card" data-rcp-id="' + r.id + '">' +
              '  <div class="rcp-card-head">' +
              '    <div class="rcp-badges">' +
              '      <span class="rcp-badge rcp-badge--dev">' + App.esc(r.badge || r.category) + '</span>' +
              '      <span class="rcp-badge rcp-badge--pro">🍗 ' + (r.protein || 40) + 'g Protein</span>' +
              '      <span class="rcp-badge rcp-badge--time">⏱️ ' + (r.time || 15) + 'm</span>' +
              (r.calories ? '      <span class="rcp-badge rcp-badge--cal">' + r.calories + ' kcal</span>' : '') +
              '    </div>' +
              '    <div class="rcp-card-title">' + App.esc(r.title) + '</div>' +
              '    <div class="rcp-card-desc">' + App.esc(r.description || '') + '</div>' +
              '    <div class="rcp-card-steps" id="steps_' + r.id + '">' +
              '      <b>Zutaten:</b><br>' + (r.ingredients || []).map(function (i) { return '• ' + App.esc(i); }).join('<br>') +
              '      <br><br><b>Zubereitung:</b><br>' + (r.steps || []).map(function (s, idx) { return (idx + 1) + '. ' + App.esc(s); }).join('<br>') +
              '    </div>' +
              '  </div>' +
              '  <div class="rcp-card-actions">' +
              '    <button class="rcp-act-btn" data-toggle-steps="' + r.id + '">📖 Zubereitung</button>' +
              '    <button class="rcp-act-btn rcp-act-btn--primary" data-apply-rcp="' + r.id + '">📅 Für ' + targetDayName + '</button>' +
              '    <button class="rcp-act-btn rcp-act-btn--cart" data-cart-rcp="' + r.id + '">' + App.icon('cart', 16) + ' Auf Liste</button>' +
              '  </div>' +
              '</div>';
          }).join('');
        }

        searchInp.oninput = renderGrid;
        el.querySelectorAll('#rcpCatView [data-cat]').forEach(function (btn) {
          btn.onclick = function () {
            el.querySelectorAll('#rcpCatView [data-cat]').forEach(function (b) { b.classList.remove('is-on'); });
            btn.classList.add('is-on');
            curCategory = btn.dataset.cat;
            renderGrid();
          };
        });

        grid.onclick = function (e) {
          var tog = e.target.closest('[data-toggle-steps]');
          if (tog) {
            var st = el.querySelector('#steps_' + tog.dataset.toggleSteps);
            if (st) st.classList.toggle('is-open');
            return;
          }
          var ap = e.target.closest('[data-apply-rcp]');
          if (ap) {
            var r = getRecipes().filter(function (x) { return x.id === ap.dataset.applyRcp; })[0];
            if (r) applyRecipeToDay(r);
            return;
          }
          var crt = e.target.closest('[data-cart-rcp]');
          if (crt) {
            var rcp = getRecipes().filter(function (x) { return x.id === crt.dataset.cartRcp; })[0];
            if (rcp && rcp.ingredients) addIngredientsToCart(rcp.ingredients.join(', '));
            return;
          }
        };

        // AI View handlers
        el.querySelectorAll('#rcpAiView [data-ai-cat]').forEach(function (b) {
          b.onclick = function () {
            el.querySelectorAll('#rcpAiView [data-ai-cat]').forEach(function (x) { x.classList.remove('is-on'); });
            b.classList.add('is-on');
            aiCategory = b.dataset.aiCat;
          };
        });

        aiKeyBtn.onclick = function () {
          var curKey = localStorage.getItem('gemini_api_key') || '';
          var newKey = prompt('Google AI Studio API-Key eingeben (kostenlos auf aistudio.google.com):', curKey);
          if (newKey !== null) {
            localStorage.setItem('gemini_api_key', newKey.trim());
            fetch('/api/settings/gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Pin': localStorage.getItem('upload_pin') || '' },
              body: JSON.stringify({ key: newKey.trim() })
            }).catch(function () {});
            App.toast('API-Key gespeichert! ✨', { icon: 'check' });
          }
        };

        function renderAiCard(res) {
          aiOut.innerHTML = '<div class="rcp-ai-res">' +
            '  <div class="rcp-badges">' +
            '    <span class="rcp-badge rcp-badge--dev">' + App.esc(res.badge || res.category) + '</span>' +
            '    <span class="rcp-badge rcp-badge--pro">🍗 ' + (res.protein || 45) + 'g Protein</span>' +
            '    <span class="rcp-badge rcp-badge--time">⏱️ ' + (res.time || 15) + 'm</span>' +
            (res.calories ? '    <span class="rcp-badge rcp-badge--cal">' + res.calories + ' kcal</span>' : '') +
            '  </div>' +
            '  <div style="font-size:22px;font-weight:800">' + App.esc(res.title) + '</div>' +
            '  <div style="font-size:14px;color:var(--mute)">' + App.esc(res.description || '') + '</div>' +
            '  <div style="background:var(--paper-2);padding:12px;border-radius:10px;font-size:14px">' +
            '    <b>Zutaten:</b><br>' + (res.ingredients || []).map(function (i) { return '• ' + App.esc(i); }).join('<br>') +
            '    <br><br><b>Zubereitung:</b><br>' + (res.steps || []).map(function (s, idx) { return (idx + 1) + '. ' + App.esc(s); }).join('<br>') +
            '  </div>' +
            '  <div style="display:flex;gap:8px;margin-top:6px">' +
            '    <button class="rcp-act-btn rcp-act-btn--primary" id="aiApply">📅 Für ' + targetDayName + ' übernehmen</button>' +
            '    <button class="rcp-act-btn rcp-act-btn--cart" id="aiCart">' + App.icon('cart', 16) + ' Zutaten auf Liste</button>' +
            '  </div>' +
            '</div>';

          el.querySelector('#aiApply').onclick = function () { applyRecipeToDay(res); };
          el.querySelector('#aiCart').onclick = function () { addIngredientsToCart((res.ingredients || []).join(', ')); };
        }

        aiBtn.onclick = async function () {
          var promptVal = (aiInp.value || '').trim();
          var localKey = localStorage.getItem('gemini_api_key') || '';
          aiBtn.disabled = true;
          aiBtn.textContent = '✨ Gemini kreiert dein High-Protein-Rezept...';
          aiOut.innerHTML = '<div style="padding:20px;text-align:center;color:var(--mute)">Rezept wird berechnet...</div>';

          try {
            var resp = await fetch('/api/recipes/ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Gemini-Key': localKey },
              body: JSON.stringify({ prompt: promptVal, category: aiCategory, apiKey: localKey })
            });
            var data = await resp.json();
            if (data.ok && data.recipe) {
              renderAiCard(data.recipe);
            } else {
              aiOut.innerHTML = '<div style="color:var(--alert);padding:12px;background:rgba(229,38,30,0.1);border-radius:10px">' +
                App.esc(data.error || 'Fehler beim Generieren') + '<br><small>Tippe oben auf 🔑 API-Key, um deinen Google AI Studio Key zu hinterlegen.</small></div>';
            }
          } catch (err) {
            aiOut.innerHTML = '<div style="color:var(--alert);padding:12px;background:rgba(229,38,30,0.1);border-radius:10px">Verbindungsfehler: ' + App.esc(err.message) + '</div>';
          } finally {
            aiBtn.disabled = false;
            aiBtn.textContent = 'Rezept kreieren ✨';
          }
        };

        if (mode === 'dice' && aiResult) {
          renderAiCard(aiResult);
          setTab('ai');
        } else {
          setTab(currentTab);
          renderGrid();
        }
      }
    });
  }

  function addIngredientsToCart(ingString) {
    if (!ingString) return;
    var items = ingString.split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    items.forEach(function (name) { add(name); });
    App.toast(items.length + ' Zutaten zur Einkaufsliste hinzugefügt!', { icon: 'cart' });
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
      V.el.innerHTML = mealsViewHTML(false);
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
      if (t.dataset.subtab === 'meals') return App.go('meals');
      if (t.dataset.subtab === 'groceries') return App.go('shopping');
      V.subtab = t.dataset.subtab;
      return render();
    }
    if ((t = e.target.closest('[data-rcp-action]'))) {
      var act = t.dataset.rcpAction;
      var curD = (App.now().getDay() + 6) % 7;
      if (act === 'dice') openRecipeFinderSheet(curD, 'dice');
      else if (act === 'ai') openRecipeFinderSheet(curD, 'ai');
      else openRecipeFinderSheet(curD, 'catalog');
      return;
    }
    if ((t = e.target.closest('[data-pick-rcp]'))) {
      var pickDay = parseInt(t.dataset.pickRcp, 10);
      return openRecipeFinderSheet(pickDay, 'catalog');
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

  var M = { el: null };
  function renderMeals() {
    if (!M.el) return;
    M.el.innerHTML = mealsViewHTML(true);
  }

  App.on('lists', function (name) {
    if (Object.keys(V.pending).length) return;
    if (name === 'groceries' && V.el && App.current === 'shopping') { paintList(); paintSuggest(); }
    else if (name === 'meals') {
      if (M.el) renderMeals();
      if (V.el && V.subtab === 'meals') render();
    }
  });

  App.register('shopping', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    }
  });

  App.register('meals', {
    show: function (el) {
      if (!M.el) { M.el = el; el.addEventListener('click', onClick); }
      renderMeals();
    }
  });
})();

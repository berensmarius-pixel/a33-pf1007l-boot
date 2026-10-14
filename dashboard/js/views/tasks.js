import { DAY_ORDER, DAY_SHORT, isDue as isDueOn, dayLabel } from '../chore-days.js';
// Tasks / chores: one lane per person + "Anyone", scoped to the current time-of-day routine.
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, routine: null, pending: {}, showAll: false };

  var LANES = D.people.map(function (p) { return p.id; }).concat(['any']);

  function isDue(c) { return isDueOn(c, App.now()); }

  function routine() { return V.routine ? D.routines.filter(function (r) { return r.id === V.routine; })[0] : App.currentRoutine(); }
  function listFor(who, r) {
    return D.chores.filter(function (c) { return c.r === r.id && c.who === who && (V.showAll || isDue(c)); })
      .sort(function (a, b) { return (a.done - b.done) || ((b.overdue ? 1 : 0) - (a.overdue ? 1 : 0)); });
  }

  function row(c, p) {
    var pend = V.pending[c.id];
    var off = !isDue(c), tag = dayLabel(c);
    return '<button class="ch' + (c.done ? ' is-done' : '') + (pend ? ' is-checking' : '') + (off ? ' is-off' : '') + (c.overdue && !c.done ? ' is-overdue' : '') + '" data-ch="' + c.id + '">' +
      '<span class="ch-emoji">' + c.emoji + '<span class="ch-check"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></span>' +
      '<span class="ch-text"><b>' + App.esc(c.title) + '</b>' + (tag && (V.showAll || off) ? '<small class="ch-days-tag">' + tag + (off ? ' · nicht heute' : '') + '</small>' : '') +
      (c.overdue && !c.done ? '<small class="ch-late">Überfällig</small>' : c.stars ? '<small>' + App.icon('star', 14, 'i--fill') + c.stars + (c.doneBy ? ' · ' + App.person(c.doneBy).name : '') + '</small>' : (c.doneBy ? '<small>von ' + App.person(c.doneBy).name + '</small>' : '')) +
      '</span>' +
      '</button>';
  }

  function weekGrid(id) {
    var w = D.week[id];
    if (!w) return '';
    var today = (App.now().getDay() + 6) % 7;
    return '<div class="ch-week"><div class="label">Diese Woche</div><div class="ch-week-row">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(function (d, i) {
      var cls = i > today ? 'is-future' : i === today ? 'is-today' : (w[i] ? 'is-hit' : 'is-miss');
      return '<span class="' + cls + '"><i></i>' + d + '</span>';
    }).join('') + '</div></div>';
  }

  function lane(who, r) {
    var p = App.person(who), list = listFor(who, r);
    var done = list.filter(function (c) { return c.done; }).length;
    var all = list.length && done === list.length;
    var kid = D.stars[who] != null;
    return '<section class="ch-lane' + (all ? ' is-complete' : '') + '" data-lane="' + who + '" style="' + App.pstyle(p) + '">' +
      '<header class="ch-head">' + App.avatar(p, 42) +
      '<div><b>' + (who === 'any' ? 'Offen' : p.name) + '</b>' +
      (kid ? '<span class="ch-stars">' + App.icon('star', 18, 'i--fill') + '<span class="num">' + D.stars[who] + '</span></span>' : '<span class="ch-sub">' + (who === 'any' ? 'Frei wählbar' : (list.length ? done + ' von ' + list.length : 'Keine')) + '</span>') + '</div>' +
      '<div class="ch-ring">' + App.ring(done, list.length || 1, 46) + '<span class="num">' + (all ? '✓' : list.length ? done + '/' + list.length : '–') + '</span></div>' +
      '</header>' +
      '<div class="ch-list">' + (list.length ? list.map(function (c) { return row(c, p); }).join('') : '<div class="ch-none serif"><i>Keine Aufgaben heute ' + (r.id === 'evening' ? 'Abend' : r.id === 'morning' ? 'Morgen' : 'Nachmittag') + '</i></div>') +
      (all ? '<div class="ch-alldone serif">Alles erledigt<i>!</i></div>' : '') + '</div>' +
      weekGrid(who) +
      '</section>';
  }

  function render() {
    var r = routine(), auto = App.currentRoutine();
    var inR = D.chores.filter(function (c) { return c.r === r.id && isDue(c); });
    var done = inR.filter(function (c) { return c.done; }).length;
    V.el.innerHTML = '<div class="tasks">' +
      '<header class="t-head">' +
      '<div class="t-title"><div class="label">' + (r.id === auto.id ? 'Gerade aktiv · ' : '') + r.range + '</div><h1 class="serif">' + r.name + '</h1></div>' +
      '<div class="seg">' + D.routines.map(function (x) { return '<button class="' + (x.id === r.id ? 'is-on' : '') + '" data-r="' + x.id + '">' + x.name + '</button>'; }).join('') + '</div>' +
      '<div class="t-actions"><button class="btn btn--ghost t-all" data-toggle-all>' + (V.showAll ? 'Nur heute' : 'Alle Tage') + '</button>' +
      '<button class="btn btn--solid t-add" data-add-chore>' + App.icon('plus', 22) + ' Aufgabe</button></div>' +
      '<div class="t-progress"><span class="num">' + done + '<small>/' + inR.length + '</small></span><div class="t-bar"><i style="width:' + (inR.length ? done / inR.length * 100 : 0) + '%"></i></div><span class="label">erledigt</span></div>' +
      '</header>' +
      '<div class="ch-lanes">' + LANES.map(function (w) { return lane(w, r); }).join('') + '</div>' +
      '</div>';
  }

  function complete(c, btn, by) {
    var r = routine();
    V.pending[c.id] = true;
    btn.classList.add('is-checking');
    setTimeout(function () {
      delete V.pending[c.id];
      c.done = true;
      if (by) c.doneBy = by;
      App.Lists.upsert('chores', [c]);
      var earner = D.stars[c.who] != null ? c.who : (by && D.stars[by] != null ? by : null);
      if (earner && c.stars) D.stars[earner] += c.stars;
      render();
      App.emit('data');
      var laneList = listFor(c.who, r);
      var laneDone = laneList.every(function (x) { return x.done; });
      var allDone = D.chores.filter(function (x) { return x.r === r.id && isDue(x); }).every(function (x) { return x.done; });
      if (allDone) {
        App.toast('<b>Routine ' + r.name + ' abgeschlossen!</b> Alles geschafft.', { icon: 'star', ms: 5000 });
        return;
      }
      App.toast('<b>' + App.esc(c.title) + '</b> erledigt' + (earner && c.stars ? ' · +' + c.stars + '★ ' + App.person(earner).name : ''), {
        icon: 'check',
        undo: function () {
          c.done = false;
          delete c.doneBy;
          App.Lists.upsert('chores', [c]);
          if (earner && c.stars) D.stars[earner] -= c.stars;
          render();
          App.emit('data');
        }
      });
    }, 350);
  }

  // "Anyone" chores ask who did it, so stars go to the right kid
  function whoDidIt(c, btn) {
    App.sheet('<div class="sheet-pad"><div class="label">' + c.emoji + ' ' + App.esc(c.title) + '</div><h2 class="serif sheet-h">Wer hat’s erledigt?</h2>' +
      '<div class="add-who add-who--big">' + D.people.map(function (p) {
        return '<button class="who-btn" data-by="' + p.id + '" style="' + App.pstyle(p) + '">' + App.avatar(p, 88) + '<span>' + p.name + '</span></button>';
      }).join('') + '</div></div>', {
      onMount: function (s, close) {
        s.addEventListener('click', function (e) {
          var b = e.target.closest('[data-by]');
          if (!b) return;
          close();
          var fresh = V.el.querySelector('[data-ch="' + c.id + '"]');
          complete(c, fresh || btn, b.dataset.by);
        });
      }
    });
  }


  var EMOJIS = ['✅', '☕', '🍳', '🍽️', '🗑️', '🛏️', '👕', '🚿', '🐾', '🌱', '🔑', '🛠️'];
  function choreSheet(c) {
    var editing = !!c;
    var cur = c || { r: App.currentRoutine().id, who: 'marius', title: '', emoji: '✅' };
    var sel = { who: cur.who, r: cur.r, emoji: cur.emoji || '✅', days: (cur.days && cur.days.length && cur.days.length < 7) ? cur.days.slice() : DAY_ORDER.slice() };
    var whoBtns = D.people.map(function (p) { return { id: p.id, name: p.name }; }).concat([{ id: 'any', name: 'Offen' }]);
    App.sheet('<div class="sheet-pad ch-form"><div class="label">' + (editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe') + '</div>' +
      '<h2 class="serif sheet-h">' + (editing ? 'Bearbeiten' : 'Was ist zu tun?') + '</h2>' +
      '<input class="ch-title" maxlength="40" placeholder="z. B. Spülmaschine ausräumen" value="' + App.esc(cur.title) + '">' +
      '<div class="label">Wer?</div><div class="seg ch-who">' + whoBtns.map(function (w) {
        return '<button data-who="' + w.id + '" class="' + (w.id === sel.who ? 'is-on' : '') + '">' + w.name + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Wann?</div><div class="seg ch-when">' + D.routines.map(function (r) {
        return '<button data-when="' + r.id + '" class="' + (r.id === sel.r ? 'is-on' : '') + '">' + r.name + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Tage</div><div class="ch-days">' + DAY_ORDER.map(function (d) {
        return '<button data-day="' + d + '" class="' + (sel.days.indexOf(d) > -1 ? 'is-on' : '') + '">' + DAY_SHORT[d] + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Symbol</div><div class="ch-emojis">' + EMOJIS.map(function (e) {
        return '<button data-emoji="' + e + '" class="' + (e === sel.emoji ? 'is-on' : '') + '">' + e + '</button>';
      }).join('') + '</div>' +
      '<div class="ch-actions">' + (editing ? '<button class="btn btn--ghost" data-del>Löschen</button>' : '') +
      '<button class="btn btn--solid" data-save>Speichern</button></div></div>', {
      onMount: function (sh, close) {
        var input = sh.querySelector('.ch-title');
        function pick(attr, group, key) {
          group.addEventListener('click', function (e) {
            var b = e.target.closest('[' + attr + ']');
            if (!b) return;
            sel[key] = b.getAttribute(attr);
            [].forEach.call(group.querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === b); });
          });
        }
        pick('data-who', sh.querySelector('.ch-who'), 'who');
        pick('data-when', sh.querySelector('.ch-when'), 'r');
        sh.querySelector('.ch-days').addEventListener('click', function (e) {
          var b = e.target.closest('[data-day]');
          if (!b) return;
          var d = parseInt(b.getAttribute('data-day'), 10), i = sel.days.indexOf(d);
          if (i > -1) sel.days.splice(i, 1); else sel.days.push(d);
          b.classList.toggle('is-on', sel.days.indexOf(d) > -1);
        });
        function pickedDays() { return (!sel.days.length || sel.days.length >= 7) ? [] : DAY_ORDER.filter(function (d) { return sel.days.indexOf(d) > -1; }); }
        pick('data-emoji', sh.querySelector('.ch-emojis'), 'emoji');
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sh.querySelector('[data-save]').click(); });
        sh.querySelector('[data-save]').addEventListener('click', function () {
          var title = input.value.trim();
          if (!title) { input.focus(); return; }
          if (editing) {
            c.title = title; c.who = sel.who; c.r = sel.r; c.emoji = sel.emoji; c.days = pickedDays();
            App.Lists.upsert('chores', [c]);
          } else {
            var n = { id: App.Lists.uid('c'), r: sel.r, who: sel.who, title: title, emoji: sel.emoji, stars: 0, done: false, days: pickedDays() };
            D.chores.push(n);
            App.Lists.upsert('chores', [n]);
          }
          close();
          V.routine = sel.r === App.currentRoutine().id ? null : sel.r;
          render();
          App.emit('data');
        });
        var del = sh.querySelector('[data-del]');
        if (del) del.addEventListener('click', function () {
          D.chores = D.chores.filter(function (x) { return x !== c; });
          App.Lists.remove('chores', [c.id]);
          close();
          render();
          App.emit('data');
          App.toast('<b>' + App.esc(c.title) + '</b> gelöscht', { icon: 'check', undo: function () {
            D.chores.push(c);
            App.Lists.upsert('chores', [c]);
            render();
          } });
        });
        if (!editing) setTimeout(function () { input.focus(); }, 300);
      }
    });
  }

  var longPress = { timer: null, fired: false };
  function onDown(e) {
    var t = e.target.closest('[data-ch]');
    longPress.fired = false;
    clearTimeout(longPress.timer);
    if (!t) return;
    longPress.timer = setTimeout(function () {
      longPress.fired = true;
      var c = D.chores.filter(function (x) { return x.id === t.dataset.ch; })[0];
      if (c) choreSheet(c);
    }, 700);
  }
  function onUp() { clearTimeout(longPress.timer); }

  function onClick(e) {
    if (longPress.fired) { longPress.fired = false; return; }
    if (e.target.closest('[data-add-chore]')) return choreSheet();
    var t;
    if (e.target.closest('[data-toggle-all]')) { V.showAll = !V.showAll; return render(); }
    if ((t = e.target.closest('[data-r]'))) { V.routine = t.dataset.r === App.currentRoutine().id ? null : t.dataset.r; return render(); }
    if ((t = e.target.closest('[data-ch]'))) {
      var c = D.chores.filter(function (x) { return x.id === t.dataset.ch; })[0];
      if (!c || V.pending[c.id]) return;
      if (c.done) {
        c.done = false;
        var earner = D.stars[c.who] != null ? c.who : (c.doneBy && D.stars[c.doneBy] != null ? c.doneBy : null);
        if (earner && c.stars) D.stars[earner] -= c.stars;
        delete c.doneBy;
        App.Lists.upsert('chores', [c]);
        render();
        App.emit('data');
        return;
      }
      if (c.who === 'any') return whoDidIt(c, t);
      complete(c, t);
    }
  }

  App.register('tasks', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.addEventListener('click', onClick);
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        el.addEventListener('pointermove', onUp);
      }
      render();
    }
  });
  App.on('time', function () { V.routine = null; });
  App.on('lists', function (name) {
    if (name !== 'chores' || !V.el || !V.el.firstChild || App.current !== 'tasks') return;
    if (Object.keys(V.pending).length) return;
    render();
  });
})();

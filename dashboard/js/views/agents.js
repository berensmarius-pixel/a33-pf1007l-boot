// Agents: AI plan usage at a glance (inspired by CodexBar). Display only.
import { isDue } from '../chore-days.js';
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, loaded: Date.now() };

  function pstyle(a) { return '--c:' + a.color + ';--c-rgb:' + a.rgb; }
  function minsLeft(m) { return Math.max(0, m.left - (Date.now() - V.loaded) / 60000); }
  function fmtLeft(min) {
    min = Math.round(min);
    if (min < 60) return min + 'm';
    if (min < 1440) return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
    return Math.floor(min / 1440) + 'd ' + Math.floor((min % 1440) / 60) + 'h';
  }
  function fmtTokens(m) { return m >= 10 ? Math.round(m) + 'M' : m.toFixed(1) + 'M'; }

  function meter(m, ai, mi) {
    var left = minsLeft(m);
    var pace = Math.round((1 - left / m.win) * 100); // where even usage would be right now
    var diff = m.used - pace;
    var hot = m.used >= 85;
    if (m.noBar) {
      return '<div class="ag-meter"><div class="ag-meter-top"><span class="ag-label">' + m.label + '</span>' +
        '<span class="ag-pct num">' + m.detail.replace(/ Mio\. Tokens/, '') + '<small>M</small></span></div>' +
        '<div class="ag-meter-foot" data-meter="' + ai + ',' + mi + '"><span>Reset in <b data-reset>' + fmtLeft(left) + '</b></span></div></div>';
    }
    var paceText = Math.abs(diff) < 3 ? 'Im Plan' : diff > 0 ? diff + '% über Plan' : -diff + '% unter Plan';
    return '<div class="ag-meter' + (hot ? ' is-hot' : '') + '">' +
      '<div class="ag-meter-top"><span class="ag-label">' + m.label + '</span>' +
      '<span class="ag-pct num">' + m.used + '<small>%</small></span></div>' +
      '<div class="ag-bar"><i style="width:' + m.used + '%"></i><em data-pace-mark style="left:' + pace + '%" title="Gleichmäßiger Plan"></em></div>' +
      '<div class="ag-meter-foot" data-meter="' + ai + ',' + mi + '"><span>' + (m.detail ? m.detail + ' · ' : '') + 'Reset in <b data-reset>' + fmtLeft(left) + '</b></span>' +
      '<span class="ag-pace' + (diff >= 3 ? ' is-over' : '') + '" data-pace>' + paceText + '</span></div>' +
      '</div>';
  }

  function spark(vals) {
    var w = 112, h = 34, max = Math.max.apply(null, vals) || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 3 - v / max * (h - 6)).toFixed(1); });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="ag-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polyline points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5"/></svg>';
  }

  function card(a) {
    var hot = a.meters.some(function (m) { return m.used >= 85; });
    var status = a.status === 'ok'
      ? '<span class="ag-status"><i></i>Betriebsbereit</span>'
      : '<span class="ag-status is-warn"><i></i>Eingeschränkt</span>';
    return '<section class="ag-card" style="' + pstyle(a) + '">' +
      '<header class="ag-head"><div class="ag-id"><i class="ag-swatch"></i><b>' + a.name + '</b><span class="ag-plan">' + a.plan + '</span></div>' + status + '</header>' +
      (a.incident ? '<div class="ag-incident">' + App.icon('bolt', 16) + a.incident + '</div>' : hot ? '<div class="ag-incident ag-incident--hot">' + App.icon('clock', 16) + 'Nahe am Sitzungslimit</div>' : '') +
      a.meters.map(function (m, mi) { return meter(m, D.agents.indexOf(a), mi); }).join('') +
      '<footer class="ag-foot"><div><span class="num">' + fmtTokens(a.tokens) + '</span><small>Tokens heute</small></div>' +
      '<div><span class="num">' + (a.cost ? '$' + a.cost.toFixed(2) : 'Im Abo') + '</span><small>' + (a.cost ? 'API-Kosten' : 'im Plan') + '</small></div>' +
      spark(a.week) + '</footer>' +
      '</section>';
  }

  // ------------------------------------------------------------ Karten für den freien Platz
  function plainCard(title, sub, body) {
    return '<section class="ag-card ag-info"><header class="ag-head"><div class="ag-id"><b>' + title + '</b><span class="ag-plan">' + sub + '</span></div></header>' +
      '<div class="ag-info-body">' + body + '</div></section>';
  }
  function upcomingCard() {
    var now = App.now();
    var list = App.events().filter(function (e) { return e.end > now; }).sort(function (a, b) { return a.start - b.start; }).slice(0, 6);
    var rows = list.map(function (e) {
      var when = e.allDay ? 'ganztägig' : App.fmt.time(e.start);
      var days = Math.round((App.dayStart(e.start) - App.dayStart(now)) / 864e5);
      var label = days > 6 ? e.start.getDate() + '.' + (e.start.getMonth() + 1) + '.' : App.fmt.rel(e.start);
      return '<div class="ag-row"><span class="ag-row-day">' + label + '</span><span class="ag-row-main">' + App.esc(e.title) + '</span><span class="ag-row-time num">' + when + '</span></div>';
    }).join('');
    return plainCard('Nächste Termine', 'Kalender', rows || '<div class="ag-empty serif">Keine Termine in Sicht.</div>');
  }
  var MEAL_DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  function mealsCard() {
    var today = (App.now().getDay() + 6) % 7, byDay = {};
    (D.meals || []).forEach(function (m) { byDay[m.day] = m; });
    var rows = MEAL_DAYS.map(function (d, i) {
      var m = byDay[i];
      return '<div class="ag-row' + (i === today ? ' is-today' : '') + '"><span class="ag-row-day">' + d + '</span><span class="ag-row-main' + (m && m.title ? '' : ' is-none') + '">' + (m && m.title ? App.esc(m.title) : 'noch offen') + '</span></div>';
    }).join('');
    return plainCard('Wochenplan', 'Essen diese Woche', rows);
  }
  function fuelInfoCard() {
    var f = D.fuel;
    if (!f || !f.stations || !f.stations.length) return plainCard('Sprit', 'Super E5', '<div class="ag-empty serif">Noch keine Preise.</div>');
    var rows = f.stations.slice(0, 4).map(function (st, i) {
      return '<div class="ag-row' + (i === 0 ? ' is-best' : '') + '"><span class="ag-row-main">' + App.esc(st.name) + '</span><span class="ag-row-time num">' + st.price.toFixed(3).replace('.', ',') + ' €</span></div>';
    }).join('');
    var note = f.trendText ? '<div class="ag-note">' + App.esc(f.trendText) + '</div>' : '';
    return plainCard('Sprit', 'Super E5 · 5 km', rows + note);
  }

  function choresCard() {
    var now = App.now();
    var due = D.chores.filter(function (c) { return isDue(c, now); });
    var done = due.filter(function (c) { return c.done; }).length;
    var open = due.filter(function (c) { return !c.done; }).slice(0, 5);
    var body = '<div class="ag-sum-stats ag-chores-stat"><div><span class="num">' + done + '<small>/' + due.length + '</small></span><small>heute erledigt</small></div></div>' +
      (open.map(function (c) {
        var who = c.who === 'any' ? 'Offen' : App.person(c.who).name;
        return '<div class="ag-row"><span class="ag-row-day">' + who + '</span><span class="ag-row-main">' + App.esc(c.title) + '</span></div>';
      }).join('') || (due.length ? '<div class="ag-empty serif">Alles erledigt.</div>' : '<div class="ag-empty serif">Heute ist nichts fällig.</div>'));
    return plainCard('Aufgaben', 'Heute', body);
  }

  function summary() {
    var now = App.now();
    var totals = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      return D.agents.reduce(function (s, a) { return s + a.week[i]; }, 0);
    });
    var max = Math.max.apply(null, totals) || 1;
    var week = totals.reduce(function (s, v) { return s + v; }, 0);
    var bars = totals.map(function (t, i) {
      var d = App.addDays(now, i - 6);
      return '<div class="ag-col' + (i === 6 ? ' is-today' : '') + '"><div class="ag-stack" style="height:' + (t / max * 100) + '%">' +
        D.agents.map(function (a) { return '<i style="' + pstyle(a) + ';flex-grow:' + a.week[i] + '"></i>'; }).join('') +
        '</div><span>' + (i === 6 ? 'Heute' : App.fmt.dayShort(d)) + '</span></div>';
    }).join('');
    return '<section class="ag-card ag-sum">' +
      '<header class="ag-head"><div class="ag-id"><b>Alle Modelle</b><span class="ag-plan">Letzte 7 Tage</span></div></header>' +
      '<div class="ag-sum-stats"><div><span class="num">' + fmtTokens(week) + '</span><small>Tokens</small></div>' +
      '<div><span class="num">' + fmtTokens(totals[6]) + '</span><small>Heute</small></div></div>' +
      '<div class="ag-chart">' + bars + '</div>' +
      '<div class="ag-legend">' + D.agents.map(function (a) { return '<span style="' + pstyle(a) + '"><i></i>' + a.name + '</span>'; }).join('') + '</div>' +
      '</section>';
  }

  function paceOf(m) {
    var left = minsLeft(m), pace = Math.round((1 - left / m.win) * 100), diff = m.used - pace;
    return { left: left, pace: pace, diff: diff, text: Math.abs(diff) < 3 ? 'Im Plan' : diff > 0 ? diff + '% über Plan' : -diff + '% unter Plan' };
  }
  // Minute tick: update countdown + pace text in place (no rebuild, so switching here stays instant).
  function tick() {
    if (!V.el || !V.el.firstChild) return;
    App.$$('[data-meter]', V.el).forEach(function (foot) {
      var ix = foot.dataset.meter.split(','), m = D.agents[+ix[0]].meters[+ix[1]];
      if (!m) return;
      var p = paceOf(m);
      foot.querySelector('[data-reset]').textContent = fmtLeft(p.left);
      var pe = foot.querySelector('[data-pace]');
      if (!pe) return;
      pe.textContent = p.text;
      pe.classList.toggle('is-over', p.diff >= 3);
      var pm = foot.parentNode.querySelector('[data-pace-mark]');
      if (pm) pm.style.left = p.pace + '%';
    });
    var sync = V.el.querySelector('.ag-sync .label');
    if (sync) sync.textContent = synced();
  }

  function synced() {
    var a = D.agents[0];
    if (!a.live) return 'Noch keine Daten · scripts/push-usage.js ausführen';
    var m = Math.max(0, Math.round((Date.now() - Date.parse(a.updatedAt)) / 60000));
    return m < 1 ? 'Gerade aktualisiert' : m < 90 ? 'Vor ' + m + ' Min aktualisiert' : 'Vor ' + Math.round(m / 60) + ' Std aktualisiert';
  }

  function render() {
    V.el.innerHTML = '<div class="agents">' +
      '<header class="ag-top"><div><div class="label">KI-Pläne · Verbrauchslimits</div><h1 class="serif">System</h1></div>' +
      '<div class="ag-sync"><span class="label">' + synced() + '</span>' +
      '<button class="icon-btn" data-hard-reload aria-label="Dashboard neu laden" title="Dashboard neu laden" style="margin-right:6px">🔄</button>' +
      '<button class="icon-btn" data-refresh aria-label="Aktualisieren">' + App.icon('undo', 26) + '</button></div></header>' +
      '<div class="ag-grid">' + D.agents.map(card).join('') + summary() + upcomingCard() + mealsCard() + choresCard() + fuelInfoCard() + '</div>' +
      '</div>';
  }

  App.register('agents', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.addEventListener('click', function (e) {
          if (e.target.closest('[data-hard-reload]')) {
            location.reload(true);
            return;
          }
          var b = e.target.closest('[data-refresh]');
          if (!b) return;
          if (window.LiveSync) window.LiveSync.updateUsage();
        });
      }
      render();
    }
  });
  App.on('minute', tick);
  // Termine, Wochenplan und Aufgaben ändern sich im Hintergrund (Abgleich, Mitternacht)
  App.on('lists', function () { if (App.current === 'agents' && V.el && V.el.firstChild) render(); });
  App.on('data', function () { if (App.current === 'agents' && V.el && V.el.firstChild) render(); });
})();

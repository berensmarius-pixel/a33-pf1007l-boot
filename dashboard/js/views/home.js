// Home / Today: the glanceable overview. Never scrolls.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b>, ' + n.getDate() + '. ' + App.fmt.month(n) + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    var hours = App.hourly(7);
    var tmin = Math.min.apply(null, hours.map(function (h) { return h.t; }));
    var tmax = Math.max.apply(null, hours.map(function (h) { return h.t; }));
    var r15 = D.weather && D.weather.rain15;
    var rainPill = '';
    if (r15) {
      rainPill = '<button class="h-wx-rain-pill' + (r15.hasRain ? ' is-rain' : '') + '" data-action="radar">' +
        (r15.hasRain ? '🌧️ ' : '☂️ ') + App.esc(r15.summary) + ' · <u>Radar</u></button>';
    }
    return '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>Kaiserslautern</b><span>H ' + w.hi + '°  T ' + w.lo + '°</span></span>' +
      rainPill +
      '</div>' +
      '<div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 8);
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b></div>';
      }).join('') + '</div>';
  }

  // Termin, der gerade läuft (z. B. ein ganztägiger Arbeitstermin)
  function ongoingEvent() {
    var now = App.now();
    return App.timedOn(now).filter(function (e) { return e.start <= now && e.end > now; })
      .sort(function (a, b) { return a.end - b.end; })[0] || null;
  }

  function heroOngoing(e) {
    var p = App.evColor(e);
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Alle' : who.join(' + ');
    return '<button class="h-hero" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' +
      '<div class="h-hero-main">' +
      '  <div class="label label--on">Läuft gerade · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + App.fmt.range(e.start, e.end) + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</div>' +
      '  <div class="h-hero-foot">' + (e.people.length > 1 ? App.dots(e.people, 22) : '') + '</div>' +
      '</div><div class="h-hero-count num">' + App.fmt.time(e.end, false) + '<small>Bis</small></div></button>';
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
    if (!e && ongoingEvent()) return heroOngoing(ongoingEvent());
    if (!e) {
      var tomorrow = App.timedOn(App.addDays(now, 1))[0];
      return '<div class="h-hero h-hero--empty" data-go="calendar">' +
        '<div class="label label--light">Heute</div>' +
        '<div class="h-hero-title serif">Keine weiteren Termine heute.<br><i>Schönen Feierabend!</i></div>' +
        (tomorrow ? '<div class="h-hero-meta">Morgen startet mit <b>' + App.esc(tomorrow.title) + '</b> um ' + App.fmt.time(tomorrow.start) + '</div>' : '') +
        '</div>';
    }
    var p = App.evColor(e);
    var mins = (e.start - now) / 60000;
    var leave = (App.leaveBy(e) - now) / 60000;
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Alle' : who.join(' + ');
    var big = mins < 100
      ? '<div class="h-hero-count num">' + Math.round(mins) + '<small>Min</small></div>'
      : '<div class="h-hero-count num">' + App.fmt.time(e.start, false) + '<small>' + App.fmt.ampm(e.start) + '</small></div>';
    var leavePill = '';
    if (e.travel) {
      leavePill = leave <= 0
        ? '<span class="pill pill--alert"><i class="pulse"></i>Jetzt losgehen</span>'
        : '<span class="pill' + (leave <= 15 ? ' pill--soon' : '') + '">' + App.icon('car', 20) + 'In ' + App.fmt.mins(leave) + ' los</span>';
    }
    return '<button class="h-hero" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' +
      '<div class="h-hero-main">' +
      '  <div class="label label--on">Als nächstes · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + App.fmt.range(e.start, e.end) + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</div>' +
      '  <div class="h-hero-foot">' + (e.people.length > 1 ? App.dots(e.people, 22) : '') + leavePill + '</div>' +
      '</div>' + big + '</button>';
  }

  function ring(done, total, size) {
    var r = size / 2 - 5, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  App.ring = ring;

  function fuelCard() {
    var f = D.fuel || {};
    var c = f.cheapest;
    if (!c) {
      return '<div class="label">Super E5 · Kaiserslautern</div>' +
        '<div class="h-fuel-row"><div class="h-fuel-main"><div class="h-fuel-stat"><b>Keine Preise</b><span>Wird geladen …</span></div></div></div>';
    }
    var isCheap = f.trend === 'cheap';
    var isHigh = f.trend === 'high';
    var badgeClass = isCheap ? 'badge-cheap' : (isHigh ? 'badge-high' : 'badge-norm');
    var badgeText = isCheap ? 'Günstig' : (isHigh ? 'Teuer' : 'Normal');

    return '<div class="label">Super E5 · Kaiserslautern</div>' +
      '<div class="h-fuel-row">' +
      '  <div class="h-fuel-price num">' + c.price.toFixed(3).replace('.', ',') + '<small>€</small></div>' +
      '  <div class="h-fuel-badge ' + badgeClass + '">' + badgeText + '</div>' +
      '</div>' +
      '<div class="h-fuel-line"><b>' + App.esc(c.name) + '</b> · ' + App.esc(c.street) + ' · ' + c.dist + ' km</div>';
  }

  function timerCard() {
    if (window.App && window.App.Pomodoro && window.App.Pomodoro.isActive()) {
      var p = window.App.Pomodoro.state();
      var isWork = p.phase === 'work';
      var icon = isWork ? '🍅' : '☕';
      var title = isWork ? ('Fokus: ' + (p.topic || 'Lernen')) : (p.phase === 'longBreak' ? 'Lange Pause' : 'Kurze Pause');
      var sub = 'Runde ' + p.round + '/' + p.totalRounds + (p.isPaused ? ' · Pausiert' : ' · Läuft');
      var pct = p.totalSec > 0 ? Math.max(0, Math.min(100, Math.round((p.remSec / p.totalSec) * 100))) : 0;
      return '<div class="label"><i class="pulse" style="background:' + (isWork ? 'var(--alert)' : 'var(--ok)') + ';"></i> Pomodoro · ' + (isWork ? 'Fokus' : 'Pause') + '</div>' +
        '<div class="h-timer-row">' +
        '  <div class="h-timer-time num">' + App.Timer.fmt(p.remSec) + '</div>' +
        '  <div class="h-timer-badge ' + (isWork ? 'badge--work' : 'badge--break') + '">' + icon + ' ' + App.esc(title) + '</div>' +
        '</div>' +
        '<div class="h-timer-bar"><div class="h-timer-bar-fill ' + (isWork ? 'fill--pomo-work' : 'fill--pomo-break') + '" style="width:' + pct + '%;"></div></div>' +
        '<div class="h-timer-foot">' +
        '  <span><b>' + sub + '</b></span>' +
        '  <span class="h-timer-more">Öffnen →</span>' +
        '</div>';
    }
    var active = App.Timer ? App.Timer.list() : [];
    if (active.length) {
      var t = active[0];
      var pct = t.totalSec ? Math.max(0, Math.min(100, Math.round((t.remSec / t.totalSec) * 100))) : 0;
      var moreText = active.length > 1 ? '+' + (active.length - 1) + ' weiterer' : 'von ' + App.Timer.fmt(t.totalSec);
      return '<div class="label"><i class="pulse" style="background:var(--amber);"></i> Küchen-Timer · Läuft</div>' +
        '<div class="h-timer-row">' +
        '  <div class="h-timer-time num">' + App.Timer.fmt(t.remSec) + '</div>' +
        '  <div class="h-timer-badge">' + t.emoji + ' ' + App.esc(t.label) + '</div>' +
        '</div>' +
        '<div class="h-timer-bar"><div class="h-timer-bar-fill" style="width:' + pct + '%;"></div></div>' +
        '<div class="h-timer-foot">' +
        '  <span><b>' + App.esc(t.label) + '</b> · ' + moreText + '</span>' +
        '  <span class="h-timer-more">Öffnen →</span>' +
        '</div>';
    }
    return '<div class="label">Küchen-Timer &amp; Fokus</div>' +
      '<div class="h-timer-presets">' +
      '  <button class="h-t-chip" data-timer-pre="0"><span class="h-t-emoji">☕</span> <b>4m</b></button>' +
      '  <button class="h-t-chip" data-timer-pre="1"><span class="h-t-emoji">🐣</span> <b>6m</b></button>' +
      '  <button class="h-t-chip" data-timer-pre="3"><span class="h-t-emoji">🍝</span> <b>9m</b></button>' +
      '  <button class="h-t-chip" data-timer-pre="4"><span class="h-t-emoji">🍕</span> <b>13m</b></button>' +
      '  <button class="h-t-chip h-t-chip--pomo" data-action="pomo-quick"><span class="h-t-emoji">🍅</span> <b>25m</b></button>' +
      '</div>' +
      '<div class="h-timer-foot">' +
      '  <span>Schnellstart · Tippen zum Starten</span>' +
      '  <span class="h-timer-more">Eigene Zeit →</span>' +
      '</div>';
  }

  function openFuelSheet() {
    var f = D.fuel || {};
    var stations = f.stations || [];
    var sheet = App.sheet(
      '<div class="fuel-sheet">' +
      '<div class="t-sheet-head">' +
      '  <div><b>Spritpreise Kaiserslautern</b><small>Super E5 (Super 95) · Günstigste Tankstellen</small></div>' +
      '</div>' +
      '<div class="f-list">' + stations.map(function (s, idx) {
        return '<div class="f-item' + (idx === 0 ? ' is-best' : '') + '">' +
          '<div class="f-pos">' + (idx + 1) + '</div>' +
          '<div class="f-name"><b>' + App.esc(s.name) + '</b><span>' + App.esc(s.street) + ' (' + s.dist + ' km)</span></div>' +
          '<div class="f-price num">' + s.price.toFixed(3).replace('.', ',') + ' €</div>' +
          '</div>';
      }).join('') + '</div>' +
      (stations.length ? '' : '<div class="f-hint">Noch keine Preise geladen.</div>') +
      '<div class="f-hint">' + (f.trendText ? App.esc(f.trendText) + (f.avg ? ' · Schnitt ' + f.avg.toFixed(3).replace('.', ',') + ' €' : '') + '<br>' : '') + 'Live-Preise der Markttransparenzstelle für Kraftstoffe (MTS-K)</div>' +
      '</div>'
    );
  }

  function openLiveTrackSheet() {
    var tr = D.livetrack || {};
    App.sheet(
      '<div class="livetrack-sheet">' +
      '<div class="t-sheet-head">' +
      '  <div><b>🚴 Live-Tracking · Marius</b><small>Garmin LiveTrack · Echtzeit-Standort &amp; Strecke</small></div>' +
      '</div>' +
      '<div class="livetrack-frame-box">' +
      '  <iframe class="livetrack-iframe" id="livetrackIframe" src="' + (tr.url || '/api/livetrack/view') + '" allow="geolocation"></iframe>' +
      '</div>' +
      '<div class="livetrack-actions">' +
      '  <a href="' + (tr.url || '#') + '" target="_blank" rel="noopener noreferrer" class="btn btn--ghost" style="padding:10px 16px;text-decoration:none;">↗️ Im Browser öffnen</a>' +
      '  <button class="btn btn--ghost" id="btnStopTrack" style="color:var(--alert);padding:10px 16px;">Tracking beenden</button>' +
      '  <button class="btn btn--solid" data-close style="margin-left:auto;padding:10px 24px;">Schließen</button>' +
      '</div>' +
      '</div>',
      {
        cls: 'sheet--wide',
        onMount: function (el, close) {
          var stopBtn = el.querySelector('#btnStopTrack');
          if (stopBtn) {
            stopBtn.onclick = async function () {
              if (confirm('Live-Tracking auf dem Tablet beenden?')) {
                await fetch('/api/livetrack?action=stop', { method: 'POST' }).catch(function () {});
                D.livetrack = null;
                close();
                App.emit('data');
                App.toast('Live-Tracking beendet', { icon: 'check' });
              }
            };
          }
        },
        onClose: function () {
          var ifr = document.getElementById('livetrackIframe');
          if (ifr) {
            ifr.src = 'about:blank';
            ifr.remove();
          }
        }
      }
    );
  }

  // Banner: Geburtstage/Jahrestage (ganztägige Termine, nächste 14 Tage) und Wetterwarnungen
  var BDAY_RE = /geburtstag|\bgebi\b|birthday|bday|🎂|🎈/i, ANNIV_RE = /jahrestag|hochzeit|anniversary|💍|❤/i;
  function occasions() {
    var now = App.now(), today = App.dayStart(now), out = [];
    App.events().forEach(function (e) {
      if (!e.allDay) return;
      var isB = BDAY_RE.test(e.title), isA = ANNIV_RE.test(e.title);
      if (!isB && !isA && !e.yearly) return;
      var days = Math.round((App.dayStart(e.start) - today) / 86400000);
      if (days < 0 || days > 14) return;
      var years = e.origYear ? e.start.getFullYear() - e.origYear : 0;
      out.push({ e: e, days: days, kind: isA ? 'anniv' : 'bday', years: years >= 1 && e.origYear >= 1900 ? years : 0 });
    });
    out.sort(function (a, b) { return a.days - b.days; });
    return out.slice(0, 2);
  }
  // Hinweis, wenn der Kalender nicht mehr aktuell ist (WLAN weg, Server nicht erreichbar, ...)
  function ago(min) {
    return min < 60 ? Math.round(min) + ' Min' : min < 1440 ? Math.round(min / 60) + ' Std' : Math.round(min / 1440) + ' Tagen';
  }
  function staleCalendar() {
    var S = D.sync || {}, now = Date.now();
    if (!S.calendar) {
      return (now - (S.start || now)) > 3 * 60000 ? { title: 'Kalender nicht geladen', text: 'Keine Verbindung zum Server?' } : null;
    }
    var min = (now - S.calendar) / 60000;
    return min > 20 ? { title: 'Kalender nicht aktuell', text: 'Stand vor ' + ago(min) + ' · ' + App.fmt.time(new Date(S.calendar)) } : null;
  }

  // Höchstens zwei Banner, sortiert nach Wichtigkeit (Unwetter, Geburtstag heute, Warnung, Geburtstag bald)
  function notices() {
    var items = [];
    if (D.livetrack && D.livetrack.active) {
      var diffMin = Math.max(0, Math.round((Date.now() - (D.livetrack.startedAt || Date.now())) / 60000));
      var timeStr = diffMin < 60 ? (diffMin + 'm') : (Math.floor(diffMin / 60) + 'h ' + (diffMin % 60) + 'm');
      items.push({
        prio: -1,
        html: '<div class="h-note h-note--track" data-action="livetrack" style="cursor:pointer">' +
          '<span class="h-note-emoji">🚴</span>' +
          '<div class="h-note-txt"><b>Marius auf dem Rad · LiveTrack</b><span>Tippen für Live-Karte &amp; Route</span></div>' +
          '<div class="h-note-when num">' + timeStr + '</div></div>'
      });
    }
    (D.weather && D.weather.alerts || []).forEach(function (a) {
      items.push({ prio: a.level === 'alert' ? 0 : 2, html: '<div class="h-note h-note--' + a.level + '">' + App.icon(a.icon, 24) +
        '<div class="h-note-txt"><b>' + App.esc(a.title) + '</b><span>' + App.esc(a.text) + '</span></div></div>' });
    });
    var stale = staleCalendar();
    if (stale) {
      items.push({ prio: 2, html: '<div class="h-note h-note--warn">' + App.icon('clock', 24) +
        '<div class="h-note-txt"><b>' + stale.title + '</b><span>' + stale.text + '</span></div></div>' });
    }
    occasions().forEach(function (o) {
      var when = o.days === 0 ? 'Heute!' : o.days === 1 ? 'Morgen' : 'in ' + o.days + ' Tagen';
      var detail = o.years ? (o.kind === 'anniv' ? o.years + '. Jahrestag' : 'wird ' + o.years) : (o.kind === 'anniv' ? 'Jahrestag' : 'Geburtstag');
      items.push({ prio: o.days === 0 ? 1 : 3, html: '<div class="h-note h-note--party' + (o.days === 0 ? ' is-today' : '') + '">' +
        '<span class="h-note-emoji">' + (o.kind === 'anniv' ? '💍' : '🎂') + '</span>' +
        '<div class="h-note-txt"><b>' + App.esc(o.e.title) + '</b><span>' + detail + '</span></div>' +
        '<div class="h-note-when num">' + when + '</div></div>' });
    });
    var curDay = (App.now().getDay() + 6) % 7;
    var todayMeal = (D.meals || []).filter(function (m) { return m.day === curDay && m.title; })[0];
    if (todayMeal) {
      items.push({ prio: 3, html: '<div class="h-note h-note--meal" style="cursor:pointer" data-go="meals">' +
        '<span class="h-note-emoji">🍳</span>' +
        '<div class="h-note-txt"><b>Heute: ' + App.esc(todayMeal.title) + '</b><span>' + (todayMeal.ingredients ? 'Zutaten: ' + App.esc(todayMeal.ingredients) : 'Im Wochenplan') + '</span></div></div>' });
    } else {
      items.push({ prio: 4, html: '<div class="h-note h-note--meal" style="cursor:pointer" data-go="meals">' +
        '<span class="h-note-emoji">🍳</span>' +
        '<div class="h-note-txt"><b>Wochenplan: Heute noch nichts geplant</b><span>Tippen für Rezepte &amp; Planen</span></div></div>' });
    }
    items.sort(function (x, y) { return x.prio - y.prio; });
    return items.slice(0, 2).map(function (i) { return i.html; }).join('');
  }

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-notices').innerHTML = notices();
    if (el.querySelector('.h-fuel')) el.querySelector('.h-fuel').innerHTML = fuelCard();
    if (el.querySelector('.h-timer')) el.querySelector('.h-timer').innerHTML = timerCard();
  }

  function photoCaption(s) {
    var m = App.photoMeta(s.photos[0]);
    V.el.querySelector('.h-photo-cap').innerHTML = '<b>' + (m.onThisDay ? 'An diesem Tag · ' : '') + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock" data-go="calendar"></div>' +
          '<div class="h-weather"></div>' +
          '<div class="h-main">' +
          '  <div class="h-hero-slot"></div>' +
          '  <div class="h-notices"></div>' +
          '  <div class="h-extra-row"><button class="h-fuel card"></button><div class="h-timer card" data-action="timer"></div></div>' +
          '</div>' +
          '<div class="h-side">' +
          '  <button class="h-photo" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '</div></div>';
        el.addEventListener('click', function (e) {
          var trk = e.target.closest('[data-action="livetrack"]');
          if (trk) {
            if (window.App && window.App.LiveTrack) {
              window.App.LiveTrack.openFull(true);
            } else {
              openLiveTrackSheet();
            }
            return;
          }
          var rad = e.target.closest('[data-action="radar"]');
          if (rad) { App.openWeather('radar'); return; }
          if (e.target.closest('.h-weather')) { App.openWeather('now'); return; }
          var fc = e.target.closest('.h-fuel');
          if (fc) { openFuelSheet(); return; }
          var tc = e.target.closest('[data-timer-pre]');
          if (tc && App.Timer) {
            var p = App.Timer.presets[parseInt(tc.dataset.timerPre, 10)];
            App.Timer.start(p.label, p.emoji, p.sec);
            return;
          }
          var pq = e.target.closest('[data-action="pomo-quick"]');
          if (pq && window.App && window.App.Pomodoro) {
            window.App.Pomodoro.startWork(25, 'Lernen');
            window.App.toast('🍅 25 Min Lerneinheit gestartet: «Lernen»');
            return;
          }
          var pBtn = e.target.closest('[data-action="pomodoro"]');
          if (pBtn && window.App && window.App.Pomodoro) {
            window.App.Pomodoro.openSheet();
            return;
          }
          var tm = e.target.closest('[data-action="timer"], .h-timer');
          if (tm && App.Timer) { App.Timer.open(); return; }
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        var pInt = App.photoInterval ? App.photoInterval() : 60000;
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { layout: 'cover', captions: false, interval: pInt, onChange: photoCaption });
      }
      paint();
      V.slides.start();
    },
    resume: function () { V.slides.start(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
  // Every minute: just the clock and next-up countdown (cheap, even while hidden). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-hero-slot').innerHTML = hero();
    V.el.querySelector('.h-notices').innerHTML = notices();
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); }
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
  App.on('lists', function () { if (App.current === 'home') paint(); });
  App.on('livetrack-update', function () { if (App.current === 'home') paint(); });
  App.on('timer-update', function () {
    if (App.current === 'home' && V.el && V.el.querySelector('.h-timer')) {
      V.el.querySelector('.h-timer').innerHTML = timerCard();
    }
  });
  App.on('fuel-update', function () {
    if (App.current === 'home' && V.el && V.el.querySelector('.h-fuel')) {
      V.el.querySelector('.h-fuel').innerHTML = fuelCard();
    }
  });
})();

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
    return '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>Kaiserslautern</b><span>H ' + w.hi + '°  T ' + w.lo + '°</span></span>' +
      '</div>' +
      '<div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 8);
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b></div>';
      }).join('') + '</div>';
  }

  function presence() {
    return D.people.map(function (p) {
      var sub = p.home ? 'Zuhause' : (p.eta ? '<b>Ankunft ' + p.eta + ' Min</b>' : p.status);
      return '<div class="h-who' + (p.home ? ' is-home' : '') + '" style="' + App.pstyle(p) + '">' +
        App.avatar(p, 36, p.home ? '' : 'avatar--away') +
        '<span><b>' + p.name + '</b><small>' + sub + '</small></span></div>';
    }).join('');
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
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

  function lanes() {
    var now = App.now();
    return D.people.map(function (p) {
      var list = App.timedOn(now, p.id).filter(function (e) { return e.end > now; });
      var shown = list.slice(0, 3), more = list.length - shown.length;
      return '<div class="h-lane" style="' + App.pstyle(p) + '">' +
        '<div class="h-lane-head">' + App.avatar(p, 30) + '<b>' + p.name + '</b></div>' +
        (list.length ? shown.map(function (e) {
          var cur = e.start <= now;
          return '<button class="h-ev' + (cur ? ' is-now' : '') + '" data-ev="' + e.id + '">' +
            '<span class="h-ev-t">' + (cur ? 'Jetzt' : App.fmt.time(e.start, false)) + '</span>' +
            '<span class="h-ev-n">' + App.esc(e.title) + '</span></button>';
        }).join('') : '<div class="h-free serif"><i>Frei</i> für heute</div>') +
        (more > 0 ? '<button class="h-more" data-go="calendar">+' + more + ' weitere</button>' : '') +
        '</div>';
    }).join('');
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
    var c = f.cheapest || { name: 'JET', street: 'Pariser Str. 123', dist: 1.4, price: 1.719 };
    var isCheap = f.trend === 'cheap';
    var isHigh = f.trend === 'high';
    var badgeClass = isCheap ? 'badge-cheap' : (isHigh ? 'badge-high' : 'badge-norm');
    var badgeText = isCheap ? 'Günstig' : (isHigh ? 'Teuer' : 'Normal');

    return '<div class="label">Super E5 · Kaiserslautern</div>' +
      '<div class="h-fuel-row">' +
      '  <div class="h-fuel-main">' +
      '    <div class="h-fuel-price num">' + c.price.toFixed(3).replace('.', ',') + '<small>€</small></div>' +
      '    <div class="h-fuel-stat"><b>' + App.esc(c.name) + '</b><span>' + App.esc(c.street) + ' · ' + c.dist + ' km</span></div>' +
      '  </div>' +
      '  <div class="h-fuel-badge ' + badgeClass + '">' + badgeText + '</div>' +
      '</div>';
  }

  function timerCard() {
    var active = App.Timer ? App.Timer.list() : [];
    if (active.length) {
      var t = active[0];
      return '<div class="label">Küchen-Timer · Läuft</div>' +
        '<div class="h-timer-active">' +
        '  <span class="h-timer-emoji">' + t.emoji + '</span>' +
        '  <div class="h-timer-info"><b>' + App.esc(t.label) + '</b><small>' + App.Timer.fmt(t.remSec) + ' übrig</small></div>' +
        '  <button class="h-timer-btn" data-action="timer">Öffnen</button>' +
        '</div>';
    }
    return '<div class="label">Küchen-Timer · Schnellstart</div>' +
      '<div class="h-timer-presets">' +
      '  <button class="h-t-chip" data-timer-pre="0">☕ 4m</button>' +
      '  <button class="h-t-chip" data-timer-pre="1">🥚 6m</button>' +
      '  <button class="h-t-chip" data-timer-pre="3">🍝 9m</button>' +
      '  <button class="h-t-chip" data-timer-pre="4">🍕 13m</button>' +
      '</div>';
  }

  function openFuelSheet() {
    var f = D.fuel || {};
    var stations = f.stations || [
      { name: 'JET', street: 'Pariser Str. 123', dist: 1.4, price: 1.719 },
      { name: 'ED', street: 'Mainzer Str. 104', dist: 2.1, price: 1.739 },
      { name: 'TotalEnergies', street: 'Donnersberger Str. 1', dist: 2.5, price: 1.759 },
      { name: 'Aral', street: 'Ludwigshafener Str. 8', dist: 3.2, price: 1.789 }
    ];
    var sheet = App.sheet(
      '<div class="fuel-sheet">' +
      '<div class="t-sheet-head">' +
      '  <div><b>Spritpreise Kaiserslautern</b><small>Super E5 (Super 95) · Günstigste Tankstellen</small></div>' +
      '  <button class="btn-close" id="fClose">✕</button>' +
      '</div>' +
      '<div class="f-list">' + stations.map(function (s, idx) {
        return '<div class="f-item' + (idx === 0 ? ' is-best' : '') + '">' +
          '<div class="f-pos">' + (idx + 1) + '</div>' +
          '<div class="f-name"><b>' + App.esc(s.name) + '</b><span>' + App.esc(s.street) + ' (' + s.dist + ' km)</span></div>' +
          '<div class="f-price num">' + s.price.toFixed(3).replace('.', ',') + ' €</div>' +
          '</div>';
      }).join('') + '</div>' +
      (f.demo ? '<div class="f-hint">💡 Für minutengenaue Live-Preise: Kostenlosen API-Key auf <u>creativecommons.tankerkoenig.de</u> anfordern.</div>' : '<div class="f-hint">✅ Live-Preise der Markttransparenzstelle für Kraftstoffe (MTS-K)</div>') +
      '</div>'
    );
    var closeBtn = sheet.el.querySelector('#fClose');
    if (closeBtn) closeBtn.onclick = function () { sheet.close(); };
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
  // Höchstens zwei Banner, sortiert nach Wichtigkeit (Unwetter, Geburtstag heute, Warnung, Geburtstag bald)
  function notices() {
    var items = [];
    (D.weather && D.weather.alerts || []).forEach(function (a) {
      items.push({ prio: a.level === 'alert' ? 0 : 2, html: '<div class="h-note h-note--' + a.level + '">' + App.icon(a.icon, 24) +
        '<div class="h-note-txt"><b>' + App.esc(a.title) + '</b><span>' + App.esc(a.text) + '</span></div></div>' });
    });
    occasions().forEach(function (o) {
      var when = o.days === 0 ? 'Heute!' : o.days === 1 ? 'Morgen' : 'in ' + o.days + ' Tagen';
      var detail = o.years ? (o.kind === 'anniv' ? o.years + '. Jahrestag' : 'wird ' + o.years) : (o.kind === 'anniv' ? 'Jahrestag' : 'Geburtstag');
      items.push({ prio: o.days === 0 ? 1 : 3, html: '<div class="h-note h-note--party' + (o.days === 0 ? ' is-today' : '') + '">' +
        '<span class="h-note-emoji">' + (o.kind === 'anniv' ? '💍' : '🎂') + '</span>' +
        '<div class="h-note-txt"><b>' + App.esc(o.e.title) + '</b><span>' + detail + '</span></div>' +
        '<div class="h-note-when num">' + when + '</div></div>' });
    });
    items.sort(function (x, y) { return x.prio - y.prio; });
    return items.slice(0, 2).map(function (i) { return i.html; }).join('');
  }

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-presence').innerHTML = presence();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-lanes').innerHTML = lanes();
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
          '<div class="h-presence"></div>' +
          '<div class="h-main">' +
          '  <div class="h-hero-slot"></div>' +
          '  <div class="h-lanes"></div>' +
          '  <div class="h-notices"></div>' +
          '  <div class="h-extra-row"><button class="h-fuel card"></button><button class="h-timer card"></button></div>' +
          '</div>' +
          '<div class="h-side">' +
          '  <button class="h-photo" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '</div></div>';
        el.addEventListener('click', function (e) {
          var fc = e.target.closest('.h-fuel');
          if (fc) { openFuelSheet(); return; }
          var tc = e.target.closest('[data-timer-pre]');
          if (tc && App.Timer) {
            var p = App.Timer.presets[parseInt(tc.dataset.timerPre, 10)];
            App.Timer.start(p.label, p.emoji, p.sec);
            return;
          }
          var tm = e.target.closest('[data-action="timer"], .h-timer');
          if (tm && App.Timer) { App.Timer.open(); return; }
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { layout: 'cover', captions: false, interval: 12000, onChange: photoCaption });
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
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.el.querySelector('.h-lanes').innerHTML = lanes(); }
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
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

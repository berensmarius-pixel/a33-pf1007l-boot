// Ambient (idle photo frame) and Night (dim red clock) overlays.
(function () {
  'use strict';
  var D = window.DATA, $ = App.$;
  var amb = { show: null }, shiftTimer = null;
  var page = 0, swapSec = 0;                // 0 = jetzt, 1 = morgen (wechselt alle ~14 s)
  var SWAP_AFTER = 14;
  var WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  // Morgen (vor 6 Uhr: der heutige Tag) mit Wetter und erstem Termin
  function tomorrow() {
    var n = App.now(), early = n.getHours() < 6, day = App.addDays(n, early ? 0 : 1);
    var det = D.weather && D.weather.detail, w = det && det.days && det.days[early ? 0 : 1];
    var evs = App.timedOn(day).filter(function (e) { return e.end > n; });
    var ad = App.allDayOn(day);
    return {
      label: (early ? 'Heute' : 'Morgen') + ' · ' + WD[day.getDay()] + ', ' + day.getDate() + '. ' + App.fmt.month(day),
      wx: w || null, first: evs[0] || null, count: evs.length, allDay: ad[0] || null
    };
  }
  function tomorrowWx(t, size) {
    if (!t.wx) return '';
    var rain = t.wx.p >= 40 ? 'Regen ' + t.wx.p + ' %' : 'trocken';
    return App.icon(t.wx.c, size) + '<b class="num">' + t.wx.hi + '°</b><span>' + t.wx.lo + '°</span><small>' + rain + '</small>';
  }
  function tomorrowEv(t) {
    if (t.first) return 'Erster Termin <b>' + App.fmt.time(t.first.start) + '</b> · ' + App.esc(t.first.title) + (t.count > 1 ? ' <i>(+' + (t.count - 1) + ')</i>' : '');
    if (t.allDay) return 'Ganztägig: <b>' + App.esc(t.allDay.title) + '</b>';
    return 'Keine Termine';
  }

  function ambientInfo(fade) {
    var n = App.now(), w = App.weatherNow(), next = App.nextEvent(), t = tomorrow();
    var right = page === 0
      ? '<div class="amb-wx">' + App.icon(w.cond, 44) + '<span class="num">' + w.temp + '°</span><small>' + w.summary + '</small></div>' +
        (next ? '<div class="amb-next" style="' + App.pstyle(App.evColor(next)) + '"><i></i>' + App.esc(next.title) + ' · ' + App.fmt.time(next.start) + '</div>' : '')
      : '<div class="amb-tm-label">' + t.label + '</div>' +
        '<div class="amb-wx amb-wx--tm">' + tomorrowWx(t, 44) + '</div>' +
        '<div class="amb-next amb-next--tm">' + tomorrowEv(t) + '</div>';
    return '<div class="amb-clock"><div class="amb-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="amb-date">' + App.fmt.day(n) + ', ' + App.fmt.month(n) + ' ' + n.getDate() + '</div></div>' +
      '<div class="amb-right' + (fade ? ' is-fade' : '') + '">' + right +
      '<div class="amb-who">' + D.people.map(function (p) { return App.avatar(p, 34, p.home ? '' : 'avatar--away'); }).join('') + '</div>' +
      '</div>';
  }
  function nightInfo(fade) {
    var n = App.now(), t = tomorrow(), w = App.weatherNow();
    var cls = fade ? ' is-fade' : '';
    if (page === 1) {
      return '<div class="nt-time nt-time--small num">' + App.fmt.time(n, false) + '</div>' +
        '<div class="nt-tomorrow' + cls + '">' +
        '<div class="nt-tm-label">' + t.label + '</div>' +
        '<div class="nt-tm-wx">' + tomorrowWx(t, 40) + '</div>' +
        '<div class="nt-tm-ev">' + tomorrowEv(t) + '</div></div>' +
        '<div class="nt-wake-hint">Tippen zum Aufwecken</div>';
    }
    var first = t.first;
    return '<div class="nt-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="nt-line' + cls + '">' + App.icon(w.cond, 24) + ' ' + w.temp + '° · ' + (first ? 'Erster Termin ' + App.fmt.rel(first.start).toLowerCase() + ': <b>' + App.esc(first.title) + '</b> ' + App.fmt.time(first.start) : 'Morgen früh keine Termine') + '</div>' +
      '<div class="nt-wake-hint">Tippen zum Aufwecken</div>';
  }

  function paint(fade) {
    if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = ambientInfo(fade);
    if (App.mode === 'night') $('#night .nt-inner').innerHTML = nightInfo(fade);
  }

  // Sanfte Positionsverschiebung alle paar Minuten gegen Einbrennen (Anti-Burn-In)
  var driftZones = [
    { x: 0, y: 0 },
    { x: -35, y: -20 },
    { x: 30, y: -25 },
    { x: -25, y: 25 },
    { x: 35, y: 20 }
  ];
  function pixelShift() {
    var zIdx = Math.floor(Date.now() / (12 * 60000)) % driftZones.length;
    var base = driftZones[zIdx];
    var rx = Math.round(Math.random() * 8 - 4), ry = Math.round(Math.random() * 8 - 4);
    var el = $('#night .nt-inner');
    if (el) el.style.transform = 'translate(' + (base.x + rx) + 'px,' + (base.y + ry) + 'px)';
    App.$$('.amb-info').forEach(function (e) { e.style.transform = 'translate(' + rx + 'px,' + ry + 'px)'; });
  }

  var nightIdleSec = 0;
  // Standby und Nacht wechseln zwischen "jetzt" und "morgen"; im Tiefschlaf der Nacht bleibt es ruhig
  App.on('second', function () {
    if (App.mode !== 'ambient' && App.mode !== 'night') { swapSec = 0; return; }
    var deep = App.mode === 'night' && $('#night').classList.contains('is-ultra-dim');
    if (deep) { if (page) { page = 0; paint(); } swapSec = 0; return; }
    if (++swapSec >= SWAP_AFTER) { swapSec = 0; page = page ? 0 : 1; paint(true); }
  });
  App.on('second', function () {
    if (App.mode === 'night') {
      nightIdleSec++;
      if (nightIdleSec >= 120) {
        var nEl = $('#night');
        if (nEl && !nEl.classList.contains('is-ultra-dim')) nEl.classList.add('is-ultra-dim');
      }
    } else {
      nightIdleSec = 0;
    }
  });

  App.on('ready', function () {
    $('#ambient').innerHTML = '<div class="amb-stage"></div><div class="amb-scrim"></div><div class="amb-info"></div>';
    $('#night').innerHTML = '<div class="nt-inner"></div>';
    var ambInt = App.photoInterval ? App.photoInterval() : 60000;
    amb.show = new App.Slideshow($('#ambient .amb-stage'), { layout: 'cover', captions: false, interval: ambInt });
    $('#ambient').addEventListener('click', function () { App.setMode('day'); App.go('home'); });
    $('#night').addEventListener('click', function () {
      var nEl = $('#night');
      if (nEl.classList.contains('is-ultra-dim')) {
        nEl.classList.remove('is-ultra-dim');
        nightIdleSec = 0;
        return;
      }
      App.setMode('day');
      App.go('home');
    });
  });

  App.on('mode', function (m) {
    clearInterval(shiftTimer);
    page = 0; swapSec = 0;
    if (m === 'ambient') { amb.show.start(); paint(); shiftTimer = setInterval(pixelShift, 60000); }
    else amb.show.stop();
    if (m === 'night') {
      paint();
      shiftTimer = setInterval(pixelShift, 60000);
      nightIdleSec = 0;
      $('#night').classList.remove('is-ultra-dim');
    }
    App.resetIdle();
  });
  App.on('minute', paint);
})();

// Ambient (idle photo frame) and Night (dim red clock) overlays.
(function () {
  'use strict';
  var D = window.DATA, $ = App.$;
  var amb = { show: null }, shiftTimer = null;

  function ambientInfo() {
    var n = App.now(), w = App.weatherNow(), next = App.nextEvent();
    return '<div class="amb-clock"><div class="amb-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="amb-date">' + App.fmt.day(n) + ', ' + App.fmt.month(n) + ' ' + n.getDate() + '</div></div>' +
      '<div class="amb-right">' +
      '<div class="amb-wx">' + App.icon(w.cond, 44) + '<span class="num">' + w.temp + '°</span><small>' + w.summary + '</small></div>' +
      (next ? '<div class="amb-next" style="' + App.pstyle(App.evColor(next)) + '"><i></i>' + App.esc(next.title) + ' · ' + App.fmt.time(next.start) + '</div>' : '') +
      '<div class="amb-who">' + D.people.map(function (p) { return App.avatar(p, 34, p.home ? '' : 'avatar--away'); }).join('') + '</div>' +
      '</div>';
  }
  function nightInfo() {
    var n = App.now(), tomorrow = App.addDays(n, n.getHours() < 6 ? 0 : 1);
    var first = App.timedOn(tomorrow)[0], w = App.weatherNow();
    return '<div class="nt-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="nt-line">' + App.icon(w.cond, 24) + ' ' + w.temp + '° · ' + (first ? 'Erster Termin ' + App.fmt.rel(first.start).toLowerCase() + ': <b>' + App.esc(first.title) + '</b> ' + App.fmt.time(first.start) : 'Morgen früh keine Termine') + '</div>' +
      '<div class="nt-wake-hint">Tippen zum Aufwecken</div>';
  }

  function paint() {
    if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = ambientInfo();
    if (App.mode === 'night') $('#night .nt-inner').innerHTML = nightInfo();
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
    amb.show = new App.Slideshow($('#ambient .amb-stage'), { layout: 'cover', captions: false, interval: 14000 });
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

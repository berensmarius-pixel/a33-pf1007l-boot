// Wetter-Detailansicht (Übersicht + eigenes, schlankes Regenradar).
// Das Radar nutzt RainViewer-Kacheln direkt statt deren schwerer Webseite im iframe:
// zuerst erscheint der neueste Frame, die Animation der letzten ~2 Stunden lädt im Hintergrund.
(function () {
  'use strict';
  var D = window.DATA;
  var LAT = 49.4447, LON = 7.7690;
  var DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var DAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var LABELS = { sun: 'Sonnig', moon: 'Klar', partly: 'Teils wolkig', cloud: 'Bewölkt', rain: 'Regnerisch', snow: 'Schnee' };

  var maps = null, mapsAt = 0;          // RainViewer-Frameliste (5 Minuten zwischengespeichert)
  var radar = null;                      // Zustand des geöffneten Radars

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ------------------------------------------------------------ Übersicht
  function metric(label, value, sub) {
    return '<div class="wx-m"><span>' + label + '</span><b class="num">' + value + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }

  function overview() {
    var w = App.weatherNow(), det = D.weather.detail || {};
    var uv = det.uv != null ? det.uv : null;
    var uvText = uv == null ? '–' : uv < 3 ? 'niedrig' : uv < 6 ? 'mittel' : uv < 8 ? 'hoch' : 'sehr hoch';
    var metrics = '<div class="wx-metrics">' +
      metric('Gefühlt', det.feels != null ? det.feels + '°' : '–') +
      metric('Wind', det.wind != null ? det.wind + '<small> km/h</small>' : '–', det.gust != null ? 'Böen bis ' + det.gust : '') +
      metric('Luftfeuchte', det.humidity != null ? det.humidity + '<small> %</small>' : '–') +
      metric('UV-Index', uv != null ? uv : '–', uvText) +
      metric('Sonne', det.sunrise ? det.sunrise : '–', det.sunset ? 'bis ' + det.sunset : '') +
      '</div>';

    var hrs = (det.hours || []).filter(function (h, i) { return i % 2 === 0; }).slice(0, 12);
    var tmin = Math.min.apply(null, hrs.map(function (h) { return h.t; })), tmax = Math.max.apply(null, hrs.map(function (h) { return h.t; }));
    var hourly = hrs.length ? '<div class="wx-sec">Nächste 24 Stunden</div><div class="wx-hours">' + hrs.map(function (h, i) {
      var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 18);
      return '<div class="wx-h' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="wx-h-l">' + (i === 0 ? 'Jetzt' : pad(h.h) + ' Uhr') + '</span>' +
        '<span class="wx-h-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 30) + '</span><b class="num">' + h.t + '°</b>' +
        '<span class="wx-h-bar"><i style="height:' + Math.max(2, Math.round(h.p * 0.38)) + 'px"></i></span><span class="wx-h-p">' + h.p + ' %</span></div>';
    }).join('') + '</div>' : '';

    var days = (det.days || []).slice(0, 5);
    var dmin = Math.min.apply(null, days.map(function (d) { return d.lo; })), dmax = Math.max.apply(null, days.map(function (d) { return d.hi; }));
    var daily = days.length ? '<div class="wx-sec">Die nächsten Tage</div><div class="wx-days">' + days.map(function (d, i) {
      var dt = new Date(d.date + 'T12:00:00');
      var span = Math.max(1, dmax - dmin);
      return '<div class="wx-d' + (d.p >= 50 ? ' is-wet' : '') + '"><span class="wx-d-l">' + (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : DAYS_LONG[dt.getDay()]) + '</span>' +
        App.icon(d.c, 34) + '<span class="wx-d-t"><b class="num">' + d.hi + '°</b><em class="num">' + d.lo + '°</em></span>' +
        '<span class="wx-d-range"><i style="left:' + Math.round((d.lo - dmin) / span * 100) + '%;width:' + Math.max(8, Math.round((d.hi - d.lo) / span * 100)) + '%"></i></span>' +
        '<span class="wx-d-p">' + (d.p >= 20 ? '☂ ' + d.p + ' %' : 'trocken') + (d.mm >= 0.5 ? '<small> · ' + d.mm + ' mm</small>' : '') + '</span></div>';
    }).join('') + '</div>' : '';

    return '<div class="wx-now">' +
      '<span class="wx-now-i">' + App.icon(w.cond, 84) + '</span>' +
      '<div class="wx-now-t"><b class="num">' + w.temp + '°</b><span>' + w.label + ' · H ' + w.hi + '° T ' + w.lo + '°</span></div>' +
      '<div class="wx-now-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '</div>' + metrics + hourly + daily;
  }

  // ------------------------------------------------------------ Radar
  var TILE = 256;
  function worldPx(lat, lon, z) {
    var n = TILE * Math.pow(2, z), s = Math.tan(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n, y: (1 - Math.log(s + Math.sqrt(s * s + 1)) / Math.PI) / 2 * n };
  }

  function loadMaps(cb) {
    if (maps && Date.now() - mapsAt < 5 * 60 * 1000) return cb(null, maps);
    var done = false, timer = setTimeout(function () { if (!done) { done = true; cb('timeout'); } }, 9000);
    fetch('https://api.rainviewer.com/public/weather-maps.json').then(function (r) { return r.json(); }).then(function (j) {
      if (done) return; done = true; clearTimeout(timer);
      if (!j || !j.radar || !j.radar.past || !j.radar.past.length) return cb('empty');
      maps = j; mapsAt = Date.now(); cb(null, maps);
    }).catch(function () { if (!done) { done = true; clearTimeout(timer); cb('error'); } });
  }

  function stopRadar() {
    if (!radar) return;
    clearInterval(radar.timer); radar.dead = true;
    var imgs = radar.box ? radar.box.querySelectorAll('img') : [];
    for (var i = 0; i < imgs.length; i++) imgs[i].src = '';
    radar = null;
  }

  function radarHtml() {
    return '<div class="wx-map" id="wxMap"><div class="wx-map-msg" id="wxMapMsg">Radar wird geladen …</div></div>' +
      '<div class="wx-rctl">' +
      '  <button class="wx-btn" id="wxPlay" aria-label="Abspielen"></button>' +
      '  <div class="wx-rtime"><b class="num" id="wxRTime">–</b><small id="wxRSub"></small></div>' +
      '  <div class="wx-rticks" id="wxTicks"></div>' +
      '  <div class="wx-zoom"><button class="wx-btn wx-btn--sq" id="wxZm" aria-label="Herauszoomen">−</button><button class="wx-btn wx-btn--sq" id="wxZp" aria-label="Hineinzoomen">+</button></div>' +
      '</div>' + rainBars();
  }

  function rainBars() {
    var r15 = D.weather && D.weather.rain15, slots = (r15 && r15.slots) || [];
    if (!slots.length) return '';
    var maxMm = Math.max(0.5, Math.max.apply(null, slots.map(function (s) { return s.mm; })));
    return '<div class="wx-rain"><span class="wx-rain-t">' + App.esc(r15.summary) + '</span><div class="wx-rain-bars">' + slots.map(function (s) {
      return '<div class="wx-rb"><i style="height:' + Math.max(3, Math.round(s.mm / maxMm * 30)) + 'px;background:' + (s.mm > 0.05 ? '#3b82f6' : 'var(--line)') + '"></i><span>' + s.time + '</span></div>';
    }).join('') + '</div></div>';
  }

  function buildBase(r) {
    var box = r.box, W = box.clientWidth, H = box.clientHeight, z = r.z, rz = Math.min(7, z);
    var c = worldPx(LAT, LON, z), ox = c.x - W / 2, oy = c.y - H / 2;
    var html = '', labels = '', maxT = Math.pow(2, z), x, y;
    var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    for (x = Math.floor(ox / TILE); x <= Math.floor((ox + W) / TILE); x++) {
      for (y = Math.floor(oy / TILE); y <= Math.floor((oy + H) / TILE); y++) {
        if (y < 0 || y >= maxT) continue;
        var tx = ((x % maxT) + maxT) % maxT;
        var pos = 'left:' + Math.round(x * TILE - ox) + 'px;top:' + Math.round(y * TILE - oy) + 'px';
        html += '<img class="wx-tile" alt="" draggable="false" style="' + pos + '" src="' + ESRI + 'World_Light_Gray_Base/MapServer/tile/' + z + '/' + y + '/' + tx + '">';
        labels += '<img class="wx-tile" alt="" draggable="false" style="' + pos + '" src="' + ESRI + 'World_Light_Gray_Reference/MapServer/tile/' + z + '/' + y + '/' + tx + '">';
      }
    }
    r.base.innerHTML = html;
    r.labels.innerHTML = labels;
    r.geo = { ox: ox, oy: oy, W: W, H: H, rz: rz, rsize: TILE * Math.pow(2, z - rz) };
    r.pin.style.left = Math.round(c.x - ox) + 'px';
    r.pin.style.top = Math.round(c.y - oy) + 'px';
  }

  function frameLayer(r, f) {
    var g = r.geo, layer = document.createElement('div'), html = '', x, y, maxT = Math.pow(2, g.rz);
    layer.className = 'wx-frame';
    var tilesPerPx = g.rsize;
    for (x = Math.floor(g.ox / tilesPerPx); x <= Math.floor((g.ox + g.W) / tilesPerPx); x++) {
      for (y = Math.floor(g.oy / tilesPerPx); y <= Math.floor((g.oy + g.H) / tilesPerPx); y++) {
        if (y < 0 || y >= maxT) continue;
        var tx = ((x % maxT) + maxT) % maxT;
        html += '<img class="wx-rtile" alt="" draggable="false" style="left:' + Math.round(x * tilesPerPx - g.ox) + 'px;top:' + Math.round(y * tilesPerPx - g.oy) + 'px;width:' + tilesPerPx + 'px;height:' + tilesPerPx + 'px" src="' + maps.host + f.path + '/256/' + g.rz + '/' + tx + '/' + y + '/2/1_1.png">';
      }
    }
    layer.innerHTML = html;
    f.layer = layer;
    f.pending = layer.querySelectorAll('img').length;
    var imgs = layer.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].onload = imgs[i].onerror = function () { f.pending--; if (f.pending <= 0) { f.ready = true; if (f.onReady) f.onReady(); } };
    }
    if (!imgs.length) f.ready = true;
    r.frames.appendChild(layer);
    return layer;
  }

  function showFrame(r, i) {
    var f = r.list[i];
    if (!f || !f.ready) return;
    if (r.cur != null && r.list[r.cur] && r.list[r.cur].layer) r.list[r.cur].layer.style.opacity = 0;
    f.layer.style.opacity = 1; r.cur = i;
    var mins = Math.round((Date.now() / 1000 - f.time) / 60), d = new Date(f.time * 1000);
    document.getElementById('wxRTime').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    document.getElementById('wxRSub').textContent = mins <= 4 ? 'aktuell' : 'vor ' + mins + ' Min.';
    var ticks = document.querySelectorAll('#wxTicks i');
    for (var k = 0; k < ticks.length; k++) ticks[k].className = (k === i ? 'is-on ' : '') + (r.list[k].ready ? 'is-ready' : '');
  }

  function setPlaying(r, on) {
    r.playing = on;
    var b = document.getElementById('wxPlay');
    if (b) b.innerHTML = on ? '❚❚' : '▶';
    clearInterval(r.timer);
    if (!on) return;
    r.timer = setInterval(function () {
      var n = r.cur, tries = 0;
      do { n = (n + 1) % r.list.length; tries++; } while (!r.list[n].ready && tries <= r.list.length);
      showFrame(r, n);
    }, 650);
  }

  function startRadar() {
    stopRadar();
    var box = document.getElementById('wxMap'), msg = document.getElementById('wxMapMsg');
    if (!box) return;
    var r = radar = { box: box, z: 8, list: [], cur: null, playing: false };
    box.insertAdjacentHTML('afterbegin', '<div class="wx-base"></div><div class="wx-frames"></div><div class="wx-labels"></div><div class="wx-pin"></div><div class="wx-attr">Esri · RainViewer</div>');
    r.base = box.querySelector('.wx-base'); r.frames = box.querySelector('.wx-frames'); r.pin = box.querySelector('.wx-pin'); r.labels = box.querySelector('.wx-labels');
    loadMaps(function (err) {
      if (r.dead) return;
      if (err) {
        msg.innerHTML = 'Radar nicht erreichbar.<br><button class="wx-btn wx-retry" id="wxRetry">Nochmal versuchen</button>';
        document.getElementById('wxRetry').onclick = function () { msg.textContent = 'Radar wird geladen …'; startRadar(); };
        return;
      }
      msg.style.display = 'none';
      mountFrames(r);
    });
    document.getElementById('wxPlay').onclick = function () { if (r.list.length) setPlaying(r, !r.playing); };
    document.getElementById('wxZm').onclick = function () { zoom(r, -1); };
    document.getElementById('wxZp').onclick = function () { zoom(r, 1); };
    document.getElementById('wxTicks').onclick = function (e) {
      var t = e.target.closest ? e.target.closest('i') : null;
      if (!t || !r.list.length) return;
      setPlaying(r, false); showFrame(r, +t.getAttribute('data-i'));
    };
  }

  // Neuester Frame zuerst (sofort sichtbar), die übrigen danach der Reihe nach im Hintergrund
  function mountFrames(r) {
    buildBase(r);
    var past = maps.radar.past.slice(-9);       // letzte ~90 Minuten
    r.list = past.map(function (p) { return { time: p.time, path: p.path, ready: false }; });
    document.getElementById('wxTicks').innerHTML = r.list.map(function (f, i) { return '<i data-i="' + i + '"></i>'; }).join('');
    var last = r.list.length - 1;
    function load(order) {
      if (r.dead || !order.length) { if (!r.dead) setPlaying(r, true); return; }
      var i = order.shift(), f = r.list[i];
      frameLayer(r, f);
      var go = function () { if (r.dead) return; if (i === last) showFrame(r, last); load(order); };
      f.onReady = go; if (f.ready) go();
    }
    var order = [last]; for (var i = 0; i < last; i++) order.push(i);
    load(order);
  }

  function zoom(r, d) {
    var nz = Math.max(6, Math.min(8, r.z + d));
    if (nz === r.z) return;
    var wasPlaying = r.playing, cur = r.cur;
    setPlaying(r, false);
    r.z = nz; r.frames.innerHTML = ''; r.cur = null;
    document.getElementById('wxZm').disabled = nz <= 6; document.getElementById('wxZp').disabled = nz >= 8;
    mountFrames(r);
  }

  // ------------------------------------------------------------ Sheet
  App.openWeather = function (tab) {
    var cur = tab === 'radar' ? 'radar' : 'now';
    function body() {
      return '<div class="wx-body">' + (cur === 'now' ? overview() : radarHtml()) + '</div>';
    }
    function html() {
      return '<div class="wx-head"><div class="wx-title"><b>Wetter Kaiserslautern</b><small>Open-Meteo · RainViewer</small></div>' +
        '<div class="wx-tabs"><button data-wx="now" class="' + (cur === 'now' ? 'is-on' : '') + '">Übersicht</button><button data-wx="radar" class="' + (cur === 'radar' ? 'is-on' : '') + '">Regenradar</button></div></div>' + body();
    }
    var close = App.sheet('<div class="wx-sheet">' + html() + '</div>', {
      cls: 'sheet--wide wx-wide',
      onClose: stopRadar,
      onMount: function (sheet) {
        function paint() {
          stopRadar();
          sheet.querySelector('.wx-sheet').innerHTML = html();
          if (cur === 'radar') startRadar();
        }
        sheet.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('[data-wx]') : null;
          if (!b || b.getAttribute('data-wx') === cur) return;
          cur = b.getAttribute('data-wx'); paint();
        });
        if (cur === 'radar') setTimeout(startRadar, 60);
      }
    });
    return close;
  };
})();

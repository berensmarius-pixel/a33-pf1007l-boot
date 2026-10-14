// Live Sync: Kaiserslautern Weather + Google Calendar (Marius & Soraya)
import { parseIcs } from './ics.js';
import { computeAlerts } from './alerts.js';
(function () {
  'use strict';
  if (window.DATA && !window.DATA.sync) window.DATA.sync = { start: Date.now() };

  var KAISERSLAUTERN_LAT = 49.4447;
  var KAISERSLAUTERN_LON = 7.7690;

  // ------------------------------------------------------------ Weather Sync
  function mapWmoToCondition(code, hour) {
    var isNight = hour >= 20 || hour < 6;
    if (code === 0) return isNight ? 'moon' : 'sun';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3 || code === 45 || code === 48) return 'cloud';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
    return isNight ? 'moon' : 'sun';
  }

  async function updateWeather() {
    if (window.App && window.App.mode === 'night') {
      var syncD = window.DATA;
      if (syncD && syncD.sync && syncD.sync.weather && (Date.now() - syncD.sync.weather) < 60 * 60 * 1000) return;
    }
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + KAISERSLAUTERN_LAT +
        '&longitude=' + KAISERSLAUTERN_LON +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code' +
        '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m' +
        '&minutely_15=precipitation,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset' +
        '&timezone=Europe%2FBerlin&forecast_days=6';

      var resp = await fetch(url);
      if (!resp.ok) return;
      var data = await resp.json();

      var D = window.DATA;
      if (!D || !D.weather) return;
      D.sync.weather = Date.now();

      var currentHour = new Date().getHours();
      var t = [];
      var c = [];
      var p = [];

      for (var h = 0; h < 24; h++) {
        var temp = Math.round(data.hourly.temperature_2m[h] || 15);
        var prob = Math.round(data.hourly.precipitation_probability[h] || 0);
        var code = data.hourly.weather_code[h] != null ? data.hourly.weather_code[h] : 0;
        t.push(temp);
        p.push(prob);
        c.push(mapWmoToCondition(code, h));
      }

      // 15-Minuten Kurzzeit-Regenprognose (nächste 2 Stunden)
      if (data.minutely_15 && Array.isArray(data.minutely_15.precipitation)) {
        var m15 = data.minutely_15;
        var nowMs = Date.now();
        var startIdx = 0;
        for (var i = 0; i < m15.time.length; i++) {
          var dt = new Date(m15.time[i]).getTime();
          if (dt <= nowMs) startIdx = i;
          else break;
        }
        var next8 = [];
        var totalMm = 0;
        var rainStart = null;
        var rainEnd = null;
        for (var k = 0; k < 8 && (startIdx + k) < m15.time.length; k++) {
          var idx = startIdx + k;
          var val = Math.round((m15.precipitation[idx] || 0) * 10) / 10;
          var tStr = m15.time[idx] ? m15.time[idx].slice(11, 16) : '';
          next8.push({ time: tStr, mm: val });
          totalMm += val;
          if (val > 0.05 && !rainStart) rainStart = tStr;
          if (val > 0.05) rainEnd = tStr;
        }
        var rainText = 'Trocken in den nächsten 2 Stunden';
        if (totalMm > 0.05) {
          if (next8[0] && next8[0].mm > 0.05) {
            rainText = 'Regen bis ca. ' + (rainEnd || 'bald') + ' Uhr';
          } else {
            rainText = 'Regen ab ' + rainStart + ' Uhr (ca. ' + Math.round(totalMm * 10) / 10 + ' mm)';
          }
        }
        D.weather.rain15 = {
          slots: next8,
          totalMm: Math.round(totalMm * 10) / 10,
          summary: rainText,
          hasRain: totalMm > 0.05
        };
      }

      // Detailansicht: nächste 24 Stunden, 5 Tage, Wind/Gefühlt/UV/Sonne
      try {
        var H = data.hourly, cur = data.current || {}, dly = data.daily || {};
        var hrs = [];
        for (var q = 0; q < 24 && (currentHour + q) < H.time.length; q++) {
          var qi = currentHour + q, qh = (currentHour + q) % 24;
          hrs.push({
            h: qh, t: Math.round(H.temperature_2m[qi]), p: Math.round(H.precipitation_probability[qi] || 0),
            mm: Math.round((H.precipitation[qi] || 0) * 10) / 10,
            c: mapWmoToCondition(H.weather_code[qi] != null ? H.weather_code[qi] : 0, qh)
          });
        }
        var days = [];
        if (dly.time) {
          for (var d = 0; d < dly.time.length; d++) {
            days.push({
              date: dly.time[d], c: mapWmoToCondition(dly.weather_code[d] != null ? dly.weather_code[d] : 0, 12),
              hi: Math.round(dly.temperature_2m_max[d]), lo: Math.round(dly.temperature_2m_min[d]),
              p: Math.round(dly.precipitation_probability_max[d] || 0), mm: Math.round((dly.precipitation_sum[d] || 0) * 10) / 10
            });
          }
        }
        D.weather.detail = {
          feels: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
          wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
          gust: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null,
          humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
          uv: dly.uv_index_max ? Math.round(dly.uv_index_max[0] * 10) / 10 : null,
          sunrise: dly.sunrise ? dly.sunrise[0].slice(11, 16) : null,
          sunset: dly.sunset ? dly.sunset[0].slice(11, 16) : null,
          hours: hrs, days: days
        };
      } catch (e2) { console.warn('[LiveSync] Wetter-Details:', e2); }

      D.weather.alerts = computeAlerts(data, currentHour);
      D.weather.t = t;
      D.weather.c = c;
      D.weather.p = p;
      if (data.daily && data.daily.temperature_2m_max) {
        D.weather.hi = Math.round(data.daily.temperature_2m_max[0]);
        D.weather.lo = Math.round(data.daily.temperature_2m_min[0]);
      }

      if (window.App) {
        window.App.emit('data');
        window.App.rerender();
      }
      console.log('[LiveSync] Weather updated for Kaiserslautern:', t[currentHour] + '°C');
    } catch (err) {
      console.warn('[LiveSync] Weather update failed:', err);
    }
  }

  async function updateCalendar() {
    if (window.App && window.App.mode === 'night') {
      var syncD = window.DATA;
      if (syncD && syncD.sync && syncD.sync.calendar && (Date.now() - syncD.sync.calendar) < 45 * 60 * 1000) return;
    }
    var fetchUrl = '/api/calendar';

    try {
      var resp = await fetch(fetchUrl);
      if (!resp.ok) {
        console.log('[LiveSync] No calendar feed returned from server (HTTP ' + resp.status + ')');
        return;
      }
      var icsText = await resp.text();
      if (!icsText || icsText.indexOf('BEGIN:VCALENDAR') === -1) {
        return;
      }

      var parsed = parseIcs(icsText);
      window.DATA.events = parsed;
      window.DATA.sync.calendar = Date.now();
      if (window.App) {
        window.App.emit('data');
        window.App.rerender();
      }
      console.log('[LiveSync] Loaded ' + parsed.length + ' real Google Calendar events for Marius & Soraya');
    } catch (err) {
      console.warn('[LiveSync] Calendar fetch failed:', err);
    }
  }

  // ------------------------------------------------------------ Fuel Price Sync (Kaiserslautern)
  async function updateFuel() {
    if (window.App && window.App.mode === 'night') return;
    try {
      var resp = await fetch('/api/fuel?type=e5');
      if (!resp.ok) return;
      var data = await resp.json();
      if (data && data.ok && window.DATA) {
        window.DATA.fuel = data;
        if (window.App) {
          window.App.emit('data');
          window.App.emit('fuel-update');
        }
        console.log('[LiveSync] Spritpreise aktualisiert:', data.cheapest ? data.cheapest.name + ' ' + data.cheapest.price + '€' : 'Keine');
      }
    } catch (e) {
      console.warn('[LiveSync] Fuel fetch failed:', e);
    }
  }

  // ------------------------------------------------------------ KI-Nutzung (Claude Code, echte Daten)
  async function updateUsage() {
    if (window.App && window.App.mode === 'night') return;
    try {
      var resp = await fetch('/api/usage');
      if (!resp.ok) return;
      var u = await resp.json();
      if (!u || !u.claude || !window.DATA) return;
      var c = u.claude, a = window.DATA.agents[0];
      var meters = [];
      if (c.session) {
        var s5 = c.limits && c.limits.session ? Math.min(100, Math.round(c.session.tokens / c.limits.session * 100)) : null;
        meters.push({ label: 'Sitzung (5 h)', win: 300, used: s5 === null ? 0 : s5, left: c.session.leftMin,
          detail: c.session.tokens.toFixed(2).replace('.', ',') + ' Mio. Tokens', noBar: s5 === null });
      }
      if (c.limits && c.limits.week) {
        meters.push({ label: 'Woche', win: 10080, used: Math.min(100, Math.round(c.weekTotal / c.limits.week * 100)), left: 10080,
          detail: c.weekTotal.toFixed(1).replace('.', ',') + ' Mio. Tokens' });
      }
      window.DATA.sync.usage = Date.now();
      a.meters = meters; a.tokens = c.tokens; a.week = c.week; a.live = true;
      a.updatedAt = u.updatedAt;
      if (window.App) { window.App.emit('data'); window.App.rerender(); }
    } catch (e) {
      console.warn('[LiveSync] Usage fetch failed:', e);
    }
  }

  // ------------------------------------------------------------ Mobile Photos Sync (Cloudflare R2)
  var knownPhotoIds = new Set();
  var firstPhotoRun = true;
  async function updatePhotos() {
    if (window.App && window.App.mode === 'night') return;
    try {
      var resp = await fetch('/api/photos');
      if (!resp.ok) return;
      var data = await resp.json();
      if (data && data.ok && Array.isArray(data.photos) && window.DATA) {
        var added = 0;
        data.photos.forEach(function (p) {
          if (/\.hei[cf]$/i.test(p.id || p.url || '')) return;   // HEIC kann das Tablet nicht darstellen
          if (!knownPhotoIds.has(p.id)) {
            knownPhotoIds.add(p.id);
            var exists = window.DATA.photos.some(function (x) { return x.id === p.id || x.url === p.url; });
            if (!exists) {
              window.DATA.photos.unshift({
                id: p.id,
                url: p.url,
                o: 'l',
                date: (p.taken ? p.taken.slice(0, 10) : p.date) || new Date().toISOString().split('T')[0],
                place: p.place || (p.title && p.title !== 'Schnappschuss' ? p.title : ''),
                from: p.who || 'marius',
                tag: 'upload',
                r2: true
              });
              added++;
            }
          }
        });
        if (added > 0 && window.App) {
          window.App.emit('data');
          if (!firstPhotoRun) {
            window.App.toast('📸 ' + added + ' neues Foto empfangen!');
          }
        }
        firstPhotoRun = false;
      }
    } catch (e) {}
  }

  // Initial runs
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    updateWeather();
    updateCalendar();
    updateFuel();
    updatePhotos();
    updateUsage();
    checkVersion();
    setInterval(updateUsage, 5 * 60 * 1000);

    // Weather & Fuel refresh every 15 minutes
    setInterval(updateWeather, 15 * 60 * 1000);
    setInterval(updateFuel, 15 * 60 * 1000);
    // Calendar refresh every 5 minutes
    setInterval(updateCalendar, 5 * 60 * 1000);
    // Mobile R2/KV Photos refresh alle 5 Minuten (drastische KV-Entlastung)
    setInterval(updatePhotos, 5 * 60 * 1000);
    // Auto-Update: Alle 3 Minuten prüfen, ob neue Version deployed wurde
    setInterval(checkVersion, 3 * 60 * 1000);

    if (window.App) {
      window.App.on('mode', function (m) {
        if (m === 'day') {
          // Morgens beim Aufwachen sofort alles frisch ziehen
          updateWeather();
          updateCalendar();
          updatePhotos();
          updateFuel();
          updateUsage();
          updateLiveTrack();
          checkVersion();
        }
      });
    }

    updateLiveTrack();
    // LiveTrack alle 30 Sekunden prüfen
    setInterval(updateLiveTrack, 30 * 1000);
  }

  // ------------------------------------------------------------ Garmin LiveTrack Sync
  var lastLiveTrackActive = false;
  async function updateLiveTrack() {
    try {
      var resp = await fetch('/api/livetrack', { cache: 'no-store' });
      if (!resp.ok) return;
      var data = await resp.json();
      var D = window.DATA;
      if (!D) return;
      var isActive = Boolean(data && data.active && data.session);
      D.livetrack = isActive ? data.session : null;

      if (isActive && !lastLiveTrackActive) {
        // Neuer Start: Automatisch direkt im Vollbild auf dem Tablet öffnen!
        if (window.App) {
          if (window.App.LiveTrack) window.App.LiveTrack.openFull();
          window.App.toast('🚴 Marius ist auf dem Rad unterwegs! LiveTrack geöffnet.', { icon: 'bike', ms: 8000 });
        }
      } else if (isActive && lastLiveTrackActive) {
        // Läuft bereits: Falls noch nicht offen und nicht von Soraya manuell minimiert
        if (window.App && window.App.LiveTrack && !window.App.LiveTrack.isOpen() && !window.App.LiveTrack.isDismissed()) {
          window.App.LiveTrack.openFull();
        }
      } else if (!isActive && lastLiveTrackActive) {
        // Fahrt beendet: Automatisch Vollbild schließen!
        if (window.App) {
          if (window.App.LiveTrack && window.App.LiveTrack.isOpen()) window.App.LiveTrack.close();
          window.App.toast('🏁 Marius hat die Fahrt beendet.', { icon: 'check', ms: 5000 });
        }
      }
      lastLiveTrackActive = isActive;
      if (window.App) {
        window.App.emit('data');
        window.App.emit('livetrack-update');
      }
    } catch (e) {}
  }

  var currentVersion = null;
  function checkVersion() {
    fetch('/api/version', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.version) {
        if (currentVersion && currentVersion !== d.version) {
          console.log('[LiveSync] Neue Version erkannt (' + d.version + ') - lade Dashboard neu...');
          location.reload(true);
        } else {
          currentVersion = d.version;
        }
      }
    }).catch(function () {});
  }

  window.LiveSync = {
    updateWeather: updateWeather,
    updateCalendar: updateCalendar,
    updateFuel: updateFuel,
    updatePhotos: updatePhotos,
    updateUsage: updateUsage,
    updateLiveTrack: updateLiveTrack
  };
})();

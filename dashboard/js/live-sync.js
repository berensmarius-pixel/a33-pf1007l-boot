// Live Sync: Kaiserslautern Weather + Google Calendar (Marius & Soraya)
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

  // Warnungen für die nächsten ~14 Stunden (Open-Meteo-Stundenwerte, Index 0 = heute 00:00)
  function computeAlerts(data, h0) {
    var H = data.hourly, out = [], end = Math.min(h0 + 14, H.time.length);
    function hh(i) { return (i % 24) + ' Uhr'; }
    var storm = -1, snow = -1, rain = -1, rainEnd = -1, minT = 99, minAt = -1, maxT = -99, maxG = 0;
    for (var i = h0; i < end; i++) {
      var code = H.weather_code[i], p = H.precipitation_probability[i] || 0, tt = H.temperature_2m[i], g = H.wind_gusts_10m ? (H.wind_gusts_10m[i] || 0) : 0;
      if (code >= 95 && code <= 99 && storm < 0) storm = i;
      if (((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) && snow < 0) snow = i;
      if (p >= 60 && i < h0 + 8) { if (rain < 0) rain = i; rainEnd = i + 1; }
      if (tt < minT) { minT = tt; minAt = i; }
      if (tt > maxT) maxT = tt;
      if (g > maxG) maxG = g;
    }
    if (storm > -1) out.push({ level: 'alert', icon: 'bolt', title: 'Gewitter ab ' + hh(storm), text: 'Geräte ausstecken, Fenster zu' });
    if (maxG >= 60) out.push({ level: 'alert', icon: 'bolt', title: 'Sturmböen bis ' + Math.round(maxG) + ' km/h', text: 'Draußen alles sichern' });
    if (snow > -1) out.push({ level: 'warn', icon: 'cloud', title: 'Schnee ab ' + hh(snow), text: 'Früher losfahren, Glätte möglich' });
    else if (rain > -1) out.push({ level: 'warn', icon: 'rain', title: rain === h0 ? 'Regen bis ' + hh(rainEnd) : 'Regen ab ' + hh(rain), text: 'Wäsche reinholen, Schirm mitnehmen' });
    if (minT <= 0) out.push({ level: 'warn', icon: 'thermo', title: 'Frost: bis ' + Math.round(minT) + '° um ' + hh(minAt), text: 'Autoscheiben und Pflanzen schützen' });
    if (maxT >= 30) out.push({ level: 'warn', icon: 'sun', title: 'Hitze bis ' + Math.round(maxT) + '°', text: 'Viel trinken, Rollläden runter' });
    return out;
  }

  async function updateWeather() {
    if (window.App && window.App.mode === 'night') {
      var syncD = window.DATA;
      if (syncD && syncD.sync && syncD.sync.weather && (Date.now() - syncD.sync.weather) < 60 * 60 * 1000) return;
    }
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + KAISERSLAUTERN_LAT +
        '&longitude=' + KAISERSLAUTERN_LON +
        '&current=temperature_2m,weather_code' +
        '&hourly=temperature_2m,precipitation_probability,weather_code,wind_gusts_10m' +
        '&minutely_15=precipitation,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&timezone=Europe%2FBerlin&forecast_days=2';

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

      D.weather.alerts = computeAlerts(data, currentHour);
      D.weather.t = t;
      D.weather.c = c;
      D.weather.p = p;
      if (data.daily && data.daily.temperature_2m_max) {
        D.weather.hi = Math.round(data.daily.temperature_2m_max[0]);
        D.weather.lo = Math.round(data.daily.temperature_2m_min[0]);
      }
      if (D.climate && data.current) {
        D.climate.outside = Math.round(data.current.temperature_2m);
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

  // ------------------------------------------------------------ iCal / ICS Parser
  function parseIcsDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{8}$/.test(str)) {
      var yr = parseInt(str.substr(0, 4), 10);
      var mo = parseInt(str.substr(4, 2), 10) - 1;
      var dy = parseInt(str.substr(6, 2), 10);
      return { date: new Date(yr, mo, dy, 0, 0, 0), allDay: true };
    }
    var m = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (m) {
      if (m[7] === 'Z') {
        return {
          date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])),
          allDay: false
        };
      }
      return {
        date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
        allDay: false
      };
    }
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : { date: d, allDay: false };
  }

  function assignPeople(title) {
    var lower = (title || '').toLowerCase();
    if (lower.indexOf('soraya') > -1 || lower.indexOf('schatz') > -1) {
      return ['soraya'];
    }
    if (lower.indexOf('marius') > -1 && lower.indexOf('soraya') > -1) {
      return ['marius', 'soraya'];
    }
    return ['marius'];
  }

  var DAY_MS = 86400000;
  var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function unescapeText(v) {
    return v.replace(/\,/g, ',').replace(/\;/g, ';').replace(/\n/gi, ' ').trim();
  }

  function parseRrule(str) {
    var r = { freq: '', interval: 1, byday: [], wkst: 1, until: null, count: 0 };
    str.split(';').forEach(function (part) {
      var kv = part.split('=');
      var k = kv[0].toUpperCase(), v = kv[1] || '';
      if (k === 'FREQ') r.freq = v.toUpperCase();
      else if (k === 'INTERVAL') r.interval = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'COUNT') r.count = parseInt(v, 10) || 0;
      else if (k === 'UNTIL') { var u = parseIcsDate(v); if (u) r.until = u.date; }
      else if (k === 'WKST') r.wkst = WD[v.toUpperCase()] != null ? WD[v.toUpperCase()] : 1;
      else if (k === 'BYDAY') {
        r.byday = v.split(',').map(function (d) { return WD[d.replace(/[^A-Z]/gi, '').toUpperCase()]; })
          .filter(function (d) { return d != null; });
      }
    });
    return r;
  }

  // Gleiche Uhrzeit (Wanduhr) an einem anderen Tag, damit Sommer-/Winterzeit nichts verschiebt.
  function atDay(base, y, m, d) {
    return new Date(y, m, d, base.getHours(), base.getMinutes(), base.getSeconds());
  }

  // Alle Vorkommen einer Terminserie im Zeitraum [from, to]
  function expandSeries(e, from, to) {
    var r = parseRrule(e.rrule), out = [], n = 0, guard = 0;
    var s0 = e.start;
    var limit = r.until && r.until < to ? r.until : to;

    function emit(d) {
      n++;
      if (r.count && n > r.count) return false;
      if (d > limit) return false;
      out.push(d);
      return true;
    }

    if (r.freq === 'WEEKLY') {
      var days = r.byday.length ? r.byday.slice() : [s0.getDay()];
      var offs = days.map(function (d) { return (d - r.wkst + 7) % 7; }).sort(function (x, y) { return x - y; });
      var anchor = atDay(s0, s0.getFullYear(), s0.getMonth(), s0.getDate() - ((s0.getDay() - r.wkst + 7) % 7));
      var k = 0;
      if (!r.count) {
        k = Math.max(0, Math.floor((from - anchor) / (r.interval * 7 * DAY_MS)) - 1);
      }
      for (; guard < 20000; guard++, k++) {
        var wk = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + k * r.interval * 7);
        if (wk > limit) break;
        var stop = false;
        for (var i = 0; i < offs.length; i++) {
          var d = atDay(s0, wk.getFullYear(), wk.getMonth(), wk.getDate() + offs[i]);
          if (d < s0) continue;
          if (!emit(d)) { stop = true; break; }
        }
        if (stop) break;
      }
    } else if (r.freq === 'DAILY') {
      for (var j = 0; guard < 20000; guard++, j += r.interval) {
        var dd = atDay(s0, s0.getFullYear(), s0.getMonth(), s0.getDate() + j);
        if (!emit(dd)) break;
      }
    } else if (r.freq === 'MONTHLY') {
      for (var m = 0; guard < 2000; guard++, m += r.interval) {
        var md = atDay(s0, s0.getFullYear(), s0.getMonth() + m, s0.getDate());
        if (md.getDate() !== s0.getDate()) continue; // z. B. 31. in kurzen Monaten
        if (!emit(md)) break;
      }
    } else if (r.freq === 'YEARLY') {
      for (var y = 0; guard < 500; guard++, y += r.interval) {
        var yd = atDay(s0, s0.getFullYear() + y, s0.getMonth(), s0.getDate());
        if (!emit(yd)) break;
      }
    } else {
      out.push(s0);
    }
    return out;
  }

  function parseIcs(icsText) {
    var unfolded = icsText.replace(/\r?\n[ \t]/g, '');
    var lines = unfolded.split(/\r?\n/);
    var rawEvents = [];
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
      if (line === 'END:VEVENT') {
        if (cur && cur.title !== undefined && cur.start) rawEvents.push(cur);
        cur = null;
        continue;
      }
      if (!cur) continue;
      if (line.indexOf('BEGIN:') === 0) { cur.inAlarm = true; continue; }   // VALARM überspringen
      if (line.indexOf('END:') === 0) { cur.inAlarm = false; continue; }
      if (cur.inAlarm) continue;

      var colon = line.indexOf(':');
      if (colon === -1) continue;
      var prop = line.substr(0, colon).split(';')[0].toUpperCase();
      var val = line.substr(colon + 1);

      if (prop === 'SUMMARY') cur.title = unescapeText(val);
      else if (prop === 'LOCATION') cur.loc = unescapeText(val);
      else if (prop === 'DESCRIPTION') cur.notes = val.replace(/\,/g, ',').replace(/\;/g, ';').replace(/\n/gi, '\n').trim();
      else if (prop === 'UID') cur.uid = val;
      else if (prop === 'STATUS') cur.cancelled = /CANCELLED/i.test(val);
      else if (prop === 'RRULE') cur.rrule = val;
      else if (prop === 'EXDATE') {
        val.split(',').forEach(function (v) { var x = parseIcsDate(v); if (x) cur.exdates.push(x.date.getTime()); });
      } else if (prop === 'RECURRENCE-ID') {
        var rid = parseIcsDate(val);
        if (rid) cur.recId = rid.date.getTime();
      } else if (prop === 'DTSTART') {
        var ps = parseIcsDate(val);
        if (ps) { cur.start = ps.date; if (ps.allDay) cur.allDay = true; }
      } else if (prop === 'DTEND') {
        var pe = parseIcsDate(val);
        if (pe) cur.end = pe.date;
      }
    }

    var now = new Date();
    var minDate = new Date(now.getTime() - 60 * DAY_MS);
    var maxDate = new Date(now.getTime() + 365 * DAY_MS);
    var expanded = [];

    // Einzeln geänderte Vorkommen einer Serie (RECURRENCE-ID) ersetzen das jeweilige Original.
    var overrides = {};
    rawEvents.forEach(function (e) {
      if (e.recId != null && e.uid) overrides[e.uid + '|' + e.recId] = true;
    });

    function push(e, start, end, yearlyInfo) {
      if (e.cancelled) return;
      if (end < minDate || start > maxDate) return;
      var ev = {
        id: 'gcal_' + Math.random().toString(36).substr(2, 9),
        title: e.title, start: start, end: end, allDay: !!e.allDay,
        loc: e.loc, notes: e.notes, people: assignPeople(e.title)
      };
      if (yearlyInfo) { ev.yearly = true; ev.origYear = yearlyInfo; }
      expanded.push(ev);
    }

    rawEvents.forEach(function (e) {
      if (!e.end) e.end = new Date(e.start.getTime() + (e.allDay ? DAY_MS : 3600000));
      var duration = e.end.getTime() - e.start.getTime();

      if (e.rrule && e.recId == null) {
        var isYearly = /FREQ=YEARLY/.test(e.rrule) && e.allDay;
        expandSeries(e, minDate, maxDate).forEach(function (d) {
          var ts = d.getTime();
          if (e.exdates.indexOf(ts) > -1) return;
          if (e.uid && overrides[e.uid + '|' + ts]) return;
          push(e, d, new Date(ts + duration), isYearly ? e.start.getFullYear() : 0);
        });
        return;
      }
      push(e, e.start, e.end, 0);
    });

    expanded.sort(function (a, b) { return a.start - b.start; });
    return expanded;
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
    setInterval(updateUsage, 5 * 60 * 1000);

    // Weather & Fuel refresh every 15 minutes
    setInterval(updateWeather, 15 * 60 * 1000);
    setInterval(updateFuel, 15 * 60 * 1000);
    // Calendar refresh every 5 minutes
    setInterval(updateCalendar, 5 * 60 * 1000);
    // Mobile R2 Photos refresh every 30 seconds
    setInterval(updatePhotos, 30 * 1000);

    if (window.App) {
      window.App.on('mode', function (m) {
        if (m === 'day') {
          // Morgens beim Aufwachen sofort alles frisch ziehen
          updateWeather();
          updateCalendar();
          updatePhotos();
          updateFuel();
          updateUsage();
        }
      });
    }
  }

  window.LiveSync = {
    updateWeather: updateWeather,
    updateCalendar: updateCalendar,
    updateFuel: updateFuel,
    updatePhotos: updatePhotos,
    updateUsage: updateUsage
  };
})();

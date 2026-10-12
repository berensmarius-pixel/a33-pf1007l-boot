// Live Sync: Kaiserslautern Weather + Google Calendar (Marius & Soraya)
(function () {
  'use strict';

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
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + KAISERSLAUTERN_LAT +
        '&longitude=' + KAISERSLAUTERN_LON +
        '&current=temperature_2m,weather_code' +
        '&hourly=temperature_2m,precipitation_probability,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&timezone=Europe%2FBerlin&forecast_days=2';

      var resp = await fetch(url);
      if (!resp.ok) return;
      var data = await resp.json();

      var D = window.DATA;
      if (!D || !D.weather) return;

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

  function parseIcs(icsText) {
    var unfolded = icsText.replace(/\r?\n[ \t]/g, '');
    var lines = unfolded.split(/\r?\n/);
    var rawEvents = [];
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === 'BEGIN:VEVENT') {
        cur = {};
        continue;
      }
      if (line === 'END:VEVENT') {
        if (cur && cur.title && cur.start) {
          rawEvents.push(cur);
        }
        cur = null;
        continue;
      }
      if (!cur) continue;

      var colon = line.indexOf(':');
      if (colon === -1) continue;
      var propFull = line.substr(0, colon);
      var val = line.substr(colon + 1);
      var prop = propFull.split(';')[0].toUpperCase();

      if (prop === 'SUMMARY') {
        cur.title = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
      } else if (prop === 'LOCATION') {
        cur.loc = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
      } else if (prop === 'DESCRIPTION') {
        cur.notes = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n').trim();
      } else if (prop === 'RRULE') {
        cur.rrule = val;
      } else if (prop === 'DTSTART') {
        var parsedStart = parseIcsDate(val);
        if (parsedStart) {
          cur.start = parsedStart.date;
          if (parsedStart.allDay) cur.allDay = true;
        }
      } else if (prop === 'DTEND') {
        var parsedEnd = parseIcsDate(val);
        if (parsedEnd) {
          cur.end = parsedEnd.date;
        }
      }
    }

    var now = new Date();
    var currentYear = now.getFullYear();
    var minDate = new Date(now.getTime() - 60 * 86400000); // 60 days past
    var maxDate = new Date(now.getTime() + 365 * 86400000); // 365 days future

    var expanded = [];

    rawEvents.forEach(function (e) {
      if (!e.end) {
        e.end = new Date(e.start.getTime() + (e.allDay ? 86400000 : 3600000));
      }
      var duration = e.end.getTime() - e.start.getTime();

      // Expand yearly recurring events (birthdays, anniversaries)
      if (e.rrule && e.rrule.indexOf('FREQ=YEARLY') > -1) {
        [-1, 0, 1, 2].forEach(function (yearOffset) {
          var y = currentYear + yearOffset;
          var newStart = new Date(e.start);
          newStart.setFullYear(y);
          var newEnd = new Date(newStart.getTime() + duration);
          if (newEnd >= minDate && newStart <= maxDate) {
            expanded.push({
              id: 'gcal_y_' + Math.random().toString(36).substr(2, 9),
              title: e.title,
              start: newStart,
              end: newEnd,
              allDay: e.allDay,
              loc: e.loc,
              notes: e.notes,
              people: assignPeople(e.title)
            });
          }
        });
        return;
      }

      // Regular single events
      if (e.end >= minDate && e.start <= maxDate) {
        e.id = 'gcal_' + Math.random().toString(36).substr(2, 9);
        e.people = assignPeople(e.title);
        expanded.push(e);
      }
    });

    expanded.sort(function (a, b) {
      return a.start - b.start;
    });

    return expanded;
  }

  async function updateCalendar() {
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
      if (parsed.length > 0) {
        window.DATA.events = parsed;
        if (window.App) {
          window.App.emit('data');
          window.App.rerender();
        }
        console.log('[LiveSync] Loaded ' + parsed.length + ' real Google Calendar events for Marius & Soraya');
      }
    } catch (err) {
      console.warn('[LiveSync] Calendar fetch failed:', err);
    }
  }

  // ------------------------------------------------------------ Fuel Price Sync (Kaiserslautern)
  async function updateFuel() {
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
    try {
      var resp = await fetch('/api/photos');
      if (!resp.ok) return;
      var data = await resp.json();
      if (data && data.ok && Array.isArray(data.photos) && window.DATA) {
        var added = 0;
        data.photos.forEach(function (p) {
          if (!knownPhotoIds.has(p.id)) {
            knownPhotoIds.add(p.id);
            var exists = window.DATA.photos.some(function (x) { return x.id === p.id || x.url === p.url; });
            if (!exists) {
              window.DATA.photos.unshift({
                id: p.id,
                url: p.url,
                o: 'l',
                date: p.date || new Date().toISOString().split('T')[0],
                place: p.title || 'Marius & Soraya',
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
  }

  window.LiveSync = {
    updateWeather: updateWeather,
    updateCalendar: updateCalendar,
    updateFuel: updateFuel,
    updatePhotos: updatePhotos,
    updateUsage: updateUsage
  };
})();

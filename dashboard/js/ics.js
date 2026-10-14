// Kalender-Parser (iCal/ICS): Termine, Serien (täglich/wöchentlich/monatlich/jährlich), Ausnahmen, Änderungen.
// Reine Funktionen ohne Browser-Bezug, damit sie sich testen lassen (npm test).
// parseIcs(text, jetzt?) -> Liste von Terminen im Fenster [-60 Tage, +365 Tage].
// ------------------------------------------------------------ iCal / ICS Parser
export function parseIcsDate(str) {
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

export function assignPeople(title) {
  var lower = (title || '').toLowerCase();
  var marius = lower.indexOf('marius') > -1;
  var soraya = lower.indexOf('soraya') > -1 || lower.indexOf('schatz') > -1;
  if (marius && soraya) return ['marius', 'soraya'];
  if (soraya) return ['soraya'];
  return ['marius'];
}

var DAY_MS = 86400000;
var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unescapeText(v) {
  // RFC 5545: \\ \; \, bleiben als Zeichen erhalten, \n ist ein Zeilenumbruch (im Titel ein Leerzeichen)
  return v.replace(/\\([\\;,nN])/g, function (m, c) { return c === 'n' || c === 'N' ? ' ' : c; }).trim();
}

export function parseRrule(str) {
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
export function expandSeries(e, from, to) {
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

export function parseIcs(icsText, nowOverride) {
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
    else if (prop === 'DESCRIPTION') cur.notes = val.replace(/\\([\\;,])/g, '$1').replace(/\\[nN]/g, '\n').trim();
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

  var now = nowOverride || new Date();
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

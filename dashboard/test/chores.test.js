// Tests für die Aufgaben-Regeln (js/chore-days.js) und die Wetterwarnungen (js/alerts.js).
process.env.TZ = 'Europe/Berlin';

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDue, dayLabel, dateStr, inflateChores } from '../js/chore-days.js';
import { computeAlerts } from '../js/alerts.js';

const MI = new Date(2026, 9, 14);     // Mittwoch
const SO = new Date(2026, 9, 18);     // Sonntag

test('ohne Tage oder alle sieben: jeden Tag fällig', () => {
  assert.equal(isDue({}, MI), true);
  assert.equal(isDue({ days: [] }, SO), true);
  assert.equal(isDue({ days: [1, 2, 3, 4, 5, 6, 0] }, MI), true);
});

test('Wochentage: Sonntag ist 0', () => {
  const muell = { days: [2] };            // Dienstag
  assert.equal(isDue(muell, MI), false);
  assert.equal(isDue(muell, new Date(2026, 9, 13)), true);
  assert.equal(isDue({ days: [0] }, SO), true);
  assert.equal(isDue({ days: [0] }, MI), false);
});

test('Beschriftung der Tage in Wochenreihenfolge', () => {
  assert.equal(dayLabel({ days: [0, 2, 5] }), 'Di · Fr · So');
  assert.equal(dayLabel({ days: [] }), '');
  assert.equal(dayLabel({}), '');
});

test('erledigt gilt nur am selben Tag', () => {
  const items = [
    { id: 'a', doneOn: '2026-10-14', doneBy: 'marius' },
    { id: 'b', doneOn: '2026-10-13', doneBy: 'soraya' },
    { id: 'c', doneOn: null }
  ];
  inflateChores(items, '2026-10-14');
  assert.deepEqual(items.map((i) => i.done), [true, false, false]);
  assert.equal(items[0].doneBy, 'marius');
  assert.equal('doneBy' in items[1], false, 'Erledigt-von von gestern wird gelöscht');
});

test('Datum als YYYY-MM-DD', () => {
  assert.equal(dateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dateStr(new Date(2026, 11, 31)), '2026-12-31');
});

// ------------------------------------------------------------ Wetterwarnungen
function forecast(fn) {
  const time = [], t = [], p = [], code = [], gust = [];
  for (let i = 0; i < 48; i++) {
    const v = Object.assign({ t: 12, p: 0, code: 1, gust: 10 }, fn(i));
    time.push(i); t.push(v.t); p.push(v.p); code.push(v.code); gust.push(v.gust);
  }
  return { hourly: { time, temperature_2m: t, precipitation_probability: p, weather_code: code, wind_gusts_10m: gust } };
}

test('ruhiges Wetter: keine Warnung', () => {
  assert.deepEqual(computeAlerts(forecast(() => ({})), 10), []);
});

test('Frost in der Nacht wird gemeldet', () => {
  const a = computeAlerts(forecast((i) => (i >= 22 && i <= 30 ? { t: -2 } : {})), 18);
  assert.ok(a.some((x) => /Frost/.test(x.title)), JSON.stringify(a));
});

test('Gewitter und Sturm sind Alarm-Stufe', () => {
  const a = computeAlerts(forecast((i) => (i === 15 ? { code: 95, gust: 75 } : {})), 12);
  assert.ok(a.some((x) => /Gewitter/.test(x.title) && x.level === 'alert'));
  assert.ok(a.some((x) => /Sturm/.test(x.title) && x.level === 'alert'));
});

test('Regen in den nächsten Stunden', () => {
  const a = computeAlerts(forecast((i) => (i === 14 ? { p: 80, code: 61 } : {})), 12);
  const rain = a.find((x) => /Regen/.test(x.title));
  assert.ok(rain);
  assert.match(rain.title, /14 Uhr/);
});

test('Regen später als 8 Stunden zählt noch nicht', () => {
  const a = computeAlerts(forecast((i) => (i === 25 ? { p: 90, code: 61 } : {})), 12);
  assert.equal(a.some((x) => /Regen/.test(x.title)), false);
});

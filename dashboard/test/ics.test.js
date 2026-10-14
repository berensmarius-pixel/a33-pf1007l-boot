// Tests für den Kalender-Parser (js/ics.js). Aufruf: npm test
process.env.TZ = 'Europe/Berlin';   // vor dem ersten Date setzen: Sommer-/Winterzeit wie auf dem Tablet

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, parseIcsDate, assignPeople } from '../js/ics.js';

const NOW = new Date(2026, 9, 14, 12, 0, 0);   // Mi 14.10.2026, 12:00

function ics(...events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
}
const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
  ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const starts = (list) => list.map((e) => fmt(e.start));

test('einzelner Termin mit TZID', () => {
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261015T090000', 'DTEND;TZID=Europe/Berlin:20261015T100000',
    'SUMMARY:Zahnarzt', 'LOCATION:Praxis\\, Innenstadt'
  ]), NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Zahnarzt');
  assert.equal(r[0].loc, 'Praxis, Innenstadt');
  assert.equal(fmt(r[0].start), '2026-10-15 09:00');
  assert.equal(fmt(r[0].end), '2026-10-15 10:00');
  assert.equal(r[0].allDay, false);
});

test('UTC-Zeit wird in Ortszeit umgerechnet', () => {
  const r = parseIcs(ics(['DTSTART:20261015T070000Z', 'DTEND:20261015T080000Z', 'SUMMARY:UTC']), NOW);
  assert.equal(fmt(r[0].start), '2026-10-15 09:00');   // Sommerzeit: UTC+2
});

test('wöchentlich Mo-Fr bis UNTIL (wie "Capgemini")', () => {
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261013T090000', 'DTEND;TZID=Europe/Berlin:20261013T170000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261018T215959Z;BYDAY=FR,MO,TH,TU,WE', 'SUMMARY:Capgemini'
  ]), NOW);
  assert.deepEqual(starts(r), ['2026-10-13 09:00', '2026-10-14 09:00', '2026-10-15 09:00', '2026-10-16 09:00']);
  assert.equal(fmt(r[0].end), '2026-10-13 17:00');
});

test('INTERVAL=2: nur jede zweite Woche', () => {
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261012T180000', 'DTEND;TZID=Europe/Berlin:20261012T190000',
    'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=4', 'SUMMARY:Sport'
  ]), NOW);
  assert.deepEqual(starts(r), ['2026-10-12 18:00', '2026-10-26 18:00', '2026-11-09 18:00', '2026-11-23 18:00']);
});

test('COUNT begrenzt die Serie', () => {
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261014T080000', 'DTEND;TZID=Europe/Berlin:20261014T083000',
    'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Kurz'
  ]), NOW);
  assert.deepEqual(starts(r), ['2026-10-14 08:00', '2026-10-15 08:00', '2026-10-16 08:00']);
});

test('EXDATE entfernt ein Vorkommen', () => {
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261012T090000', 'DTEND;TZID=Europe/Berlin:20261012T100000',
    'RRULE:FREQ=DAILY;COUNT=4', 'EXDATE;TZID=Europe/Berlin:20261013T090000', 'SUMMARY:Daily'
  ]), NOW);
  assert.deepEqual(starts(r), ['2026-10-12 09:00', '2026-10-14 09:00', '2026-10-15 09:00']);
});

test('RECURRENCE-ID ersetzt genau ein Vorkommen (verschoben)', () => {
  const r = parseIcs(ics(
    ['UID:abc', 'DTSTART;TZID=Europe/Berlin:20261012T090000', 'DTEND;TZID=Europe/Berlin:20261012T100000', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Daily'],
    ['UID:abc', 'RECURRENCE-ID;TZID=Europe/Berlin:20261013T090000', 'DTSTART;TZID=Europe/Berlin:20261013T140000', 'DTEND;TZID=Europe/Berlin:20261013T150000', 'SUMMARY:Daily (verschoben)']
  ), NOW);
  assert.deepEqual(starts(r), ['2026-10-12 09:00', '2026-10-13 14:00', '2026-10-14 09:00']);
  assert.equal(r[1].title, 'Daily (verschoben)');
});

test('Sommer-/Winterzeit: Serie bleibt auf 09:00 Wanduhrzeit', () => {
  // Umstellung auf Winterzeit: Sonntag 25.10.2026
  const r = parseIcs(ics([
    'DTSTART;TZID=Europe/Berlin:20261023T090000', 'DTEND;TZID=Europe/Berlin:20261023T100000',
    'RRULE:FREQ=DAILY;COUNT=4', 'SUMMARY:Morgens'
  ]), NOW);
  assert.deepEqual(starts(r), ['2026-10-23 09:00', '2026-10-24 09:00', '2026-10-25 09:00', '2026-10-26 09:00']);
});

test('Geburtstag: ganztägig, jährlich, mit Geburtsjahr', () => {
  const r = parseIcs(ics([
    'DTSTART;VALUE=DATE:19900301', 'DTEND;VALUE=DATE:19900302', 'RRULE:FREQ=YEARLY', 'SUMMARY:Geburtstag Mama'
  ]), NOW);
  const next = r.find((e) => e.start >= NOW);
  assert.ok(next, 'nächster Geburtstag im Fenster');
  assert.equal(fmt(next.start), '2027-03-01 00:00');
  assert.equal(next.allDay, true);
  assert.equal(next.yearly, true);
  assert.equal(next.origYear, 1990);
});

test('abgesagte Termine werden ausgelassen', () => {
  const r = parseIcs(ics(['DTSTART:20261015T070000Z', 'DTEND:20261015T080000Z', 'STATUS:CANCELLED', 'SUMMARY:Abgesagt']), NOW);
  assert.equal(r.length, 0);
});

test('Fenster: zu alte und zu ferne Termine fallen weg', () => {
  const r = parseIcs(ics(
    ['DTSTART:20250101T100000Z', 'DTEND:20250101T110000Z', 'SUMMARY:Uralt'],
    ['DTSTART:20291231T100000Z', 'DTEND:20291231T110000Z', 'SUMMARY:Sehr fern'],
    ['DTSTART:20261020T100000Z', 'DTEND:20261020T110000Z', 'SUMMARY:Passt']
  ), NOW);
  assert.deepEqual(r.map((e) => e.title), ['Passt']);
});

test('Alarme (VALARM) stören die Felder nicht', () => {
  const r = parseIcs(ics([
    'DTSTART:20261015T070000Z', 'DTEND:20261015T080000Z', 'SUMMARY:Mit Alarm',
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'DESCRIPTION:Erinnerung', 'END:VALARM'
  ]), NOW);
  assert.equal(r[0].title, 'Mit Alarm');
  assert.equal(r[0].notes, undefined);
});

test('gefaltete Zeilen und Escapes', () => {
  const text = ics(['DTSTART:20261015T070000Z', 'DTEND:20261015T080000Z', 'SUMMARY:Ein sehr langer', ' Titel\\; mit Semikolon']);
  const r = parseIcs(text, NOW);
  assert.equal(r[0].title, 'Ein sehr langerTitel; mit Semikolon');
});

test('Personen aus dem Titel', () => {
  assert.deepEqual(assignPeople('Arzt Soraya'), ['soraya']);
  assert.deepEqual(assignPeople('Essen Marius und Soraya'), ['marius', 'soraya']);
  assert.deepEqual(assignPeople('Capgemini'), ['marius']);
});

test('Datumsformate', () => {
  assert.equal(parseIcsDate('20261015').allDay, true);
  assert.equal(parseIcsDate('20261015T090000').allDay, false);
  assert.equal(parseIcsDate(''), null);
});

test('#countdown im Titel markiert den Termin und verschwindet aus dem Titel', () => {
  const r = parseIcs(ics(
    ['DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261208', 'SUMMARY:Italien #Countdown'],
    ['DTSTART;VALUE=DATE:20261203', 'DTEND;VALUE=DATE:20261204', 'SUMMARY:Normal']
  ), NOW);
  const it = r.find((e) => e.title === 'Italien');
  assert.ok(it, 'Titel ohne Marker');
  assert.equal(it.countdown, true);
  assert.equal(r.find((e) => e.title === 'Normal').countdown, undefined);
});

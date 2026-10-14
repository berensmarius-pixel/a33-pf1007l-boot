// Tests für den EXIF-Leser (public/exif.js) und den Zugangsschutz des Workers (access.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gate, isAuthorized } from '../access.js';

// exif.js ist ein Browser-Skript (kein Modul): mit einem nachgebauten "module" laden
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const m = { exports: {} };
new Function('module', readFileSync(here('../public/exif.js'), 'utf8'))(m);
const parseExif = m.exports;

// ------------------------------------------------------------ Testbilder bauen
function tiff(little) {
  const w16 = (n) => { const b = Buffer.alloc(2); little ? b.writeUInt16LE(n) : b.writeUInt16BE(n); return b; };
  const w32 = (n) => { const b = Buffer.alloc(4); little ? b.writeUInt32LE(n) : b.writeUInt32BE(n); return b; };
  const entry = (tag, type, count, val) => Buffer.concat([w16(tag), w16(type), w32(count), val]);
  const rat = (a, b) => Buffer.concat([w32(a), w32(b)]);
  const hdr = Buffer.concat([Buffer.from(little ? 'II' : 'MM'), w16(42), w32(8)]);
  const ifd0Len = 2 + 2 * 12 + 4, exifOff = 8 + ifd0Len, exifLen = 2 + 12 + 4, gpsOff = exifOff + exifLen, gpsLen = 2 + 4 * 12 + 4, dataOff = gpsOff + gpsLen;
  const dt = Buffer.from('2026:10:11 14:30:05\0');
  const latOff = dataOff + dt.length, lonOff = latOff + 24;
  const ifd0 = Buffer.concat([w16(2), entry(0x8769, 4, 1, w32(exifOff)), entry(0x8825, 4, 1, w32(gpsOff)), w32(0)]);
  const exif = Buffer.concat([w16(1), entry(0x9003, 2, dt.length, w32(dataOff)), w32(0)]);
  const gps = Buffer.concat([w16(4),
    entry(1, 2, 2, Buffer.from('N\0\0\0')), entry(2, 5, 3, w32(latOff)),
    entry(3, 2, 2, Buffer.from('E\0\0\0')), entry(4, 5, 3, w32(lonOff)), w32(0)]);
  const lat = Buffer.concat([rat(48, 1), rat(34, 1), rat(1500, 100)]);     // 48°34'15" N
  const lon = Buffer.concat([rat(13, 1), rat(27, 1), rat(3000, 100)]);     // 13°27'30" E
  return Buffer.concat([hdr, ifd0, exif, gps, dt, lat, lon]);
}
function jpeg(little) {
  const t = tiff(little), len = t.length + 8;
  return Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255]), Buffer.from('Exif\0\0'), t, Buffer.from([0xFF, 0xD9])]);
}
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);

test('JPEG (little endian): Datum und GPS', () => {
  const r = parseExif(ab(jpeg(true)));
  assert.equal(r.taken, '2026-10-11T14:30:05');
  assert.ok(Math.abs(r.lat - 48.5708) < 0.001);
  assert.ok(Math.abs(r.lon - 13.4583) < 0.001);
});

test('JPEG (big endian): Datum und GPS', () => {
  const r = parseExif(ab(jpeg(false)));
  assert.equal(r.taken, '2026-10-11T14:30:05');
  assert.ok(Math.abs(r.lat - 48.5708) < 0.001);
});

test('HEIC: Exif-Block mitten in der Datei', () => {
  const heic = Buffer.concat([Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heic'), Buffer.alloc(300, 7), Buffer.from('Exif\0\0'), tiff(false), Buffer.alloc(100, 9)]);
  const r = parseExif(ab(heic));
  assert.equal(r.taken, '2026-10-11T14:30:05');
  assert.ok(r.lat > 48 && r.lat < 49);
});

test('kaputte oder leere Daten: leeres Ergebnis, kein Fehler', () => {
  assert.deepEqual(parseExif(new ArrayBuffer(10)), {});
  assert.deepEqual(parseExif(ab(Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10, 0x45]))), {});
  assert.deepEqual(parseExif(ab(Buffer.alloc(50, 1))), {});
});

// ------------------------------------------------------------ Zugangsschutz
const KEY = 'geheimer-schluessel';
const env = { ACCESS_KEY: KEY };
const req = (path, init = {}) => {
  const url = new URL('https://dash.example' + path);
  return [new Request(url, init), url];
};

test('ohne ACCESS_KEY ist alles offen', () => {
  const [r, u] = req('/api/calendar');
  assert.equal(gate(r, u, {}), null);
});

test('Seite ohne Cookie: 401 mit Sperrseite', async () => {
  const [r, u] = req('/');
  const res = gate(r, u, env);
  assert.equal(res.status, 401);
  assert.match(await res.text(), /Gesperrt/);
});

test('API ohne Cookie: 401 als JSON', async () => {
  const [r, u] = req('/api/list/chores');
  const res = gate(r, u, env);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /json/);
});

test('?k= mit richtigem Schlüssel: Cookie setzen und ohne Schlüssel weiterleiten', () => {
  const [r, u] = req('/liste?tab=1&k=' + KEY);
  const res = gate(r, u, env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/liste?tab=1');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, new RegExp('hk=' + KEY));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=31536000/);
});

test('?k= mit falschem Schlüssel: gesperrt', () => {
  const [r, u] = req('/?k=falsch');
  assert.equal(gate(r, u, env).status, 401);
});

test('richtiges Cookie: durchgelassen, falsches: gesperrt', () => {
  const [ok, uok] = req('/api/photos', { headers: { Cookie: 'x=1; hk=' + KEY } });
  assert.equal(gate(ok, uok, env), null);
  const [bad, ubad] = req('/api/photos', { headers: { Cookie: 'hk=anders' } });
  assert.equal(gate(bad, ubad, env).status, 401);
});

test('Ausnahmen: Symbole, Manifest und PC-Upload (nur POST)', () => {
  for (const p of ['/manifest.webmanifest', '/icon-192.png']) {
    const [r, u] = req(p);
    assert.equal(gate(r, u, env), null, p);
  }
  const [post, upost] = req('/api/usage', { method: 'POST' });
  assert.equal(gate(post, upost, env), null);
  const [get, uget] = req('/api/usage');
  assert.equal(gate(get, uget, env).status, 401, 'GET /api/usage bleibt gesperrt');
});

test('PIN für Schreibzugriff', () => {
  const withPin = (pin) => new Request('https://dash.example/api/upload', { headers: pin ? { 'X-Pin': pin } : {} });
  assert.equal(isAuthorized(withPin(''), {}), true, 'ohne gesetzte PIN offen');
  assert.equal(isAuthorized(withPin('4260'), { UPLOAD_PIN: '4260' }), true);
  assert.equal(isAuthorized(withPin('1111'), { UPLOAD_PIN: '4260' }), false);
  assert.equal(isAuthorized(withPin(''), { UPLOAD_PIN: '4260' }), false);
});

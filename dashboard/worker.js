import listeHtml from './liste.html';
import uploadHtml from './upload.html';
import { json, isAuthorized, safeEqual, readCookie, gate } from './access.js';

const LIST_NAMES = ['groceries', 'chores', 'meals', 'recipes'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif']; // HEIC kann das Tablet nicht anzeigen

// In-Memory-Caches im Worker-Isolate zur drastischen Reduzierung der Cloudflare KV Free-Tier Zugriffe
// (Cloudflare Free Limit: 1.000 Lists / 1.000 Writes / 100.000 Reads pro Tag)
// ---------------------------------------------------------------- Google-Terminfarben (Dienstkonto, nur lesen)
// Der private iCal-Feed enthält keine Farben. Die Calendar-API liefert pro Termin eine colorId.
const GCAL_ID = 'berensmarius@gmail.com';
const GCAL_COLORS = { 1: '#a4bdfc', 2: '#7ae7bf', 3: '#dbadff', 4: '#ff887c', 5: '#fbd75b', 6: '#ffb878', 7: '#46d6db', 8: '#e1e1e1', 9: '#5484ed', 10: '#51b749', 11: '#dc2127' };
const gcalState = { token: null, tokenExp: 0, colors: null, ts: 0 };

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function gcalToken(env) {
  if (gcalState.token && Date.now() < gcalState.tokenExp) return gcalState.token;
  const key = JSON.parse(env.GOOGLE_SA_KEY);
  const pem = key.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(unsigned));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(sig)
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token ' + (j.error || r.status));
  gcalState.token = j.access_token;
  gcalState.tokenExp = Date.now() + 50 * 60 * 1000;
  return gcalState.token;
}

// -> { "<iCalUID>": "#hex", "<iCalUID>|<Startzeit-ms>": "#hex" } nur für Termine mit eigener Farbe
async function gcalColors(env) {
  const token = await gcalToken(env);
  const min = new Date(Date.now() - 60 * 864e5).toISOString(), max = new Date(Date.now() + 365 * 864e5).toISOString();
  const out = {};
  let page = '', guard = 0;
  do {
    const u = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(GCAL_ID) + '/events?singleEvents=false&showDeleted=false&maxResults=2500&timeMin=' + min + '&timeMax=' + max +
      '&fields=nextPageToken,items(iCalUID,colorId,status,originalStartTime)' + (page ? '&pageToken=' + page : '');
    const r = await fetch(u, { headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('events ' + r.status);
    const j = await r.json();
    (j.items || []).forEach((e) => {
      const hex = GCAL_COLORS[e.colorId];
      if (!hex || !e.iCalUID || e.status === 'cancelled') return;
      const o = e.originalStartTime && e.originalStartTime.dateTime;
      out[e.iCalUID + (o ? '|' + new Date(o).getTime() : '')] = hex;
    });
    page = j.nextPageToken || '';
  } while (page && ++guard < 5);
  return out;
}

const memoryCache = {
  photos: { data: null, ts: 0 },
  lists: new Map(), // name -> { doc, ts }
  calendar: { text: null, hash: 0, ts: 0 },
  usage: { text: null, ts: 0 },
  geo: new Map(),
  geminiKey: null,
  livetrack: { session: null, ts: 0, cookie: '', csrfToken: '', cookieTs: 0 }
};

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Ortsname zu Koordinaten (OpenStreetMap Nominatim). Es werden nur auf ~1 km gerundete Werte gesendet,
// gesucht wird nur der Stadtname; das Ergebnis wird in KV zwischengespeichert.
async function placeName(lat, lon, env) {
  const la = Number(lat), lo = Number(lon);
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return '';
  const rl = la.toFixed(2), ro = lo.toFixed(2);
  const cacheKey = 'geo_' + rl + '_' + ro;
  if (memoryCache.geo.has(cacheKey)) return memoryCache.geo.get(cacheKey);
  if (env.PHOTOS_KV) {
    const hit = await env.PHOTOS_KV.get(cacheKey);
    if (hit !== null) {
      memoryCache.geo.set(cacheKey, hit);
      return hit;
    }
  }
  try {
    const resp = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=de&lat=' + rl + '&lon=' + ro, {
      headers: { 'User-Agent': 'HomeHQ-PhotoFrame/1.0 (private family dashboard)' },
      signal: AbortSignal.timeout(4000)
    });
    if (!resp.ok) return '';
    const a = (await resp.json()).address || {};
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
    const country = a.country_code && a.country_code !== 'de' ? a.country : '';
    const name = [city, country].filter(Boolean).join(', ');
    memoryCache.geo.set(cacheKey, name);
    if (env.PHOTOS_KV && name) await env.PHOTOS_KV.put(cacheKey, name, { expirationTtl: 60 * 60 * 24 * 365 });
    return name;
  } catch (e) {
    return '';
  }
}

// Garmin LiveTrack Cookie & CSRF-Token Helper
async function getGarminCookie(session, env) {
  const now = Date.now();
  if (memoryCache.livetrack.cookie && (now - (memoryCache.livetrack.cookieTs || 0) < 60 * 60 * 1000)) {
    return { cookie: memoryCache.livetrack.cookie, csrfToken: memoryCache.livetrack.csrfToken };
  }
  if (session && session.cookie && session.csrfToken && (now - (session.cookieTs || 0) < 60 * 60 * 1000)) {
    memoryCache.livetrack.cookie = session.cookie;
    memoryCache.livetrack.csrfToken = session.csrfToken;
    memoryCache.livetrack.cookieTs = session.cookieTs || now;
    return { cookie: session.cookie, csrfToken: session.csrfToken };
  }
  if (!session || !session.url) return { cookie: '', csrfToken: '' };

  try {
    const resp = await fetch(session.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    const setCookie = resp.headers.get('set-cookie') || '';
    const cookieMatch = setCookie.match(/livetrack_csrf=[^;]+/);
    const cookie = cookieMatch ? cookieMatch[0] : '';
    const html = await resp.text();
    const csrfMatch = html.match(/name="csrf-token" content="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    if (cookie) {
      memoryCache.livetrack.cookie = cookie;
      memoryCache.livetrack.csrfToken = csrfToken;
      memoryCache.livetrack.cookieTs = now;
      session.cookie = cookie;
      session.csrfToken = csrfToken;
      session.cookieTs = now;
      if (env.PHOTOS_KV) {
        await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(session), { expirationTtl: 4 * 60 * 60 });
      }
    }
    return { cookie, csrfToken, html };
  } catch (e) {
    return { cookie: '', csrfToken: '' };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const blocked = gate(request, url, env);
    if (blocked) return blocked;

    // ------------------------------------------------------------
    // 1. Google Calendar Proxy
    // ------------------------------------------------------------
    if (url.pathname === '/api/calendar-colors') {
      const hdr = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
      if (!env.GOOGLE_SA_KEY) return new Response(JSON.stringify({ ok: false, error: 'Kein Google-Schlüssel gesetzt' }), { status: 200, headers: hdr });
      if (gcalState.colors && Date.now() - gcalState.ts < 5 * 60 * 1000) {
        return new Response(JSON.stringify({ ok: true, colors: gcalState.colors }), { headers: hdr });
      }
      try {
        gcalState.colors = await gcalColors(env);
        gcalState.ts = Date.now();
        if (env.PHOTOS_KV) await env.PHOTOS_KV.put('gcal_colors', JSON.stringify(gcalState.colors));
        return new Response(JSON.stringify({ ok: true, colors: gcalState.colors }), { headers: hdr });
      } catch (err) {
        // Bei Google-Fehlern den letzten guten Stand liefern
        const old = gcalState.colors || (env.PHOTOS_KV ? JSON.parse((await env.PHOTOS_KV.get('gcal_colors')) || 'null') : null);
        return new Response(JSON.stringify({ ok: !!old, stale: true, colors: old || {}, error: String(err.message || err) }), { headers: hdr });
      }
    }

    if (url.pathname === '/api/calendar') {
      const icsUrl = env.CALENDAR_URL;
      if (!icsUrl) {
        return new Response(JSON.stringify({ error: 'No calendar URL configured' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const icsHeaders = {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      };

      const now = Date.now();
      // Wenn der Kalender im Arbeitsspeicher jünger als 4 Minuten ist, sofort ausliefern (0 Upstream, 0 KV)
      if (memoryCache.calendar.text && (now - memoryCache.calendar.ts < 4 * 60 * 1000)) {
        return new Response(memoryCache.calendar.text, { headers: icsHeaders });
      }

      // Bei Google-Fehlern den letzten guten Stand aus Speicher oder KV liefern
      const stale = async (reason) => {
        if (memoryCache.calendar.text) {
          return new Response(memoryCache.calendar.text, { headers: { ...icsHeaders, 'X-Stale': reason, 'Cache-Control': 'no-cache' } });
        }
        const cached = env.PHOTOS_KV ? await env.PHOTOS_KV.get('calendar_cache') : null;
        if (cached) {
          memoryCache.calendar.text = cached;
          memoryCache.calendar.hash = simpleHash(cached);
          memoryCache.calendar.ts = now;
          return new Response(cached, { headers: { ...icsHeaders, 'X-Stale': reason, 'Cache-Control': 'no-cache' } });
        }
        return json({ error: reason }, 502, { 'Access-Control-Allow-Origin': '*' });
      };

      try {
        const resp = await fetch(icsUrl, {
          headers: { 'User-Agent': 'HomeHQ-Calendar-Fetcher/1.0' },
          cf: { cacheTtlByStatus: { '200-299': 300, '400-599': 0 } }
        });
        if (!resp.ok) return stale(`Upstream HTTP ${resp.status}`);

        const icsText = await resp.text();
        if (!icsText.includes('BEGIN:VCALENDAR')) return stale('Ungültige Kalenderantwort');

        const newHash = simpleHash(icsText);
        // KV Write NUR dann ausführen, wenn sich der Kalenderinhalt tatsächlich geändert hat!
        // Spart ~280 unnötige KV-Schreibvorgänge pro Tag!
        if (env.PHOTOS_KV && newHash !== memoryCache.calendar.hash) {
          await env.PHOTOS_KV.put('calendar_cache', icsText);
        }
        memoryCache.calendar.text = icsText;
        memoryCache.calendar.hash = newHash;
        memoryCache.calendar.ts = now;

        return new Response(icsText, { headers: icsHeaders });
      } catch (err) {
        return stale(err.message);
      }
    }

    // ------------------------------------------------------------
    // 2. Spritpreis-Monitor (Kaiserslautern)
    // ------------------------------------------------------------
    if (url.pathname === '/api/fuel') {
      const apiKey = env.TANKERKOENIG_KEY;
      const fuelType = ['e5', 'e10', 'diesel'].includes((url.searchParams.get('type') || '').toLowerCase()) ? url.searchParams.get('type').toLowerCase() : 'e5';
      const lat = env.HOME_LAT || '49.4447';
      const lng = env.HOME_LNG || '7.7690';

      if (apiKey && apiKey.length > 5) {
        try {
          const tUrl = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=5&sort=price&type=${fuelType}&apikey=${apiKey}`;
          const resp = await fetch(tUrl, { cf: { cacheTtlByStatus: { '200-299': 600, '400-599': 0 } } });
          if (resp.ok) {
            const data = await resp.json();
            if (data.ok && Array.isArray(data.stations)) {
              const openStations = data.stations.filter(s => s.isOpen && typeof s.price === 'number');
              const sorted = openStations.sort((a, b) => a.price - b.price);
              const best = sorted[0];

              // Trend: Tagesbestpreis der letzten 30 Tage in KV, verglichen mit dem Schnitt der Vortage
              let trend = 'normal';
              let trendText = 'Durchschnittlicher Preis';
              let avg = null;
              if (best) {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
                const histKey = 'fuel_hist_' + fuelType;
                let hist = [];
                if (env.PHOTOS_KV) {
                  try { hist = (await env.PHOTOS_KV.get(histKey, { type: 'json' })) || []; } catch (e) { hist = []; }
                }
                const prev = hist.filter((h) => h.d !== today);
                if (prev.length >= 3) {
                  avg = prev.reduce((sum, h) => sum + h.min, 0) / prev.length;
                  if (best.price <= avg - 0.03) { trend = 'cheap'; trendText = 'Günstiger als sonst · Jetzt tanken!'; }
                  else if (best.price >= avg + 0.03) { trend = 'high'; trendText = 'Teurer als sonst · Wenn möglich warten'; }
                } else {
                  trendText = 'Sammle Preisverlauf (' + prev.length + ' von 3 Tagen)';
                }
                // heutigen Bestpreis nur schreiben, wenn er sich ändert (spart KV-Schreibzugriffe)
                const todayEntry = hist.find((h) => h.d === today);
                if (env.PHOTOS_KV && (!todayEntry || best.price < todayEntry.min)) {
                  const next = hist.filter((h) => h.d !== today).concat([{ d: today, min: best.price }]).slice(-30);
                  try { await env.PHOTOS_KV.put(histKey, JSON.stringify(next)); } catch (e) { /* Verlauf ist optional */ }
                }
              }

              return new Response(JSON.stringify({
                ok: true,
                live: true,
                fuelType: fuelType,
                cheapest: best ? {
                  name: best.brand || best.name,
                  station: best.name,
                  street: best.street + (best.houseNumber ? ' ' + best.houseNumber : ''),
                  dist: Math.round(best.dist * 10) / 10,
                  price: best.price,
                  isOpen: best.isOpen
                } : null,
                trend: trend,
                trendText: trendText,
                avg: avg === null ? null : Math.round(avg * 1000) / 1000,
                stations: sorted.slice(0, 5).map(s => ({
                  name: s.brand || s.name,
                  street: s.street,
                  dist: Math.round(s.dist * 10) / 10,
                  price: s.price
                }))
              }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' }
              });
            }
          }
        } catch (e) {
          console.warn('Tankerkoenig fetch failed, falling back:', e);
        }
      }

      // Keine Preise verfügbar (Key fehlt oder Tankerkönig nicht erreichbar): ehrlich melden, nichts erfinden
      return json({ ok: false, live: false, error: apiKey ? 'Tankerkönig nicht erreichbar' : 'Kein API-Key gesetzt' }, 503, { 'Cache-Control': 'no-store' });
    }

    // ------------------------------------------------------------
    // 3. Foto-Upload API & Storage (KV / R2)
    // ------------------------------------------------------------
    if (url.pathname === '/api/version') {
      return json({ ok: true, version: '2026-10-15-01-15' }, 200, {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
    }

    if (url.pathname === '/liste' || url.pathname === '/liste.html') {
      return new Response(listeHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }

    if (url.pathname === '/upload') {
      return new Response(uploadHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // API: Foto hochladen
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      if (!isAuthorized(request, env)) return json({ error: 'PIN falsch oder fehlt' }, 401);
      try {
        const kv = env.PHOTOS_KV;
        if (!kv && !env.PHOTOS_BUCKET) {
          return new Response(JSON.stringify({ error: 'Kein Foto-Speicher (KV/R2) konfiguriert' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const formData = await request.formData();
        const file = formData.get('photo');
        const who = formData.get('who') || 'marius';
        const title = String(formData.get('title') || '').slice(0, 80);
        const takenRaw = String(formData.get('taken') || '');
        const taken = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(takenRaw) ? takenRaw : '';
        const lat = formData.get('lat'), lon = formData.get('lon');
        const place = lat !== null && lon !== null ? await placeName(lat, lon, env) : '';

        if (!file || typeof file === 'string') {
          return new Response(JSON.stringify({ error: 'Keine Bilddatei übermittelt' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'Foto ist größer als 10 MB' }, 413);
        const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
        if (!ALLOWED_EXT.includes(ext)) return json({ error: 'Dateityp nicht erlaubt' }, 400);
        const id = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const key = `img_${id}.${ext}`;
        const buffer = await file.arrayBuffer();

        if (kv) {
          await kv.put(key, buffer, {
            metadata: {
              who: String(who),
              title: String(title),
              taken: taken,
              place: place,
              uploadedAt: new Date().toISOString(),
              contentType: file.type || 'image/jpeg'
            }
          });
        } else if (env.PHOTOS_BUCKET) {
          await env.PHOTOS_BUCKET.put(key, buffer, {
            httpMetadata: { contentType: file.type || 'image/jpeg', cacheControl: 'public, max-age=31536000' },
            customMetadata: { who: String(who), title: String(title), taken: taken, place: place, uploadedAt: new Date().toISOString() }
          });
        }
        memoryCache.photos.data = null;
        memoryCache.photos.ts = 0;

        return new Response(JSON.stringify({
          ok: true,
          id: key,
          url: `/api/photos/${key}`,
          who: who,
          title: title,
          taken: taken,
          place: place
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // API: Fotos auflisten
    if (url.pathname === '/api/photos' && request.method === 'GET') {
      try {
        const now = Date.now();
        // In-Memory-Cache: Wenn Fotos jünger als 3 Minuten sind, sofort ausliefern.
        // Verhindert das Aufbrauchen des täglichen 1.000er kv.list() Limits!
        if (memoryCache.photos.data && (now - memoryCache.photos.ts < 3 * 60 * 1000)) {
          return new Response(JSON.stringify({ ok: true, photos: memoryCache.photos.data }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=120, stale-while-revalidate=300'
            }
          });
        }

        const kv = env.PHOTOS_KV;
        const photos = [];
        if (kv) {
          const list = await kv.list({ prefix: 'img_' });
          for (const item of list.keys) {
            const meta = item.metadata || {};
            photos.push({
              id: item.name,
              url: `/api/photos/${item.name}`,
              who: meta.who || 'marius',
              title: meta.title || '',
              taken: meta.taken || '',
              place: meta.place || '',
              date: meta.taken ? meta.taken.slice(0, 10) : (meta.uploadedAt ? meta.uploadedAt.split('T')[0] : ''),
              uploadedAt: meta.uploadedAt || ''
            });
          }
        } else if (env.PHOTOS_BUCKET) {
          const list = await env.PHOTOS_BUCKET.list({ limit: 100 });
          for (const obj of list.objects) {
            if (obj.key.startsWith('img_')) {
              const meta = obj.customMetadata || {};
              photos.push({
                id: obj.key,
                url: `/api/photos/${obj.key}`,
                who: meta.who || 'marius',
                title: meta.title || '',
                taken: meta.taken || '',
                place: meta.place || '',
                date: meta.taken ? meta.taken.slice(0, 10) : (meta.uploadedAt ? meta.uploadedAt.split('T')[0] : ''),
                uploadedAt: meta.uploadedAt || obj.uploaded
              });
            }
          }
        }

        photos.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
        memoryCache.photos.data = photos;
        memoryCache.photos.ts = now;

        return new Response(JSON.stringify({ ok: true, photos }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=120, stale-while-revalidate=300'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message, photos: [] }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // API: Einzelnes Foto ausliefern oder löschen
    if (url.pathname.startsWith('/api/photos/')) {
      const key = url.pathname.replace('/api/photos/', '');
      const kv = env.PHOTOS_KV;

      if (request.method === 'DELETE') {
        if (!isAuthorized(request, env)) return json({ error: 'PIN falsch oder fehlt' }, 401);
        if (kv) await kv.delete(key);
        else if (env.PHOTOS_BUCKET) await env.PHOTOS_BUCKET.delete(key);
        memoryCache.photos.data = null;
        memoryCache.photos.ts = 0;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if (kv) {
        const { value, metadata } = await kv.getWithMetadata(key, { type: 'arrayBuffer' });
        if (!value) return new Response('Foto nicht gefunden', { status: 404 });
        return new Response(value, {
          headers: {
            'Content-Type': (metadata && metadata.contentType) || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      if (env.PHOTOS_BUCKET) {
        const object = await env.PHOTOS_BUCKET.get(key);
        if (!object) return new Response('Foto nicht gefunden', { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(object.body, { headers });
      }

      return new Response('Storage not found', { status: 404 });
    }

    // ------------------------------------------------------------
    // 4. KI-Nutzung (wird von scripts/push-usage.js geliefert)
    // ------------------------------------------------------------
    if (url.pathname === '/api/usage') {
      if (!env.PHOTOS_KV) return json({ ok: false, error: 'KV fehlt' }, 500);
      if (request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        if (!env.USAGE_TOKEN || auth !== 'Bearer ' + env.USAGE_TOKEN) return json({ error: 'Nicht erlaubt' }, 401);
        const body = await request.text();
        if (body.length > 20000) return json({ error: 'Zu groß' }, 413);
        try { JSON.parse(body); } catch (e) { return json({ error: 'Kein JSON' }, 400); }
        memoryCache.usage.text = body;
        memoryCache.usage.ts = Date.now();
        await env.PHOTOS_KV.put('usage', body);
        return json({ ok: true });
      }
      const now = Date.now();
      if (memoryCache.usage.text && (now - memoryCache.usage.ts < 60 * 1000)) {
        return new Response(memoryCache.usage.text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } });
      }
      const raw = await env.PHOTOS_KV.get('usage');
      memoryCache.usage.text = raw || '{}';
      memoryCache.usage.ts = now;
      return new Response(raw || '{}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } });
    }

    // ------------------------------------------------------------
    // 5. Geteilte Listen (Einkaufsliste, Aufgaben) in KV
    //    POST { upsert: [item…], remove: [id…] } → Antwort ist die komplette Liste
    // ------------------------------------------------------------
    if (url.pathname.startsWith('/api/list/')) {
      const name = url.pathname.slice('/api/list/'.length);
      if (!LIST_NAMES.includes(name)) return json({ error: 'Unbekannte Liste' }, 404);
      if (!env.PHOTOS_KV) return json({ error: 'KV fehlt' }, 500);
      const key = 'list_' + name;
      const now = Date.now();

      const load = async () => {
        const cached = memoryCache.lists.get(name);
        // 30 Sekunden In-Memory-Cache: Spart zehntausende KV-Reads pro Tag!
        if (cached && (now - cached.ts < 30 * 1000)) {
          return cached.doc;
        }
        const doc = (await env.PHOTOS_KV.get(key, { type: 'json' })) || { rev: 0, items: [] };
        memoryCache.lists.set(name, { doc, ts: now });
        return doc;
      };

      if (request.method === 'GET') {
        const doc = await load();
        const ifNoneMatch = request.headers.get('If-None-Match');
        const etag = `"rev-${doc.rev || 0}"`;
        if (ifNoneMatch && ifNoneMatch === etag) {
          return new Response(null, {
            status: 304,
            headers: { 'ETag': etag, 'Cache-Control': 'private, max-age=10, stale-while-revalidate=20' }
          });
        }
        return new Response(JSON.stringify(doc), {
          headers: {
            'Content-Type': 'application/json',
            'ETag': etag,
            'Cache-Control': 'private, max-age=10, stale-while-revalidate=20'
          }
        });
      }
      if (request.method === 'POST') {
        if (!isAuthorized(request, env)) return json({ error: 'PIN falsch oder fehlt' }, 401);
        let op;
        try {
          const text = await request.text();
          if (text.length > 100000) return json({ error: 'Zu groß' }, 413);
          op = JSON.parse(text);
        } catch (e) { return json({ error: 'Kein JSON' }, 400); }

        const doc = await load();
        const byId = new Map(doc.items.map((i) => [i.id, i]));
        for (const id of Array.isArray(op.remove) ? op.remove : []) byId.delete(String(id));
        for (const item of Array.isArray(op.upsert) ? op.upsert : []) {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 40) continue;
          if (JSON.stringify(item).length > 1000) continue;
          byId.set(item.id, item);
        }
        if (byId.size > 500) return json({ error: 'Liste zu lang' }, 413);
        const next = { rev: (doc.rev || 0) + 1, items: [...byId.values()] };
        memoryCache.lists.set(name, { doc: next, ts: Date.now() });
        await env.PHOTOS_KV.put(key, JSON.stringify(next));
        return json(next, 200, { 'ETag': `"rev-${next.rev}"`, 'Cache-Control': 'no-store' });
      }
      return json({ error: 'Methode nicht erlaubt' }, 405);
    }

    // ------------------------------------------------------------
    // 6. Google Gemini AI Rezepte & Einstellungen
    // ------------------------------------------------------------
    if (url.pathname === '/api/settings/gemini') {
      const storedKey = memoryCache.geminiKey || (env.PHOTOS_KV ? await env.PHOTOS_KV.get('gemini_api_key') : null) || env.GEMINI_API_KEY || '';
      memoryCache.geminiKey = storedKey;
      if (request.method === 'GET') {
        return json({ ok: true, hasKey: Boolean(storedKey && storedKey.trim()) });
      }
      if (request.method === 'POST') {
        if (!isAuthorized(request, env)) return json({ error: 'PIN falsch oder fehlt' }, 401);
        let b = {};
        try { b = await request.json(); } catch (e) {}
        const k = String(b.key || '').trim();
        memoryCache.geminiKey = k;
        if (env.PHOTOS_KV) {
          if (k) await env.PHOTOS_KV.put('gemini_api_key', k);
          else await env.PHOTOS_KV.delete('gemini_api_key');
        }
        return json({ ok: true, hasKey: Boolean(k) });
      }
      return json({ error: 'Methode nicht erlaubt' }, 405);
    }

    if (url.pathname === '/api/recipes/ai' && request.method === 'POST') {
      let b = {};
      try { b = await request.json(); } catch (e) {}
      const userPrompt = String(b.prompt || '').trim();
      const cat = String(b.category || 'all');
      const apiKey = b.apiKey || memoryCache.geminiKey || (env.PHOTOS_KV ? await env.PHOTOS_KV.get('gemini_api_key') : null) || env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key') || '';
      if (apiKey) memoryCache.geminiKey = apiKey;

      if (!apiKey || !apiKey.trim()) {
        return json({ ok: false, error: 'Kein Google AI Studio API-Key hinterlegt. Trage ihn in den Einstellungen ein oder setze GEMINI_API_KEY.' }, 400);
      }

      const systemInstruction = 'Du bist ein erfahrener Koch und Ernährungsberater, spezialisiert auf schnelle, alltagstaugliche High-Protein-Gerichte (mindestens 35-50g Protein pro Portion, wenig Fett, minimale Vorbereitung, minimaler Abwasch).\n' +
        'Geräte-Schwerpunkte: Heißluftfritteuse (Airfryer), Reiskocher One-Pots, Backofen-Blechgerichte (Sheet Pan) oder schnelle Pfannengerichte (10-15 Min).\n' +
        'Antworte IMMER im folgenden JSON-Format ohne Markdown-Codeblock:\n' +
        '{\n' +
        '  "title": "Appetitlicher, prägnanter Name",\n' +
        '  "category": "airfryer" | "ricecooker" | "oven" | "pan",\n' +
        '  "badge": "Airfryer" | "Reiskocher" | "Backofen" | "Schnell",\n' +
        '  "time": 15,\n' +
        '  "protein": 45,\n' +
        '  "calories": 480,\n' +
        '  "description": "1 kurzer, motivierender Satz zum Gericht",\n' +
        '  "ingredients": ["300g Hähnchenbrust", "150g Reis", "..."],\n' +
        '  "steps": ["Schritt 1", "Schritt 2", "Schritt 3"]\n' +
        '}';

      const promptText = 'Erstelle ein schnelles, leckeres High-Protein-Rezept auf Deutsch für folgende Anfrage: "' + (userPrompt || 'Ein kreatives, schnelles High-Protein-Alltagsgericht') + '". Bevorzugte Zubereitung: ' + cat + '.';

      const models = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
      let aiResult = null;
      let lastErr = null;

      const recipeSchema = {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string' },
          badge: { type: 'string' },
          time: { type: 'integer' },
          protein: { type: 'integer' },
          calories: { type: 'integer' },
          description: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'category', 'badge', 'time', 'protein', 'calories', 'description', 'ingredients', 'steps']
      };

      for (const mName of models) {
        // 1. Primär: Moderne Gemini Interactions API (v1beta / response_format)
        try {
          const iUrl = 'https://generativelanguage.googleapis.com/v1beta/interactions?key=' + encodeURIComponent(apiKey.trim());
          const iResp = await fetch(iUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Api-Revision': '2026-05-20'
            },
            body: JSON.stringify({
              model: mName,
              input: promptText,
              system_instruction: systemInstruction,
              response_format: {
                type: 'text',
                mime_type: 'application/json',
                schema: recipeSchema
              }
            })
          });

          if (iResp.ok) {
            const iData = await iResp.json();
            let text = '';
            if (Array.isArray(iData.steps)) {
              for (const st of iData.steps) {
                if (st.type === 'model_output' && Array.isArray(st.content)) {
                  for (const c of st.content) {
                    if (c.type === 'text' && c.text) text += c.text;
                  }
                }
              }
            } else if (Array.isArray(iData.outputs)) {
              for (const o of iData.outputs) {
                if (o.text) text += o.text;
              }
            }
            if (text) {
              const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
              aiResult = JSON.parse(cleaned);
              break;
            }
          }
        } catch (e) {
          lastErr = e.message;
        }

        // 2. Sekundär / Fallback: Standard generateContent API
        if (!aiResult) {
          try {
            const gUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + mName + ':generateContent?key=' + encodeURIComponent(apiKey.trim());
            const gResp = await fetch(gUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: systemInstruction + '\n\n' + promptText }] }],
                generationConfig: { responseMimeType: 'application/json' }
              })
            });

            if (gResp.ok) {
              const gData = await gResp.json();
              const rawText = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                aiResult = JSON.parse(cleaned);
                break;
              }
            } else {
              const errBody = await gResp.json().catch(() => ({}));
              lastErr = errBody?.error?.message || ('HTTP ' + gResp.status);
            }
          } catch (e) {
            lastErr = e.message;
          }
        }

        if (aiResult) break;
      }

      if (!aiResult) {
        return json({ ok: false, error: 'Gemini-Generierung fehlgeschlagen: ' + (lastErr || 'Keine Antwort') }, 502);
      }

      return json({ ok: true, recipe: aiResult });
    }

    // ------------------------------------------------------------
    // 7. Garmin LiveTrack Ingest & Proxy
    // ------------------------------------------------------------
    if (url.pathname === '/api/livetrack') {
      const now = Date.now();

      // Status abfragen
      if (request.method === 'GET') {
        let session = memoryCache.livetrack.session;
        if ((!session || (now - (memoryCache.livetrack.ts || 0) > 10 * 1000)) && env.PHOTOS_KV) {
          session = await env.PHOTOS_KV.get('garmin_livetrack', { type: 'json' });
          memoryCache.livetrack.session = session;
          memoryCache.livetrack.ts = now;
        }

        // Auto-Expire nach 4 Stunden
        if (session && session.active && session.startedAt && (now - session.startedAt > 4 * 60 * 60 * 1000)) {
          session.active = false;
          memoryCache.livetrack.session = session;
          memoryCache.livetrack.ts = now;
          if (env.PHOTOS_KV) await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(session));
        }

        let lastWebhook = memoryCache.livetrack.lastWebhook;
        if ((!lastWebhook || (now - (memoryCache.livetrack.tsWebhook || 0) > 10 * 1000)) && env.PHOTOS_KV) {
          lastWebhook = await env.PHOTOS_KV.get('last_livetrack_webhook', { type: 'json' });
          if (lastWebhook) {
            memoryCache.livetrack.lastWebhook = lastWebhook;
            memoryCache.livetrack.tsWebhook = now;
          }
        }

        const ua = request.headers.get('User-Agent') || '';
        memoryCache.livetrack.lastPoll = { time: new Date().toISOString(), ua: ua.slice(0, 100) };

        return json({
          ok: true,
          active: Boolean(session && session.active),
          session: session || null,
          lastWebhook: lastWebhook || null,
          lastPoll: memoryCache.livetrack.lastPoll,
          serverTime: new Date().toISOString()
        }, 200, { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      }

      // LiveTrack Session manuell beenden
      if (request.method === 'DELETE' || (request.method === 'POST' && url.searchParams.get('action') === 'stop')) {
        const session = { active: false, stoppedAt: now };
        memoryCache.livetrack.session = session;
        memoryCache.livetrack.ts = now;
        if (env.PHOTOS_KV) await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(session));
        return json({ ok: true, active: false });
      }

      // LiveTrack Webhook / E-Mail Ingest (oder Demo-Modus)
      if (request.method === 'POST') {
        let raw = '';
        try {
          raw = await request.text();
        } catch (e) {}

        const webhookDebug = {
          time: new Date().toISOString(),
          len: raw.length,
          snippet: raw.slice(0, 300)
        };
        memoryCache.livetrack.lastWebhook = webhookDebug;
        if (env.PHOTOS_KV) {
          await env.PHOTOS_KV.put('last_livetrack_webhook', JSON.stringify(webhookDebug), { expirationTtl: 24 * 3600 });
        }

        // Demo / Testmodus
        if (url.searchParams.get('test') === '1' && (!raw || raw === '{}')) {
          const testSession = {
            active: true,
            url: 'https://livetrack.garmin.com',
            sessionId: 'demo-session',
            token: 'demo-token',
            startedAt: now,
            updatedAt: now,
            title: 'Marius auf dem Rad 🚴 (Demo)'
          };
          memoryCache.livetrack.session = testSession;
          memoryCache.livetrack.ts = now;
          if (env.PHOTOS_KV) await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(testSession), { expirationTtl: 2 * 60 * 60 });
          return json({ ok: true, active: true, session: testSession }, 200, { 'Access-Control-Allow-Origin': '*' });
        }

        // Unterstützt JSON { url, body, html, text, ... } oder Raw Text / E-Mail
        let candidate = raw;
        try {
          const parsed = JSON.parse(raw);
          candidate = parsed.url || parsed.html || parsed.text || parsed.body || parsed.plain || raw;
        } catch (e) {}

        let trackUrl = '';
        let sessionId = '';
        let token = '';

        // 1. Suche nach gar.mn Kurzlink (z. B. https://gar.mn/zZdOe4P9NO)
        const shortMatch = String(candidate).match(/https:\/\/gar\.mn\/([a-zA-Z0-9_-]+)/i);
        if (shortMatch) {
          try {
            const headResp = await fetch(shortMatch[0], {
              method: 'HEAD',
              redirect: 'manual',
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const loc = headResp.headers.get('Location');
            if (loc && loc.includes('livetrack.garmin.com')) {
              trackUrl = loc;
            } else {
              const getResp = await fetch(shortMatch[0], { redirect: 'follow' });
              if (getResp.url && getResp.url.includes('livetrack.garmin.com')) {
                trackUrl = getResp.url;
              }
            }
          } catch (e) {}
        }

        // 2. Suche nach direktem livetrack.garmin.com Link
        if (!trackUrl) {
          const directMatch = String(candidate).match(/https:\/\/livetrack\.garmin\.com\/(?:session\/([a-zA-Z0-9-]+)\/token\/([a-zA-Z0-9_-]+)|sessionToken\/([a-zA-Z0-9_-]+)|[^\s"'<>]+)/i);
          if (directMatch) {
            trackUrl = directMatch[0];
          }
        }

        if (trackUrl) {
          const subMatch = trackUrl.match(/\/session\/([a-zA-Z0-9-]+)\/token\/([a-zA-Z0-9_-]+)/i);
          if (subMatch) {
            sessionId = subMatch[1] || '';
            token = subMatch[2] || '';
          }
        }

        if (!trackUrl) {
          return json({ ok: false, error: 'Kein gültiger Garmin LiveTrack Link im Payload gefunden.' }, 400);
        }

        const session = {
          active: true,
          url: trackUrl,
          sessionId: sessionId,
          token: token,
          startedAt: now,
          updatedAt: now,
          title: 'Marius auf dem Rad 🚴'
        };

        // Sofort Cookie & CSRF-Token für diese Session vorab abrufen und cachen
        await getGarminCookie(session, env);

        memoryCache.livetrack.session = session;
        memoryCache.livetrack.ts = now;
        if (env.PHOTOS_KV) {
          await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(session), { expirationTtl: 4 * 60 * 60 });
        }

        return json({ ok: true, active: true, session }, 200, { 'Access-Control-Allow-Origin': '*' });
      }

      return json({ error: 'Methode nicht erlaubt' }, 405);
    }

    // ------------------------------------------------------------
    // 8. Garmin LiveTrack Same-Origin Reverse Proxy
    //    Löst das "Sitzung ist privat"-Problem (Third-Party-Cookie Blocking):
    //    Alle Next.js Chunks, Pages und APIs werden über die eigene Domain ausgeliefert.
    // ------------------------------------------------------------

    // Garmin LiveTrack Session Page: /session/:sessionId/token/:token
    if (url.pathname.startsWith('/session/')) {
      let session = memoryCache.livetrack.session;
      if (!session && env.PHOTOS_KV) {
        session = await env.PHOTOS_KV.get('garmin_livetrack', { type: 'json' });
      }
      const gUrl = `https://livetrack.garmin.com${url.pathname}${url.search}`;
      try {
        const resp = await fetch(gUrl, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const setCookie = resp.headers.get('set-cookie') || '';
        const cookieMatch = setCookie.match(/livetrack_csrf=[^;]+/);
        const cookie = cookieMatch ? cookieMatch[0] : (session ? session.cookie : '');
        let html = await resp.text();
        const csrfMatch = html.match(/name="csrf-token" content="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        if (cookie && session) {
          memoryCache.livetrack.cookie = cookie;
          memoryCache.livetrack.csrfToken = csrfToken;
          memoryCache.livetrack.cookieTs = Date.now();
          session.cookie = cookie;
          session.csrfToken = csrfToken;
          session.cookieTs = Date.now();
          if (env.PHOTOS_KV) {
            await env.PHOTOS_KV.put('garmin_livetrack', JSON.stringify(session), { expirationTtl: 4 * 60 * 60 });
          }
        }

        const headers = new Headers();
        headers.set('Content-Type', 'text/html; charset=utf-8');
        if (cookie) {
          headers.set('Set-Cookie', `${cookie}; Path=/; SameSite=Lax`);
        }
        return new Response(html, { status: resp.status, headers });
      } catch (err) {
        return new Response('Fehler beim Laden von Garmin LiveTrack: ' + err.message, { status: 502 });
      }
    }

    // Garmin Next.js statische Assets mit 24h Edge Caching
    if (url.pathname.startsWith('/_next/')) {
      const gUrl = `https://livetrack.garmin.com${url.pathname}${url.search}`;
      const resp = await fetch(gUrl, {
        cf: { cacheTtlByStatus: { '200-299': 86400, '400-599': 0 } }
      });
      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'public, max-age=86400, immutable');
      return new Response(resp.body, { status: resp.status, headers });
    }

    // Garmin LiveTrack Backend API Proxy (fügt Cookie und CSRF-Token serverseitig hinzu)
    const isGarminApi = url.pathname.startsWith('/api/sessions/') ||
      url.pathname.startsWith('/api/v1/sessions/') ||
      url.pathname.startsWith('/api/v2/sessions/') ||
      url.pathname.startsWith('/api/user/') ||
      url.pathname.startsWith('/api/v1/user/') ||
      url.pathname.startsWith('/api/v2/user/') ||
      url.pathname.startsWith('/api/device/') ||
      url.pathname.startsWith('/api/personal-url/') ||
      url.pathname.startsWith('/api/messages/');

    if (isGarminApi) {
      let session = memoryCache.livetrack.session;
      if (!session && env.PHOTOS_KV) {
        session = await env.PHOTOS_KV.get('garmin_livetrack', { type: 'json' });
      }
      const { cookie, csrfToken } = await getGarminCookie(session, env);
      const gUrl = `https://livetrack.garmin.com${url.pathname}${url.search}`;

      const fHeaders = new Headers();
      fHeaders.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      if (cookie) fHeaders.set('Cookie', cookie);
      const clientCsrf = request.headers.get('Livetrack-Csrf-Token');
      fHeaders.set('Livetrack-Csrf-Token', clientCsrf || csrfToken || '');
      const passCode = request.headers.get('X-Garmin-LiveTrack-Passcode');
      if (passCode) fHeaders.set('X-Garmin-LiveTrack-Passcode', passCode);
      const ct = request.headers.get('Content-Type');
      if (ct) fHeaders.set('Content-Type', ct);

      const fInit = {
        method: request.method,
        headers: fHeaders
      };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        fInit.body = await request.clone().arrayBuffer();
      }

      try {
        const resp = await fetch(gUrl, fInit);
        const headers = new Headers();
        headers.set('Content-Type', resp.headers.get('Content-Type') || 'application/json');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'no-cache');
        return new Response(resp.body, { status: resp.status, headers });
      } catch (err) {
        return json({ error: err.message }, 502, { 'Access-Control-Allow-Origin': '*' });
      }
    }

    // Garmin LiveTrack Iframe-Einstieg
    if (url.pathname === '/api/livetrack/view') {
      let session = memoryCache.livetrack.session;
      if (!session && env.PHOTOS_KV) {
        session = await env.PHOTOS_KV.get('garmin_livetrack', { type: 'json' });
      }
      if (session && session.active && session.sessionId && session.token) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/session/${session.sessionId}/token/${session.token}`
          }
        });
      }
      return new Response('<!doctype html><html><body style="font-family:sans-serif;background:#18181b;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h3>Keine aktive LiveTrack-Fahrt</h3><p style="color:#a1a1aa">Sobald Marius losfährt, erscheint hier die Live-Karte.</p></div></body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // ------------------------------------------------------------
    // Default: Frontend-Assets aus Vite dist
    // ------------------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};

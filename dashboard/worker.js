import listeHtml from './liste.html';
import uploadHtml from './upload.html';

const LIST_NAMES = ['groceries', 'chores', 'meals', 'recipes'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif']; // HEIC kann das Tablet nicht anzeigen

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

// Schreibzugriff (Upload/Löschen) nur mit PIN, sobald UPLOAD_PIN als Secret gesetzt ist.
function isAuthorized(request, env) {
  if (!env.UPLOAD_PIN) return true;
  return request.headers.get('X-Pin') === env.UPLOAD_PIN;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function readCookie(request, name) {
  const part = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
}

const LOCKED_HTML = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gesperrt</title>' +
  '<style>body{font-family:system-ui,sans-serif;background:#121214;color:#F4F4F6;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}p{color:#A0A0AB;max-width:320px}</style></head>' +
  '<body><div><h1>🔒 Gesperrt</h1><p>Diese Seite ist privat. Öffne sie über den persönlichen Link mit Schlüssel.</p></div></body></html>';

// Zugangsschutz: nur mit Cookie (oder einmaligem ?k=...) kommt man an Seite und Daten.
// Ausnahmen: Symbole/Manifest und der Nutzungs-Upload des PCs (hat ein eigenes Token).
function gate(request, url, env) {
  const key = env.ACCESS_KEY;
  if (!key) return null;
  const p = url.pathname;
  if (p === '/manifest.webmanifest' || /^\/icon-\d+\.png$/.test(p)) return null;
  if (p === '/api/usage' && request.method === 'POST') return null;

  const given = url.searchParams.get('k');
  if (given && safeEqual(given, key)) {
    url.searchParams.delete('k');
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + url.search,
        'Set-Cookie': 'hk=' + key + '; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
        'Cache-Control': 'no-store'
      }
    });
  }
  if (safeEqual(readCookie(request, 'hk'), key)) return null;

  if (p.startsWith('/api/')) return json({ error: 'Zugriff nur mit Schlüssel' }, 401, { 'Cache-Control': 'no-store' });
  return new Response(LOCKED_HTML, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// Ortsname zu Koordinaten (OpenStreetMap Nominatim). Es werden nur auf ~1 km gerundete Werte gesendet,
// gesucht wird nur der Stadtname; das Ergebnis wird in KV zwischengespeichert.
async function placeName(lat, lon, env) {
  const la = Number(lat), lo = Number(lon);
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return '';
  const rl = la.toFixed(2), ro = lo.toFixed(2);
  const cacheKey = 'geo_' + rl + '_' + ro;
  if (env.PHOTOS_KV) {
    const hit = await env.PHOTOS_KV.get(cacheKey);
    if (hit !== null) return hit;
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
    if (env.PHOTOS_KV && name) await env.PHOTOS_KV.put(cacheKey, name, { expirationTtl: 60 * 60 * 24 * 365 });
    return name;
  } catch (e) {
    return '';
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
      // Bei Google-Fehlern (z. B. 429 auf geteilten Cloudflare-IPs) den letzten guten Stand aus KV liefern.
      const stale = async (reason) => {
        const cached = env.PHOTOS_KV ? await env.PHOTOS_KV.get('calendar_cache') : null;
        if (cached) return new Response(cached, { headers: { ...icsHeaders, 'X-Stale': reason, 'Cache-Control': 'no-cache' } });
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
        if (env.PHOTOS_KV) await env.PHOTOS_KV.put('calendar_cache', icsText);
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

              let trend = 'normal';
              let trendText = 'Durchschnittlicher Preis';
              if (best) {
                const thresholdLow = fuelType === 'diesel' ? 1.58 : (fuelType === 'e10' ? 1.68 : 1.73);
                const thresholdHigh = fuelType === 'diesel' ? 1.69 : (fuelType === 'e10' ? 1.79 : 1.84);
                if (best.price <= thresholdLow) {
                  trend = 'cheap';
                  trendText = 'Günstiger Zeitpunkt · Jetzt tanken!';
                } else if (best.price >= thresholdHigh) {
                  trend = 'high';
                  trendText = 'Eher teuer · Wenn möglich warten';
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

      // Fallback / Demo-Modus für Kaiserslautern
      const baseE5 = 1.719;
      return new Response(JSON.stringify({
        ok: true,
        live: false,
        demo: true,
        fuelType: fuelType,
        cheapest: {
          name: 'JET',
          station: 'JET Tankstelle',
          street: 'Pariser Str. 123',
          dist: 1.4,
          price: baseE5,
          isOpen: true
        },
        trend: 'cheap',
        trendText: 'Günstiger Zeitpunkt · Jetzt tanken!',
        stations: [
          { name: 'JET', street: 'Pariser Str. 123', dist: 1.4, price: baseE5 },
          { name: 'ED', street: 'Mainzer Str. 104', dist: 2.1, price: baseE5 + 0.02 },
          { name: 'TotalEnergies', street: 'Donnersberger Str. 1', dist: 2.5, price: baseE5 + 0.04 },
          { name: 'Aral', street: 'Ludwigshafener Str. 8', dist: 3.2, price: baseE5 + 0.07 }
        ],
        hint: 'Kostenlosen API-Key auf creativecommons.tankerkoenig.de anfordern'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // ------------------------------------------------------------
    // 3. Foto-Upload API & Storage (KV / R2)
    // ------------------------------------------------------------
    if (url.pathname === '/liste') {
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

        return new Response(JSON.stringify({ ok: true, photos }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }
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
        await env.PHOTOS_KV.put('usage', body);
        return json({ ok: true });
      }
      const raw = await env.PHOTOS_KV.get('usage');
      return new Response(raw || '{}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } });
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
      const load = async () => (await env.PHOTOS_KV.get(key, { type: 'json' })) || { rev: 0, items: [] };

      if (request.method === 'GET') {
        return new Response(JSON.stringify(await load()), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
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
        const next = { rev: doc.rev + 1, items: [...byId.values()] };
        await env.PHOTOS_KV.put(key, JSON.stringify(next));
        return json(next, 200, { 'Cache-Control': 'no-store' });
      }
      return json({ error: 'Methode nicht erlaubt' }, 405);
    }

    // ------------------------------------------------------------
    // 6. Google Gemini AI Rezepte & Einstellungen
    // ------------------------------------------------------------
    if (url.pathname === '/api/settings/gemini') {
      const storedKey = (env.PHOTOS_KV ? await env.PHOTOS_KV.get('gemini_api_key') : null) || env.GEMINI_API_KEY || '';
      if (request.method === 'GET') {
        return json({ ok: true, hasKey: Boolean(storedKey && storedKey.trim()) });
      }
      if (request.method === 'POST') {
        if (!isAuthorized(request, env)) return json({ error: 'PIN falsch oder fehlt' }, 401);
        let b = {};
        try { b = await request.json(); } catch (e) {}
        const k = String(b.key || '').trim();
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
      const apiKey = b.apiKey || (env.PHOTOS_KV ? await env.PHOTOS_KV.get('gemini_api_key') : null) || env.GEMINI_API_KEY || request.headers.get('X-Gemini-Key') || '';

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
    // Default: Frontend-Assets aus Vite dist
    // ------------------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};

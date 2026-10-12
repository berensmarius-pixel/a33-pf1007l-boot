const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic'];

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

      try {
        const resp = await fetch(icsUrl, {
          headers: { 'User-Agent': 'HomeHQ-Calendar-Fetcher/1.0' },
          cf: { cacheTtl: 300 }
        });

        if (!resp.ok) {
          return new Response(JSON.stringify({ error: `Upstream HTTP ${resp.status}` }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const icsText = await resp.text();
        return new Response(icsText, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
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
          const resp = await fetch(tUrl, { cf: { cacheTtl: 600 } });
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
    if (url.pathname === '/upload') {
      return new Response(renderUploadHtml(), {
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
        const title = formData.get('title') || 'Schnappschuss';

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
              uploadedAt: new Date().toISOString(),
              contentType: file.type || 'image/jpeg'
            }
          });
        } else if (env.PHOTOS_BUCKET) {
          await env.PHOTOS_BUCKET.put(key, buffer, {
            httpMetadata: { contentType: file.type || 'image/jpeg', cacheControl: 'public, max-age=31536000' },
            customMetadata: { who: String(who), title: String(title), uploadedAt: new Date().toISOString() }
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          id: key,
          url: `/api/photos/${key}`,
          who: who,
          title: title
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
              title: meta.title || 'Foto',
              date: meta.uploadedAt ? meta.uploadedAt.split('T')[0] : 'Heute',
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
                title: meta.title || 'Foto',
                date: meta.uploadedAt ? meta.uploadedAt.split('T')[0] : 'Heute',
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
    // Default: Frontend-Assets aus Vite dist
    // ------------------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};

// ------------------------------------------------------------
// Mobile Upload Web App (HTML & Styling)
// ------------------------------------------------------------
function renderUploadHtml() {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Bilderrahmen Foto-Upload · Marius & Soraya</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #121214; color: #F4F4F6; min-height: 100vh; padding: 20px 16px; display: flex; flex-direction: column; align-items: center; }
    .wrap { width: 100%; max-width: 440px; }
    header { text-align: center; margin-bottom: 24px; padding-top: 10px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.02em; }
    p.sub { font-size: 14px; color: #A0A0AB; }
    .card { background: #1C1C21; border: 1px solid #2E2E38; border-radius: 20px; padding: 22px; margin-bottom: 20px; }
    .label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #8E8E9A; margin-bottom: 10px; display: block; }
    .who-group { display: flex; gap: 10px; margin-bottom: 18px; }
    .who-btn { flex: 1; padding: 12px; border-radius: 12px; border: 2px solid #2E2E38; background: #26262E; color: #E0E0E8; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; transition: all 0.2s; }
    .who-btn.active.marius { border-color: #3b82f6; background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .who-btn.active.soraya { border-color: #ec4899; background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .drop-zone { border: 2px dashed #3E3E4C; border-radius: 16px; padding: 30px 16px; text-align: center; cursor: pointer; background: #18181E; transition: border-color 0.2s; margin-bottom: 16px; position: relative; }
    .drop-zone.dragover { border-color: #3b82f6; background: rgba(59, 130, 246, 0.05); }
    .drop-zone svg { width: 44px; height: 44px; stroke: #8E8E9A; margin-bottom: 10px; }
    .drop-zone span { display: block; font-size: 15px; font-weight: 600; color: #E0E0E8; }
    .drop-zone small { display: block; font-size: 12px; color: #8E8E9A; margin-top: 4px; }
    input[type="file"] { display: none; }
    .preview-box { display: none; margin-bottom: 16px; border-radius: 14px; overflow: hidden; max-height: 240px; background: #000; position: relative; }
    .preview-box img { width: 100%; height: 240px; object-fit: contain; }
    .btn-remove { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); border: none; color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; }
    .input-text { width: 100%; padding: 13px 15px; border-radius: 12px; background: #26262E; border: 1px solid #3E3E4C; color: #fff; font-size: 15px; margin-bottom: 18px; outline: none; }
    .input-text:focus { border-color: #3b82f6; }
    .btn-submit { width: 100%; padding: 15px; border-radius: 14px; background: #2563eb; color: #fff; border: none; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-submit:active { transform: scale(0.99); }
    .gallery-title { font-size: 16px; font-weight: 700; margin: 24px 0 12px; display: flex; justify-content: space-between; align-items: center; }
    .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .g-thumb { aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: #26262E; position: relative; }
    .g-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .g-badge { position: absolute; bottom: 4px; left: 4px; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.7); color: #fff; font-weight: 600; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #22c55e; color: #000; padding: 12px 24px; border-radius: 30px; font-weight: 700; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>📸 Foto an Rahmen senden</h1>
      <p class="sub">Erscheint sofort in der Diashow in der Küche</p>
    </header>

    <div class="card">
      <span class="label">Wer lädt hoch?</span>
      <div class="who-group">
        <button class="who-btn marius active" data-who="marius">Marius</button>
        <button class="who-btn soraya" data-who="soraya">Soraya</button>
      </div>

      <div class="drop-zone" id="dropZone">
        <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
        <span>Foto auswählen oder aufnehmen</span>
        <small>Tippen für Galerie / Kamera</small>
        <input type="file" id="fileInput" accept="image/*">
      </div>

      <div class="preview-box" id="previewBox">
        <img id="previewImg" src="">
        <button class="btn-remove" id="btnRemove">✕</button>
      </div>

      <span class="label">Notiz oder Ort (optional)</span>
      <input type="text" class="input-text" id="noteInput" placeholder="z. B. Urlaub 2026, Pfälzerwald...">

      <button class="btn-submit" id="btnSubmit" disabled>Foto auf den Rahmen zaubern ✨</button>
    </div>

    <div class="gallery-title">
      <span>Bisherige Uploads</span>
      <small id="countText" style="color:#8E8E9A;"></small>
    </div>
    <div class="gallery-grid" id="galleryGrid"></div>
  </div>

  <div class="toast" id="toast">Foto erfolgreich hochgeladen! 🎉</div>

  <script>
    let selectedWho = 'marius';
    let selectedFile = null;

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const previewBox = document.getElementById('previewBox');
    const previewImg = document.getElementById('previewImg');
    const btnRemove = document.getElementById('btnRemove');
    const btnSubmit = document.getElementById('btnSubmit');
    const noteInput = document.getElementById('noteInput');
    const toast = document.getElementById('toast');
    const galleryGrid = document.getElementById('galleryGrid');
    const countText = document.getElementById('countText');

    document.querySelectorAll('.who-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.who-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedWho = btn.dataset.who;
      });
    });

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    });

    btnRemove.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      previewBox.style.display = 'none';
      dropZone.style.display = 'block';
      btnSubmit.disabled = true;
    });

    function handleFile(file) {
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewBox.style.display = 'block';
        dropZone.style.display = 'none';
        btnSubmit.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    btnSubmit.addEventListener('click', async () => {
      if (!selectedFile) return;
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Wird übertragen...';

      const fd = new FormData();
      fd.append('photo', selectedFile);
      fd.append('who', selectedWho);
      fd.append('title', noteInput.value.trim() || 'Schnappschuss');

      try {
        let pin = localStorage.getItem('upload_pin') || '';
        let resp = await fetch('/api/upload', { method: 'POST', body: fd, headers: { 'X-Pin': pin } });
        if (resp.status === 401) {
          pin = prompt('PIN für Foto-Upload:') || '';
          localStorage.setItem('upload_pin', pin);
          resp = await fetch('/api/upload', { method: 'POST', body: fd, headers: { 'X-Pin': pin } });
        }
        const res = await resp.json();
        if (res.ok) {
          showToast('Foto erfolgreich hochgeladen! 🎉');
          selectedFile = null;
          fileInput.value = '';
          noteInput.value = '';
          previewBox.style.display = 'none';
          dropZone.style.display = 'block';
          btnSubmit.innerText = 'Foto auf den Rahmen zaubern ✨';
          loadRecentPhotos();
        } else {
          alert('Fehler: ' + (res.error || 'Upload fehlgeschlagen'));
          btnSubmit.disabled = false;
          btnSubmit.innerText = 'Erneut versuchen';
        }
      } catch (err) {
        alert('Netzwerkfehler: ' + err.message);
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Erneut versuchen';
      }
    });

    function showToast(msg) {
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    async function loadRecentPhotos() {
      try {
        const resp = await fetch('/api/photos');
        const res = await resp.json();
        if (res.ok && res.photos) {
          countText.innerText = res.photos.length + ' Fotos';
          galleryGrid.innerHTML = res.photos.map(p => \`
            <div class="g-thumb">
              <img src="\${p.url}" loading="lazy">
              <span class="g-badge" style="color:\${p.who === 'soraya' ? '#f472b6' : '#60a5fa'}">\${p.who === 'soraya' ? 'S' : 'M'}</span>
            </div>
          \`).join('');
        }
      } catch (e) {}
    }

    loadRecentPhotos();
  </script>
</body>
</html>`;
}

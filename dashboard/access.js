// Zugangsschutz und Antwort-Helfer des Workers (ohne Cloudflare-spezifische Imports, damit testbar).
export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

// Schreibzugriff (Upload/Löschen) nur mit PIN, sobald UPLOAD_PIN als Secret gesetzt ist.
export function isAuthorized(request, env) {
  if (!env.UPLOAD_PIN) return true;
  return request.headers.get('X-Pin') === env.UPLOAD_PIN;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function readCookie(request, name) {
  const part = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
}

const LOCKED_HTML = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gesperrt</title>' +
  '<style>body{font-family:system-ui,sans-serif;background:#121214;color:#F4F4F6;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}p{color:#A0A0AB;max-width:320px}</style></head>' +
  '<body><div><h1>🔒 Gesperrt</h1><p>Diese Seite ist privat. Öffne sie über den persönlichen Link mit Schlüssel.</p></div></body></html>';

// Zugangsschutz: nur mit Cookie (oder einmaligem ?k=...) kommt man an Seite und Daten.
// Ausnahmen: Symbole/Manifest und der Nutzungs-Upload des PCs (hat ein eigenes Token).
export function gate(request, url, env) {
  const key = env.ACCESS_KEY;
  if (!key) return null;
  const p = url.pathname;
  if (p === '/manifest.webmanifest' || /^\/icon-\d+\.png$/.test(p)) return null;
  if (p === '/api/usage' && request.method === 'POST') return null;
  if (p.startsWith('/api/livetrack')) return null;
  if (p === '/api/version') return null;
  if (p.startsWith('/session/')) return null;
  if (p.startsWith('/_next/')) return null;
  if (p.startsWith('/api/sessions/') || p.startsWith('/api/v1/sessions/') || p.startsWith('/api/v2/sessions/')) return null;
  if (p.startsWith('/api/user/') || p.startsWith('/api/v1/user/') || p.startsWith('/api/v2/user/')) return null;
  if (p.startsWith('/api/device/')) return null;
  if (p.startsWith('/api/personal-url/')) return null;
  if (p.startsWith('/api/messages/')) return null;

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

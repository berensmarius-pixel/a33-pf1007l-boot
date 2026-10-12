// Liest die lokalen Claude-Code-Transkripte (~/.claude/projects) und schickt die echte
// Token-Nutzung an das Dashboard (POST /api/usage).
//
//   node scripts/push-usage.js                 # an DASHBOARD_URL senden
//   node scripts/push-usage.js --dry           # nur ausgeben
//
// Umgebungsvariablen:
//   DASHBOARD_URL   z. B. https://home-dashboard.<name>.workers.dev
//   USAGE_TOKEN     gleiches Secret wie im Worker
//   CLAUDE_5H_LIMIT_M / CLAUDE_WEEK_LIMIT_M   optional, Richtwerte in Mio. Tokens für die Prozent-Balken
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(os.homedir(), '.claude', 'projects');
const DAY = 86400000;
const now = Date.now();
const since = now - 8 * DAY;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl') && fs.statSync(p).mtimeMs >= since) out.push(p);
  }
  return out;
}

// Dedupe über message.id, weil gestreamte Antworten mehrfach im Log stehen (letzter Eintrag gewinnt).
const msgs = new Map();
for (const file of fs.existsSync(root) ? walk(root, []) : []) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    const m = o.message;
    if (!m || !m.usage || !o.timestamp) continue;
    const t = Date.parse(o.timestamp);
    if (!(t >= since)) continue;
    const u = m.usage;
    const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
    msgs.set(m.id || o.uuid, { t, tokens });
  }
}

const list = [...msgs.values()].sort((a, b) => a.t - b.t);
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const week = new Array(7).fill(0);
for (const m of list) {
  const idx = 6 - Math.floor((midnight.getTime() + DAY - 1 - m.t) / DAY);
  if (idx >= 0 && idx <= 6) week[idx] += m.tokens;
}

// 5-Stunden-Block wie bei Claude: beginnt mit der ersten Nachricht (auf volle Stunde gerundet).
let blockStart = null, blockTokens = 0;
for (const m of list) {
  if (blockStart === null || m.t >= blockStart + 5 * 3600000) {
    const d = new Date(m.t); d.setMinutes(0, 0, 0);
    blockStart = d.getTime(); blockTokens = 0;
  }
  blockTokens += m.tokens;
}
const blockActive = blockStart !== null && now < blockStart + 5 * 3600000;
const weekTotal = week.reduce((a, b) => a + b, 0);
const M = (n) => Math.round(n / 1e4) / 100; // Mio. Tokens, 2 Nachkommastellen

const limit5 = parseFloat(process.env.CLAUDE_5H_LIMIT_M) || 0;
const limitW = parseFloat(process.env.CLAUDE_WEEK_LIMIT_M) || 0;
const claude = {
  tokens: M(week[6]),
  week: week.map(M),
  session: blockActive ? { tokens: M(blockTokens), leftMin: Math.round((blockStart + 5 * 3600000 - now) / 60000) } : null,
  limits: { session: limit5, week: limitW },
  weekTotal: M(weekTotal)
};
const payload = { updatedAt: new Date().toISOString(), claude };

if (process.argv.includes('--dry') || !process.env.DASHBOARD_URL) {
  console.log(JSON.stringify(payload, null, 2));
  if (!process.argv.includes('--dry')) console.log('\n(DASHBOARD_URL nicht gesetzt - nichts gesendet)');
  process.exit(0);
}

fetch(process.env.DASHBOARD_URL.replace(/\/$/, '') + '/api/usage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.USAGE_TOKEN },
  body: JSON.stringify(payload)
}).then(async (r) => {
  console.log(r.status, await r.text());
  process.exit(r.ok ? 0 : 1);
}).catch((e) => { console.error(e.message); process.exit(1); });

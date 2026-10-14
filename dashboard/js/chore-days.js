// Regeln für wiederkehrende Aufgaben (reine Funktionen, testbar).
// Eine Aufgabe hat optional c.days = Liste von getDay()-Werten (0 = Sonntag). Leer oder alle sieben = jeden Tag.
// Erledigt gilt nur an dem Tag, an dem es abgehakt wurde (c.doneOn = 'YYYY-MM-DD').

export var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];           // Mo..So
export var DAY_SHORT = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 0: 'So' };

export function isDue(c, date) {
  if (!c.days || !c.days.length || c.days.length >= 7) return true;
  return c.days.indexOf(date.getDay()) > -1;
}

export function dayLabel(c) {
  if (!c.days || !c.days.length || c.days.length >= 7) return '';
  return DAY_ORDER.filter(function (d) { return c.days.indexOf(d) > -1; }).map(function (d) { return DAY_SHORT[d]; }).join(' · ');
}

export function dateStr(d) {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// done wird aus doneOn abgeleitet; ein neuer Tag setzt alles zurück.
export function inflateChores(items, today) {
  items.forEach(function (c) {
    c.done = c.doneOn === today;
    if (!c.done) delete c.doneBy;
  });
  return items;
}

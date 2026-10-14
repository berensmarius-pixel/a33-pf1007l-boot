// Tests für Pomodoro Lern-Timer (js/pomodoro.js)
process.env.TZ = 'Europe/Berlin';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPomodoroEngine } from '../js/pomodoro.js';

test('createPomodoroEngine initialisiert mit Standardwerten', () => {
  const engine = createPomodoroEngine();
  const state = engine.state();
  assert.equal(state.phase, 'idle');
  assert.equal(state.round, 1);
  assert.equal(state.totalRounds, 4);
  assert.equal(state.workSec, 25 * 60);
  assert.equal(state.breakSec, 5 * 60);
  assert.equal(state.longBreakSec, 15 * 60);
  assert.equal(state.topic, 'Lernen');
  assert.equal(state.isPaused, false);
});

test('startWork startet eine Lerneinheit mit Thema und Dauer', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.startWork({ durationMin: 45, topic: 'Klausurvorbereitung', now: t0 });
  const s = engine.state();
  assert.equal(s.phase, 'work');
  assert.equal(s.topic, 'Klausurvorbereitung');
  assert.equal(s.totalSec, 45 * 60);
  assert.equal(s.remSec, 45 * 60);
  assert.equal(s.endAt, t0 + 45 * 60 * 1000);
  assert.equal(engine.isActive(), true);
});

test('tick zählt Sekunden herunter', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.startWork({ durationMin: 25, now: t0 });
  
  // 10 Sekunden später
  const event = engine.tick(t0 + 10000);
  assert.equal(event, null);
  assert.equal(engine.state().remSec, 25 * 60 - 10);
});

test('pause und resume stoppen und setzen Timer fort', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.startWork({ durationMin: 25, now: t0 });

  // 100 Sekunden laufen lassen
  engine.tick(t0 + 100000);
  const remBeforePause = engine.state().remSec;

  // Pausieren
  engine.pause(t0 + 100000);
  assert.equal(engine.state().isPaused, true);

  // Während Pause vergehen 50 Sekunden
  engine.tick(t0 + 150000);
  assert.equal(engine.state().remSec, remBeforePause);

  // Fortsetzen
  engine.resume(t0 + 150000);
  assert.equal(engine.state().isPaused, false);

  // Weitere 10 Sekunden vergehen nach Resume
  engine.tick(t0 + 160000);
  assert.equal(engine.state().remSec, remBeforePause - 10);
});

test('addMinutes verlängert die verbleibende Zeit', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.startWork({ durationMin: 25, now: t0 });
  engine.addMinutes(5, t0);
  assert.equal(engine.state().remSec, 30 * 60);
  assert.equal(engine.state().totalSec, 30 * 60);
});

test('Lerneinheit abschließen erhöht Statistik und empfiehlt Pause', () => {
  let statsSaved = null;
  const mockStorage = {
    getItem: () => JSON.stringify({ date: '2026-10-14', count: 1, mins: 25 }),
    setItem: (k, v) => { statsSaved = JSON.parse(v); }
  };

  const engine = createPomodoroEngine({ storage: mockStorage, todayStr: '2026-10-14' });
  const t0 = 1000000;
  engine.startWork({ durationMin: 25, topic: 'Mathe', now: t0 });

  // Ablauf der Zeit simulieren
  const ev = engine.tick(t0 + 25 * 60 * 1000);
  assert.equal(ev.type, 'work-complete');
  assert.equal(ev.round, 1);
  assert.equal(ev.totalRounds, 4);
  assert.equal(ev.isLongBreak, false);
  assert.equal(ev.suggestedBreakMin, 5);

  // Stats geprüft
  assert.equal(engine.stats().count, 2);
  assert.equal(engine.stats().mins, 50);
  assert.equal(statsSaved.count, 2);
  assert.equal(statsSaved.mins, 50);
});

test('4. Lerneinheit empfiehlt lange Pause (15 Min)', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  // Auf Runde 4 setzen
  engine.setRound(4);
  engine.startWork({ durationMin: 25, now: t0 });

  const ev = engine.tick(t0 + 25 * 60 * 1000);
  assert.equal(ev.type, 'work-complete');
  assert.equal(ev.round, 4);
  assert.equal(ev.isLongBreak, true);
  assert.equal(ev.suggestedBreakMin, 15);
});

test('Pause abschließen wechselt zur nächsten Lerneinheit', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.setRound(1);
  engine.startBreak({ durationMin: 5, now: t0 });
  assert.equal(engine.state().phase, 'break');

  const ev = engine.tick(t0 + 5 * 60 * 1000);
  assert.equal(ev.type, 'break-complete');
  assert.equal(ev.nextRound, 2);
  assert.equal(engine.state().round, 2);
  assert.equal(engine.state().phase, 'idle');
});

test('Lange Pause nach 4 Runden setzt Rundenzähler auf 1 zurück', () => {
  const engine = createPomodoroEngine();
  const t0 = 1000000;
  engine.setRound(4);
  engine.startBreak({ durationMin: 15, isLong: true, now: t0 });
  assert.equal(engine.state().phase, 'longBreak');

  const ev = engine.tick(t0 + 15 * 60 * 1000);
  assert.equal(ev.type, 'break-complete');
  assert.equal(ev.nextRound, 1);
  assert.equal(engine.state().round, 1);
});

test('Neuer Tag setzt tägliche Zähler zurück', () => {
  const mockStorage = {
    getItem: () => JSON.stringify({ date: '2026-10-13', count: 5, mins: 125 }),
    setItem: () => {}
  };
  const engine = createPomodoroEngine({ storage: mockStorage, todayStr: '2026-10-14' });
  assert.equal(engine.stats().date, '2026-10-14');
  assert.equal(engine.stats().count, 0);
  assert.equal(engine.stats().mins, 0);
});

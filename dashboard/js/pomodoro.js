// Pomodoro Lern- & Fokus-Timer für Home HQ
// Bietet strukturierte Lerneinheiten (25m / 45m / 50m), Pausen (5m / 15m),
// Runden-Tracking (1 bis 4 Pomodoros), harmonische Gongs und Vollbild-Fokusmodus.

export function createPomodoroEngine(opts) {
  opts = opts || {};
  var storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  var getToday = function () {
    if (opts.todayStr) return opts.todayStr;
    var d = new Date();
    var y = d.getFullYear();
    var m = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    var day = (d.getDate() < 10 ? '0' : '') + d.getDate();
    return y + '-' + m + '-' + day;
  };

  var defaultWorkMin = opts.workMin || 25;
  var defaultBreakMin = opts.breakMin || 5;
  var defaultLongBreakMin = opts.longBreakMin || 15;
  var totalRounds = opts.totalRounds || 4;

  var state = {
    phase: 'idle', // 'idle' | 'work' | 'break' | 'longBreak'
    topic: 'Lernen',
    round: 1,
    totalRounds: totalRounds,
    workSec: defaultWorkMin * 60,
    breakSec: defaultBreakMin * 60,
    longBreakSec: defaultLongBreakMin * 60,
    totalSec: 0,
    remSec: 0,
    endAt: 0,
    isPaused: false
  };

  // Load and validate daily statistics
  var stats = { date: getToday(), count: 0, mins: 0 };
  if (storage) {
    try {
      var raw = storage.getItem('pomodoro_stats');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.date === getToday()) {
          stats.count = parsed.count || 0;
          stats.mins = parsed.mins || 0;
        }
      }
    } catch (e) {}
  }

  function saveStats() {
    if (!storage) return;
    try {
      stats.date = getToday();
      storage.setItem('pomodoro_stats', JSON.stringify(stats));
    } catch (e) {}
  }

  return {
    state: function () {
      return Object.assign({}, state);
    },
    stats: function () {
      return Object.assign({}, stats);
    },
    isActive: function () {
      return state.phase !== 'idle';
    },
    setRound: function (r) {
      state.round = Math.max(1, Math.min(totalRounds, r));
    },
    startWork: function (params) {
      params = params || {};
      var now = params.now || Date.now();
      if (params.durationMin) {
        state.workSec = params.durationMin * 60;
      }
      if (params.topic != null) {
        state.topic = String(params.topic).trim() || 'Lernen';
      }
      state.phase = 'work';
      state.totalSec = state.workSec;
      state.remSec = state.workSec;
      state.endAt = now + state.workSec * 1000;
      state.isPaused = false;
      return Object.assign({}, state);
    },
    startBreak: function (params) {
      params = params || {};
      var now = params.now || Date.now();
      var isLong = params.isLong != null ? params.isLong : (state.round >= totalRounds);
      var dur = params.durationMin
        ? params.durationMin * 60
        : (isLong ? state.longBreakSec : state.breakSec);

      state.phase = isLong ? 'longBreak' : 'break';
      state.totalSec = dur;
      state.remSec = dur;
      state.endAt = now + dur * 1000;
      state.isPaused = false;
      return Object.assign({}, state);
    },
    pause: function (now) {
      now = now || Date.now();
      if (state.phase !== 'idle' && !state.isPaused) {
        state.remSec = Math.max(0, Math.round((state.endAt - now) / 1000));
        state.isPaused = true;
      }
      return Object.assign({}, state);
    },
    resume: function (now) {
      now = now || Date.now();
      if (state.phase !== 'idle' && state.isPaused) {
        state.endAt = now + state.remSec * 1000;
        state.isPaused = false;
      }
      return Object.assign({}, state);
    },
    togglePause: function (now) {
      return state.isPaused ? this.resume(now) : this.pause(now);
    },
    addMinutes: function (mins, now) {
      mins = mins || 5;
      now = now || Date.now();
      var addSec = mins * 60;
      state.remSec += addSec;
      state.totalSec += addSec;
      if (!state.isPaused) {
        state.endAt += addSec * 1000;
      }
      return Object.assign({}, state);
    },
    skipPhase: function (now) {
      now = now || Date.now();
      if (state.phase === 'work') {
        stats.count++;
        stats.mins += Math.round(state.workSec / 60);
        saveStats();
        var wasRound = state.round;
        var isLong = wasRound >= totalRounds;
        state.phase = 'idle';
        return {
          type: 'work-complete',
          round: wasRound,
          totalRounds: totalRounds,
          isLongBreak: isLong,
          suggestedBreakMin: isLong ? Math.round(state.longBreakSec / 60) : Math.round(state.breakSec / 60)
        };
      } else if (state.phase === 'break' || state.phase === 'longBreak') {
        var isAfterLong = state.phase === 'longBreak' || state.round >= totalRounds;
        state.round = isAfterLong ? 1 : state.round + 1;
        state.phase = 'idle';
        return {
          type: 'break-complete',
          nextRound: state.round,
          suggestedWorkMin: Math.round(state.workSec / 60)
        };
      }
      return null;
    },
    reset: function () {
      state.phase = 'idle';
      state.remSec = 0;
      state.totalSec = 0;
      state.isPaused = false;
      return Object.assign({}, state);
    },
    tick: function (now) {
      if (state.phase === 'idle' || state.isPaused) {
        return null;
      }
      now = now || Date.now();
      state.remSec = Math.max(0, Math.round((state.endAt - now) / 1000));
      if (state.remSec <= 0) {
        if (state.phase === 'work') {
          stats.count++;
          stats.mins += Math.round(state.workSec / 60);
          saveStats();
          var wasRound = state.round;
          var isLong = wasRound >= totalRounds;
          state.phase = 'idle';
          return {
            type: 'work-complete',
            round: wasRound,
            totalRounds: totalRounds,
            isLongBreak: isLong,
            suggestedBreakMin: isLong ? Math.round(state.longBreakSec / 60) : Math.round(state.breakSec / 60)
          };
        } else {
          var isAfterLong = state.phase === 'longBreak' || state.round >= totalRounds;
          state.round = isAfterLong ? 1 : state.round + 1;
          state.phase = 'idle';
          return {
            type: 'break-complete',
            nextRound: state.round,
            suggestedWorkMin: Math.round(state.workSec / 60)
          };
        }
      }
      return null;
    }
  };
}

// ---------------------------------------------------------------- Web Audio Synthesizer
function playFocusCompleteChime() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx();
    var now = ctx.currentTime;
    // Harmonic uplifting triad: F4 (349Hz), A4 (440Hz), C5 (523Hz), F5 (698Hz)
    var freqs = [349.23, 440.00, 523.25, 698.46];
    freqs.forEach(function (f, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22 / (i + 1), now + i * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 3.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 3.4);
    });
  } catch (e) {
    console.warn('AudioContext focus chime failed:', e);
  }
}

function playBreakCompleteChime() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx();
    var now = ctx.currentTime;
    // Gentle 2-tone temple bell: A4 (440Hz) -> E5 (659Hz)
    [440.0, 659.25].forEach(function (f, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.2 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.2 + 2.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 3.0);
    });
  } catch (e) {
    console.warn('AudioContext break chime failed:', e);
  }
}

// ---------------------------------------------------------------- Dashboard Attachment
(function () {
  if (typeof window === 'undefined' || !window.App) return;

  var App = window.App;
  var engine = createPomodoroEngine();
  var interval = null;
  var alarmLoop = null;

  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startTick() {
    if (!interval) {
      interval = setInterval(onTick, 1000);
    }
  }

  function stopTick() {
    if (interval && !engine.isActive()) {
      clearInterval(interval);
      interval = null;
    }
  }

  function onTick() {
    var ev = engine.tick();
    if (ev) {
      stopTick();
      handleEvent(ev);
    }
    App.emit('timer-update');
    updateFullscreenView();
  }

  function handleEvent(ev) {
    if (ev.type === 'work-complete') {
      playFocusCompleteChime();
      if (alarmLoop) clearInterval(alarmLoop);
      alarmLoop = setInterval(playFocusCompleteChime, 5000);
      showWorkCompleteTakeover(ev);
    } else if (ev.type === 'break-complete') {
      playBreakCompleteChime();
      if (alarmLoop) clearInterval(alarmLoop);
      alarmLoop = setInterval(playBreakCompleteChime, 5000);
      showBreakCompleteTakeover(ev);
    }
  }

  function stopAlarmSound() {
    if (alarmLoop) {
      clearInterval(alarmLoop);
      alarmLoop = null;
    }
  }

  // ------------------------------------------------------------ Takeovers on Transition
  function showWorkCompleteTakeover(ev) {
    var st = engine.state();
    var s = engine.stats();
    var dots = '';
    for (var i = 1; i <= ev.totalRounds; i++) {
      dots += i <= ev.round ? '🍅' : '⚪';
    }

    var breakLabel = ev.isLongBreak ? 'Lange Pause (' + ev.suggestedBreakMin + 'm)' : 'Kurze Pause (' + ev.suggestedBreakMin + 'm)';
    var html = '<div class="pomo-takeover pomo-takeover--work">' +
      '<div class="pomo-t-badge">🎓 Lerneinheit ' + ev.round + ' von ' + ev.totalRounds + ' geschafft!</div>' +
      '<div class="pomo-t-emoji">🍅</div>' +
      '<div class="pomo-t-title">Hervorragend konzentriert!</div>' +
      '<div class="pomo-t-sub">Thema: <b>«' + App.esc(st.topic) + '»</b><br>Heute bereits ' + s.count + ' Einheiten (' + s.mins + ' Min) erfolgreich abgeschlossen.</div>' +
      '<div class="pomo-t-rounds"><span class="pomo-t-dots">' + dots + '</span></div>' +
      '<div class="pomo-t-actions">' +
      '  <button class="btn-pomo-break" id="btnPomoStartBreak">☕ ' + breakLabel + ' starten</button>' +
      '  <button class="btn-pomo-extend" id="btnPomoExtendWork">+ 5 Min weiterlernen</button>' +
      '  <button class="btn-pomo-dismiss" id="btnPomoDismiss">Fertig</button>' +
      '</div></div>';

    var layer = App.$('#takeover');
    if (layer) {
      layer.innerHTML = html;
      layer.classList.add('is-open');

      var bBreak = App.$('#btnPomoStartBreak');
      var bExt = App.$('#btnPomoExtendWork');
      var bDis = App.$('#btnPomoDismiss');

      if (bBreak) bBreak.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        engine.startBreak({ durationMin: ev.suggestedBreakMin, isLong: ev.isLongBreak });
        startTick();
        App.emit('timer-update');
        App.toast('☕ Pause gestartet (' + ev.suggestedBreakMin + ' Min). Tief durchatmen!');
      };

      if (bExt) bExt.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        engine.startWork({ durationMin: 5, topic: st.topic });
        startTick();
        App.emit('timer-update');
        App.toast('🍅 +5 Min Fokus verlängert');
      };

      if (bDis) bDis.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        App.emit('timer-update');
      };
    }
  }

  function showBreakCompleteTakeover(ev) {
    var dots = '';
    for (var i = 1; i <= engine.state().totalRounds; i++) {
      dots += i < ev.nextRound ? '🍅' : (i === ev.nextRound ? '🎯' : '⚪');
    }

    var html = '<div class="pomo-takeover pomo-takeover--break">' +
      '<div class="pomo-t-badge">🔔 Pause beendet</div>' +
      '<div class="pomo-t-emoji">☕</div>' +
      '<div class="pomo-t-title">Bereit für die nächste Runde?</div>' +
      '<div class="pomo-t-sub">Lerneinheit <b>' + ev.nextRound + ' von ' + engine.state().totalRounds + '</b> wartet auf dich.</div>' +
      '<div class="pomo-t-rounds"><span class="pomo-t-dots">' + dots + '</span></div>' +
      '<div class="pomo-t-actions">' +
      '  <button class="btn-pomo-work" id="btnPomoNextWork">🍅 Fokus starten (' + ev.suggestedWorkMin + ' Min)</button>' +
      '  <button class="btn-pomo-extend" id="btnPomoExtendBreak">+ 2 Min Pause verlängern</button>' +
      '  <button class="btn-pomo-dismiss" id="btnPomoDismiss">Beenden</button>' +
      '</div></div>';

    var layer = App.$('#takeover');
    if (layer) {
      layer.innerHTML = html;
      layer.classList.add('is-open');

      var bNext = App.$('#btnPomoNextWork');
      var bExt = App.$('#btnPomoExtendBreak');
      var bDis = App.$('#btnPomoDismiss');

      if (bNext) bNext.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        engine.startWork({ durationMin: ev.suggestedWorkMin });
        startTick();
        App.emit('timer-update');
        App.toast('🍅 Lerneinheit ' + ev.nextRound + ' gestartet!');
      };

      if (bExt) bExt.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        engine.startBreak({ durationMin: 2, isLong: false });
        startTick();
        App.emit('timer-update');
        App.toast('☕ Pause um 2 Min verlängert');
      };

      if (bDis) bDis.onclick = function () {
        stopAlarmSound();
        layer.classList.remove('is-open');
        layer.innerHTML = '';
        App.emit('timer-update');
      };
    }
  }

  // ------------------------------------------------------------ Fullscreen Focus Mode
  var isFullscreenOpen = false;

  function openFullscreenFocus() {
    isFullscreenOpen = true;
    renderFullscreen();
  }

  function closeFullscreenFocus() {
    isFullscreenOpen = false;
    var layer = App.$('#takeover');
    if (layer && layer.classList.contains('takeover--pomo-zen')) {
      layer.classList.remove('is-open', 'takeover--pomo-zen');
      layer.innerHTML = '';
    }
  }

  function updateFullscreenView() {
    if (!isFullscreenOpen) return;
    var box = App.$('#takeover');
    if (!box || !box.classList.contains('takeover--pomo-zen')) return;

    var s = engine.state();
    var timeEl = box.querySelector('.pomo-zen-time');
    var ringEl = box.querySelector('.pomo-zen-ring-fg');
    var badgeEl = box.querySelector('.pomo-zen-badge');
    var pauseBtn = box.querySelector('#btnZenPause');

    if (timeEl) timeEl.textContent = fmt(s.remSec);
    if (badgeEl) {
      badgeEl.innerHTML = s.phase === 'work'
        ? '🎯 Fokus & Lernen · Runde ' + s.round + '/' + s.totalRounds
        : (s.phase === 'longBreak' ? '🌿 Lange Pause' : '☕ Kurze Pause');
    }
    if (ringEl && s.totalSec > 0) {
      var r = 160;
      var c = 2 * Math.PI * r;
      var f = s.remSec / s.totalSec;
      ringEl.setAttribute('stroke-dasharray', (c * f) + ' ' + c);
    }
    if (pauseBtn) {
      pauseBtn.innerHTML = s.isPaused ? '▶ Fortsetzen' : '⏸ Pause';
    }
  }

  function renderFullscreen() {
    var s = engine.state();
    var st = engine.stats();
    var isWork = s.phase === 'work';
    var r = 160;
    var c = 2 * Math.PI * r;
    var f = s.totalSec > 0 ? (s.remSec / s.totalSec) : 1;

    var dots = '';
    for (var i = 1; i <= s.totalRounds; i++) {
      dots += '<span class="zen-dot ' + (i < s.round ? 'is-done' : (i === s.round ? 'is-cur' : '')) + '">🍅</span>';
    }

    var html = '<div class="pomo-zen-view ' + (isWork ? 'is-work' : 'is-break') + '">' +
      '<div class="pomo-zen-top">' +
      '  <div class="pomo-zen-badge">' + (isWork ? '🎯 Fokus & Lernen · Runde ' + s.round + '/' + s.totalRounds : (s.phase === 'longBreak' ? '🌿 Lange Pause' : '☕ Kurze Pause')) + '</div>' +
      '  <div class="pomo-zen-topic">📖 ' + App.esc(s.topic) + '</div>' +
      '</div>' +
      '<div class="pomo-zen-center">' +
      '  <svg class="pomo-zen-svg" width="380" height="380" viewBox="0 0 380 380">' +
      '    <circle class="pomo-zen-ring-bg" cx="190" cy="190" r="' + r + '"/>' +
      '    <circle class="pomo-zen-ring-fg" cx="190" cy="190" r="' + r + '" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 190 190)"/>' +
      '  </svg>' +
      '  <div class="pomo-zen-inner">' +
      '    <div class="pomo-zen-time num">' + fmt(s.remSec) + '</div>' +
      '    <div class="pomo-zen-sub">' + (s.isPaused ? 'Pausiert' : (isWork ? 'Konzentriert bleiben' : 'Entspannen & erholen')) + '</div>' +
      '    <div class="pomo-zen-dots">' + dots + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="pomo-zen-quote">« Schritt für Schritt · Keine Ablenkung · Heute: ' + st.count + ' Lerneinheiten (' + st.mins + ' Min) »</div>' +
      '<div class="pomo-zen-actions">' +
      '  <button class="zen-btn zen-btn--pause" id="btnZenPause">' + (s.isPaused ? '▶ Fortsetzen' : '⏸ Pause') + '</button>' +
      '  <button class="zen-btn" id="btnZenAdd">+5 Min</button>' +
      '  <button class="zen-btn" id="btnZenSkip">' + (isWork ? '☕ Pause' : '🍅 Fokus') + '</button>' +
      '  <button class="zen-btn zen-btn--mini" id="btnZenMini">↙ Dashboard</button>' +
      '  <button class="zen-btn zen-btn--danger" id="btnZenStop">✕ Beenden</button>' +
      '</div>' +
      '</div>';

    var layer = App.$('#takeover');
    if (layer) {
      layer.innerHTML = html;
      layer.className = 'takeover is-open takeover--pomo-zen';

      App.$('#btnZenPause').onclick = function () {
        engine.togglePause();
        updateFullscreenView();
        App.emit('timer-update');
      };
      App.$('#btnZenAdd').onclick = function () {
        engine.addMinutes(5);
        updateFullscreenView();
        App.emit('timer-update');
      };
      App.$('#btnZenSkip').onclick = function () {
        var ev = engine.skipPhase();
        if (ev) {
          closeFullscreenFocus();
          handleEvent(ev);
        }
      };
      App.$('#btnZenMini').onclick = function () {
        closeFullscreenFocus();
        App.toast('🍅 Pomodoro läuft im Hintergrund weiter');
      };
      App.$('#btnZenStop').onclick = function () {
        engine.reset();
        stopTick();
        closeFullscreenFocus();
        App.emit('timer-update');
        App.toast('Pomodoro beendet');
      };
    }
  }

  // ------------------------------------------------------------ Sheet HTML & Mount
  function renderSheetHTML() {
    var s = engine.state();
    var st = engine.stats();
    var isActive = engine.isActive();

    var dots = '';
    for (var i = 1; i <= s.totalRounds; i++) {
      dots += '<span class="p-dot ' + (i < s.round ? 'is-done' : (i === s.round && isActive ? 'is-cur' : '')) + '">🍅</span>';
    }

    if (isActive) {
      var isWork = s.phase === 'work';
      var pct = s.totalSec > 0 ? Math.round((s.remSec / s.totalSec) * 100) : 0;
      return '<div class="pomo-sheet">' +
        '<div class="pomo-stats-grid">' +
        '  <div class="pomo-stat-card">' +
        '    <span class="pomo-stat-icon">🍅</span>' +
        '    <div class="pomo-stat-info">' +
        '      <span class="pomo-stat-num num">' + st.count + ' Einheiten</span>' +
        '      <span class="pomo-stat-sub">Ziel: 4 Pomodoros</span>' +
        '    </div>' +
        '  </div>' +
        '  <div class="pomo-stat-card">' +
        '    <span class="pomo-stat-icon">⚡</span>' +
        '    <div class="pomo-stat-info">' +
        '      <span class="pomo-stat-num num">' + st.mins + ' Min</span>' +
        '      <span class="pomo-stat-sub">Fokuszeit heute</span>' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '<div class="pomo-active-card ' + (isWork ? 'is-work' : 'is-break') + '">' +
        '  <div class="pomo-ac-top">' +
        '    <span class="pomo-status-tag">' + (isWork ? '🎯 Fokus-Phase' : (s.phase === 'longBreak' ? '🌿 Lange Pause' : '☕ Kurze Pause')) + '</span>' +
        '    <span class="pomo-ac-rounds">' + dots + '</span>' +
        '  </div>' +
        '  <div class="pomo-ac-topic">📖 ' + App.esc(s.topic) + '</div>' +
        '  <div class="pomo-ac-time-row">' +
        '    <span class="pomo-ac-time num">' + fmt(s.remSec) + '</span>' +
        '    <span class="pomo-ac-sub">' + (s.isPaused ? 'Pausiert' : ('Runde ' + s.round + '/' + s.totalRounds)) + '</span>' +
        '  </div>' +
        '  <div class="pomo-progress-track">' +
        '    <div class="pomo-progress-fill" style="width:' + pct + '%"></div>' +
        '  </div>' +
        '  <div class="pomo-ac-actions">' +
        '    <button class="pomo-btn-ctrl pomo-btn-ctrl--primary" id="pomoBtnPause">' + (s.isPaused ? '▶ Weiter' : '⏸ Pause') + '</button>' +
        '    <button class="pomo-btn-ctrl" id="pomoBtnAdd">+5 Min</button>' +
        '    <button class="pomo-btn-ctrl" id="pomoBtnSkip">' + (isWork ? '☕ Pause' : '🍅 Fokus') + '</button>' +
        '    <button class="pomo-btn-ctrl pomo-btn-ctrl--danger" id="pomoBtnReset">✕ Stop</button>' +
        '  </div>' +
        '  <button class="pomo-btn-fullscreen" id="pomoBtnZen">↗ Vollbild Fokusmodus (1280×800)</button>' +
        '</div>' +
        '</div>';
    }

    // Idle setup
    return '<div class="pomo-sheet">' +
      '<div class="pomo-stats-grid">' +
      '  <div class="pomo-stat-card">' +
      '    <span class="pomo-stat-icon">🍅</span>' +
      '    <div class="pomo-stat-info">' +
      '      <span class="pomo-stat-num num">' + st.count + ' Einheiten</span>' +
      '      <span class="pomo-stat-sub">Ziel: 4 Pomodoros</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pomo-stat-card">' +
      '    <span class="pomo-stat-icon">⚡</span>' +
      '    <div class="pomo-stat-info">' +
      '      <span class="pomo-stat-num num">' + st.mins + ' Min</span>' +
      '      <span class="pomo-stat-sub">Fokuszeit heute</span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      '<div class="pomo-setup">' +
      '  <div class="pomo-sec-title">📖 Lern-Thema oder Fach</div>' +
      '  <div class="pomo-topic-wrap">' +
      '    <div class="pomo-input-box">' +
      '      <span class="pomo-input-icon">✏️</span>' +
      '      <input type="text" class="pomo-input" id="pomoTopicInput" placeholder="Was möchtest du lernen?..." value="' + App.esc(s.topic) + '">' +
      '    </div>' +
      '    <div class="pomo-topic-chips">' +
      '      <button class="p-chip is-sel" data-topic="Lernen">Freies Lernen</button>' +
      '      <button class="p-chip" data-topic="Klausur">Klausurvorbereitung</button>' +
      '      <button class="p-chip" data-topic="Hausarbeit">Hausarbeit / Recherche</button>' +
      '      <button class="p-chip" data-topic="Programmieren">Coden / Projekt</button>' +
      '      <button class="p-chip" data-topic="Lesen">Fachbuch lesen</button>' +
      '    </div>' +
      '  </div>' +

      '  <div class="pomo-sec-title">⏱️ Fokus-Dauer (Intervall)</div>' +
      '  <div class="pomo-dur-grid">' +
      '    <button class="p-dur-btn is-sel" data-work="25">' +
      '      <span class="p-dur-emoji">🍅</span>' +
      '      <div class="p-dur-text"><b>25 Min</b><small>Standard</small></div>' +
      '    </button>' +
      '    <button class="p-dur-btn" data-work="45">' +
      '      <span class="p-dur-emoji">🎓</span>' +
      '      <div class="p-dur-text"><b>45 Min</b><small>Uni / Schule</small></div>' +
      '    </button>' +
      '    <button class="p-dur-btn" data-work="50">' +
      '      <span class="p-dur-emoji">⚡</span>' +
      '      <div class="p-dur-text"><b>50 Min</b><small>Deep Work</small></div>' +
      '    </button>' +
      '    <button class="p-dur-btn" data-work="15">' +
      '      <span class="p-dur-emoji">⏱️</span>' +
      '      <div class="p-dur-text"><b>15 Min</b><small>Sprint</small></div>' +
      '    </button>' +
      '  </div>' +

      '  <div class="pomo-sec-title">☕ Pausen-Länge</div>' +
      '  <div class="pomo-break-wrap">' +
      '    <div class="pomo-break-row">' +
      '      <button class="p-brk-btn is-sel" data-brk="5">☕ 5 Min Kurz</button>' +
      '      <button class="p-brk-btn" data-brk="10">🌿 10 Min Erholung</button>' +
      '      <span class="pomo-brk-hint">Nach 4: 15m 🎉</span>' +
      '    </div>' +
      '  </div>' +

      '  <div class="pomo-start-row">' +
      '    <button class="pomo-start-btn" id="btnPomoStart">🍅 Lerneinheit starten</button>' +
      '    <button class="pomo-zen-start-btn" id="btnPomoStartZen">↗ Direkt im Vollbildmodus starten</button>' +
      '  </div>' +
      '</div>' +
      '</div>';
  }

  function mountSheet(sheetEl, closeSheet) {
    var selWorkMin = 25;
    var selBreakMin = 5;
    var selTopic = engine.state().topic || 'Lernen';

    // Chips
    sheetEl.querySelectorAll('.p-chip').forEach(function (btn) {
      btn.onclick = function () {
        sheetEl.querySelectorAll('.p-chip').forEach(function (b) { b.classList.remove('is-sel'); });
        btn.classList.add('is-sel');
        selTopic = btn.dataset.topic;
        var inp = sheetEl.querySelector('#pomoTopicInput');
        if (inp) inp.value = selTopic;
      };
    });

    var topicInp = sheetEl.querySelector('#pomoTopicInput');
    if (topicInp) {
      topicInp.oninput = function () {
        selTopic = topicInp.value.trim() || 'Lernen';
      };
    }

    // Work Duration buttons
    sheetEl.querySelectorAll('[data-work]').forEach(function (btn) {
      btn.onclick = function () {
        sheetEl.querySelectorAll('[data-work]').forEach(function (b) { b.classList.remove('is-sel'); });
        btn.classList.add('is-sel');
        selWorkMin = parseInt(btn.dataset.work, 10);
      };
    });

    // Break Duration buttons
    sheetEl.querySelectorAll('[data-brk]').forEach(function (btn) {
      btn.onclick = function () {
        sheetEl.querySelectorAll('[data-brk]').forEach(function (b) { b.classList.remove('is-sel'); });
        btn.classList.add('is-sel');
        selBreakMin = parseInt(btn.dataset.brk, 10);
      };
    });

    // Start Button
    var btnStart = sheetEl.querySelector('#btnPomoStart');
    if (btnStart) {
      btnStart.onclick = function () {
        engine.startWork({ durationMin: selWorkMin, topic: selTopic });
        startTick();
        App.emit('timer-update');
        App.toast('🍅 ' + selWorkMin + ' Min Lerneinheit gestartet: «' + selTopic + '»');
        closeSheet();
      };
    }

    // Start in Zen Fullscreen Button
    var btnStartZen = sheetEl.querySelector('#btnPomoStartZen');
    if (btnStartZen) {
      btnStartZen.onclick = function () {
        engine.startWork({ durationMin: selWorkMin, topic: selTopic });
        startTick();
        App.emit('timer-update');
        closeSheet();
        openFullscreenFocus();
      };
    }

    // Active controls
    var pPause = sheetEl.querySelector('#pomoBtnPause');
    if (pPause) {
      pPause.onclick = function () {
        engine.togglePause();
        App.Timer.open('pomodoro');
      };
    }

    var pAdd = sheetEl.querySelector('#pomoBtnAdd');
    if (pAdd) {
      pAdd.onclick = function () {
        engine.addMinutes(5);
        App.Timer.open('pomodoro');
      };
    }

    var pSkip = sheetEl.querySelector('#pomoBtnSkip');
    if (pSkip) {
      pSkip.onclick = function () {
        var ev = engine.skipPhase();
        if (ev) {
          closeSheet();
          handleEvent(ev);
        } else {
          App.Timer.open('pomodoro');
        }
      };
    }

    var pReset = sheetEl.querySelector('#pomoBtnReset');
    if (pReset) {
      pReset.onclick = function () {
        engine.reset();
        stopTick();
        App.emit('timer-update');
        App.Timer.open('pomodoro');
      };
    }

    var pZen = sheetEl.querySelector('#pomoBtnZen');
    if (pZen) {
      pZen.onclick = function () {
        closeSheet();
        openFullscreenFocus();
      };
    }
  }

  // ------------------------------------------------------------ Public Export
  App.Pomodoro = {
    engine: engine,
    state: function () { return engine.state(); },
    stats: function () { return engine.stats(); },
    isActive: function () { return engine.isActive(); },
    startWork: function (dur, topic) {
      var res = engine.startWork({ durationMin: dur, topic: topic });
      startTick();
      App.emit('timer-update');
      return res;
    },
    startBreak: function (dur, isLong) {
      var res = engine.startBreak({ durationMin: dur, isLong: isLong });
      startTick();
      App.emit('timer-update');
      return res;
    },
    togglePause: function () {
      var res = engine.togglePause();
      App.emit('timer-update');
      return res;
    },
    pause: function () {
      var res = engine.pause();
      App.emit('timer-update');
      return res;
    },
    resume: function () {
      var res = engine.resume();
      App.emit('timer-update');
      return res;
    },
    addMinutes: function (m) {
      var res = engine.addMinutes(m);
      App.emit('timer-update');
      return res;
    },
    skipPhase: function () {
      var ev = engine.skipPhase();
      if (ev) handleEvent(ev);
      App.emit('timer-update');
      return ev;
    },
    reset: function () {
      var res = engine.reset();
      stopTick();
      App.emit('timer-update');
      return res;
    },
    openSheet: function () {
      if (App.Timer && App.Timer.open) {
        App.Timer.open('pomodoro');
      }
    },
    openFullscreen: openFullscreenFocus,
    closeFullscreen: closeFullscreenFocus,
    renderSheetHTML: renderSheetHTML,
    mountSheet: mountSheet,
    fmt: fmt
  };
})();

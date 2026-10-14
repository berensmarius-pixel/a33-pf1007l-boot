// Smart Kitchen Timer & Gong
(function () {
  'use strict';
  var $ = App.$;

  var PRESETS = [
    { label: 'Tee', emoji: '☕', sec: 240, desc: '4 Min' },
    { label: 'Ei weich', emoji: '🐣', sec: 360, desc: '6 Min' },
    { label: 'Ei hart', emoji: '🍳', sec: 480, desc: '8 Min' },
    { label: 'Pasta', emoji: '🍝', sec: 540, desc: '9 Min' },
    { label: 'Pizza', emoji: '🍕', sec: 780, desc: '13 Min' },
    { label: 'Backofen', emoji: '🔥', sec: 900, desc: '15 Min' }
  ];

  var timers = [];
  var tid = 0;
  var interval = null;
  var alarmLoop = null;
  var ringingTimer = null;

  // Web Audio Gong Synthesizer (Harmonic Tibetan/Zen Bell)
  function playGong() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var now = ctx.currentTime;
      var freqs = [523.25, 659.25, 783.99, 1046.5]; // C-Dur Glocke
      freqs.forEach(function (f, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.25 / (i + 1), now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 3.5);
      });
    } catch (e) {
      console.warn('AudioContext failed:', e);
    }
  }

  function startTimer(label, emoji, sec) {
    var t = {
      id: 't_' + (++tid),
      label: label,
      emoji: emoji || '⏱️',
      totalSec: sec,
      remSec: sec,
      endAt: Date.now() + sec * 1000
    };
    timers.push(t);
    if (!interval) interval = setInterval(tick, 1000);
    App.emit('timer-update');
    App.toast(t.emoji + ' ' + t.label + ' (' + fmtTime(sec) + ') gestartet');
    return t;
  }

  function stopTimer(id) {
    timers = timers.filter(function (t) { return t.id !== id; });
    if (!timers.length && interval) {
      clearInterval(interval);
      interval = null;
    }
    App.emit('timer-update');
  }

  function addMinutes(id, mins) {
    var t = timers.filter(function (x) { return x.id === id; })[0];
    if (t) {
      t.totalSec += mins * 60;
      t.remSec += mins * 60;
      t.endAt += mins * 60 * 1000;
      App.emit('timer-update');
    }
  }

  function tick() {
    var now = Date.now();
    for (var i = timers.length - 1; i >= 0; i--) {
      var t = timers[i];
      t.remSec = Math.max(0, Math.round((t.endAt - now) / 1000));
      if (t.remSec <= 0) {
        triggerAlarm(t);
        timers.splice(i, 1);
      }
    }
    if (!timers.length && interval) {
      clearInterval(interval);
      interval = null;
    }
    App.emit('timer-update');
  }

  function triggerAlarm(t) {
    ringingTimer = t;
    playGong();
    if (alarmLoop) clearInterval(alarmLoop);
    alarmLoop = setInterval(playGong, 4000);

    var layer = $('#takeover');
    if (layer) {
      layer.innerHTML = '<div class="timer-alarm-card">' +
        '<div class="alarm-emoji">' + t.emoji + '</div>' +
        '<div class="alarm-title">' + App.esc(t.label) + ' ist fertig!</div>' +
        '<div class="alarm-sub">Die eingestellte Zeit (' + fmtTime(t.totalSec) + ') ist abgelaufen.</div>' +
        '<div class="alarm-actions">' +
        '  <button class="btn-alarm-stop" id="btnAlarmStop">Fertig / Stoppen ✕</button>' +
        '  <button class="btn-alarm-snooze" id="btnAlarmSnooze">+ 2 Min verlängern</button>' +
        '</div></div>';
      layer.classList.add('is-open');

      $('#btnAlarmStop').onclick = function () { dismissAlarm(); };
      $('#btnAlarmSnooze').onclick = function () {
        dismissAlarm();
        startTimer(t.label, t.emoji, 120);
      };
    }
  }

  function dismissAlarm() {
    if (alarmLoop) {
      clearInterval(alarmLoop);
      alarmLoop = null;
    }
    ringingTimer = null;
    var layer = $('#takeover');
    if (layer) {
      layer.classList.remove('is-open');
      layer.innerHTML = '';
    }
    App.emit('timer-update');
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function openTimerSheet(initialTab) {
    var activeTab = initialTab;
    if (!activeTab) {
      activeTab = (window.App && window.App.Pomodoro && window.App.Pomodoro.isActive()) ? 'pomodoro' : 'kitchen';
    }

    App.sheet(
      '<div class="timer-sheet">' +
      '<div class="timer-tab-bar">' +
      '  <button class="timer-tab-btn ' + (activeTab === 'kitchen' ? 'is-active' : '') + '" data-timer-tab="kitchen">⏱️ Küchen-Timer</button>' +
      '  <button class="timer-tab-btn ' + (activeTab === 'pomodoro' ? 'is-active' : '') + '" data-timer-tab="pomodoro">🍅 Pomodoro Lernen</button>' +
      '</div>' +

      // Tab 1: Kitchen Timer
      '<div class="timer-tab-pane timer-tab-pane--kitchen" style="display:' + (activeTab === 'kitchen' ? 'block' : 'none') + ';">' +
      '  <div class="t-sheet-head">' +
      '    <div><b>Küchen-Timer & Wecker</b><small>Tippen zum Starten</small></div>' +
      '  </div>' +
      (timers.length ? '<div class="t-active-list">' + timers.map(function (t) {
        var pct = Math.max(0, Math.min(100, Math.round((t.remSec / t.totalSec) * 100)));
        return '<div class="t-active-item">' +
          '<span class="t-a-emoji">' + t.emoji + '</span>' +
          '<div class="t-a-info"><b>' + App.esc(t.label) + '</b><div class="t-bar"><div class="t-bar-fill" style="width:' + pct + '%"></div></div></div>' +
          '<span class="t-a-time num">' + fmtTime(t.remSec) + '</span>' +
          '<button class="t-btn-add" data-tid="' + t.id + '">+1m</button>' +
          '<button class="t-btn-del" data-tid="' + t.id + '">✕</button>' +
          '</div>';
      }).join('') + '</div>' : '<div class="t-none">Gerade läuft kein Küchen-Timer</div>') +
      '  <div class="t-presets-title">Schnellstart</div>' +
      '  <div class="t-presets-grid">' + PRESETS.map(function (p, idx) {
        return '<button class="t-pre-btn" data-pre="' + idx + '">' +
          '<span class="t-pre-emoji">' + p.emoji + '</span>' +
          '<div class="t-pre-text"><b>' + p.label + '</b><small>' + p.desc + '</small></div>' +
          '</button>';
      }).join('') + '</div>' +
      '  <div class="t-presets-title" style="margin-top:16px;">Eigene Zeit</div>' +
      '  <div class="t-custom-row">' +
      '    <button class="t-cust-btn" data-sec="60">+1 Min</button>' +
      '    <button class="t-cust-btn" data-sec="180">+3 Min</button>' +
      '    <button class="t-cust-btn" data-sec="300">+5 Min</button>' +
      '    <button class="t-cust-btn" data-sec="600">+10 Min</button>' +
      '    <button class="t-cust-btn" data-sec="1200">+20 Min</button>' +
      '  </div>' +
      '</div>' +

      // Tab 2: Pomodoro Lernen
      '<div class="timer-tab-pane timer-tab-pane--pomodoro" style="display:' + (activeTab === 'pomodoro' ? 'block' : 'none') + ';">' +
      '  <div class="t-sheet-head">' +
      '    <div><b>Pomodoro Fokus & Lernen</b><small>Effektiv lernen mit kurzen Pausen</small></div>' +
      '  </div>' +
      (window.App && window.App.Pomodoro ? window.App.Pomodoro.renderSheetHTML() : '') +
      '</div>' +
      '</div>',
      {
        onMount: function (el, close) {
          // Tab switcher
          el.querySelectorAll('[data-timer-tab]').forEach(function (tabBtn) {
            tabBtn.onclick = function () {
              var tab = tabBtn.dataset.timerTab;
              el.querySelectorAll('[data-timer-tab]').forEach(function (b) { b.classList.remove('is-active'); });
              tabBtn.classList.add('is-active');
              var kitchenPane = el.querySelector('.timer-tab-pane--kitchen');
              var pomoPane = el.querySelector('.timer-tab-pane--pomodoro');
              if (kitchenPane) kitchenPane.style.display = tab === 'kitchen' ? 'block' : 'none';
              if (pomoPane) pomoPane.style.display = tab === 'pomodoro' ? 'block' : 'none';
            };
          });

          // Kitchen events
          el.querySelectorAll('[data-pre]').forEach(function (btn) {
            btn.onclick = function () {
              var p = PRESETS[parseInt(btn.dataset.pre, 10)];
              startTimer(p.label, p.emoji, p.sec);
              close();
            };
          });

          el.querySelectorAll('[data-sec]').forEach(function (btn) {
            btn.onclick = function () {
              var sec = parseInt(btn.dataset.sec, 10);
              var label = 'Timer (' + Math.round(sec / 60) + 'm)';
              startTimer(label, '⏱️', sec);
              close();
            };
          });

          el.querySelectorAll('.t-btn-add').forEach(function (btn) {
            btn.onclick = function () {
              addMinutes(btn.dataset.tid, 1);
              openTimerSheet('kitchen');
            };
          });

          el.querySelectorAll('.t-btn-del').forEach(function (btn) {
            btn.onclick = function () {
              stopTimer(btn.dataset.tid);
              openTimerSheet('kitchen');
            };
          });

          // Mount Pomodoro controls
          if (window.App && window.App.Pomodoro && window.App.Pomodoro.mountSheet) {
            window.App.Pomodoro.mountSheet(el, close);
          }
        }
      }
    );
  }

  // Export Timer API
  App.Timer = {
    start: startTimer,
    stop: stopTimer,
    addMinutes: addMinutes,
    list: function () { return timers; },
    open: openTimerSheet,
    fmt: fmtTime,
    presets: PRESETS
  };

  // Re-render timer bar or pills on update
  App.on('timer-update', function () {
    var pill = $('#railTimer');
    if (pill) {
      var p = window.App && window.App.Pomodoro && window.App.Pomodoro.isActive() ? window.App.Pomodoro.state() : null;
      if (timers.length) {
        var first = timers[0];
        pill.className = 'rail-timer-pill' + (p ? ' has-pomo' : '');
        pill.innerHTML = '<span class="t-pulse"></span>' + first.emoji + ' <b class="num">' + fmtTime(first.remSec) + '</b>';
        pill.style.display = 'flex';
      } else if (p) {
        var isWork = p.phase === 'work';
        var icon = isWork ? '🍅' : '☕';
        pill.className = 'rail-timer-pill ' + (isWork ? 'is-pomo-work' : 'is-pomo-break');
        pill.innerHTML = '<span class="t-pulse t-pulse--pomo"></span>' + icon + ' <b class="num">' + fmtTime(p.remSec) + '</b>';
        pill.style.display = 'flex';
      } else {
        pill.className = 'rail-timer-pill';
        pill.style.display = 'none';
      }
    }
  });

})();

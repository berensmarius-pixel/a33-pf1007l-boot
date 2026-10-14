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

    var html = '<div class="tk-timer-alarm">' +
      '<div class="label label--light tk-alarm-kicker"><i class="pulse" style="background:var(--amber);"></i> Küchen-Timer · Zeit abgelaufen</div>' +
      '<div class="tk-alarm-icon-wrap">' +
      '  <span class="tk-alarm-emoji">' + t.emoji + '</span>' +
      '</div>' +
      '<h1 class="serif tk-alarm-title">' + App.esc(t.label) + ' ist fertig!</h1>' +
      '<div class="tk-alarm-sub">Die eingestellte Zeit (<b class="num">' + fmtTime(t.totalSec) + '</b>) ist abgelaufen.</div>' +
      '<div class="tk-alarm-actions">' +
      '  <button class="btn btn--solid btn-alarm-stop" id="btnAlarmStop">Fertig / Stoppen ✕</button>' +
      '  <button class="btn btn--ghost btn-alarm-snooze" id="btnAlarmSnooze">+ 2 Min verlängern</button>' +
      '</div></div>';

    App.takeover(html, {
      cls: 'takeover--timer-alarm',
      onMount: function (box) {
        var btnStop = box.querySelector('#btnAlarmStop');
        if (btnStop) {
          btnStop.onclick = function () {
            dismissAlarm();
          };
        }
        var btnSnooze = box.querySelector('#btnAlarmSnooze');
        if (btnSnooze) {
          btnSnooze.onclick = function () {
            dismissAlarm();
            startTimer(t.label, t.emoji, 120);
          };
        }
      },
      onClose: function () {
        if (alarmLoop) {
          clearInterval(alarmLoop);
          alarmLoop = null;
        }
        ringingTimer = null;
      }
    });
  }

  function dismissAlarm() {
    if (alarmLoop) {
      clearInterval(alarmLoop);
      alarmLoop = null;
    }
    ringingTimer = null;
    if (App.closeTakeover) App.closeTakeover();
    App.emit('timer-update');
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderActiveTimersHTML() {
    if (!timers.length) {
      return '<div class="t-empty-state">' +
        '<span class="t-empty-icon">⏱️</span>' +
        '<div class="t-empty-txt"><b>Gerade läuft kein Küchen-Timer</b><span>Wähle eine Schnellstart-Vorlage oder stelle eine eigene Zeit ein.</span></div>' +
        '</div>';
    }
    return '<div class="label" style="margin-bottom:8px;">Laufende Timer (' + timers.length + ')</div>' +
      '<div class="t-active-list">' + timers.map(function (t) {
        var pct = Math.max(0, Math.min(100, Math.round((t.remSec / t.totalSec) * 100)));
        return '<div class="t-active-item" data-item-tid="' + t.id + '">' +
          '<div class="t-a-avatar">' + t.emoji + '</div>' +
          '<div class="t-a-info">' +
          '  <div class="t-a-head"><b>' + App.esc(t.label) + '</b><span class="t-a-end">Fertig um ' + App.fmt.time(new Date(t.endAt)) + '</span></div>' +
          '  <div class="t-bar"><div class="t-bar-fill" style="width:' + pct + '%"></div></div>' +
          '</div>' +
          '<span class="t-a-time num">' + fmtTime(t.remSec) + '</span>' +
          '<div class="t-a-actions">' +
          '  <button class="t-btn-add" data-tid="' + t.id + '" title="1 Minute hinzufügen">+1m</button>' +
          '  <button class="t-btn-del" data-tid="' + t.id + '" title="Timer abbrechen" aria-label="Abbrechen">✕</button>' +
          '</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  function openTimerSheet(initialTab) {
    var activeTab = initialTab;
    if (!activeTab) {
      activeTab = (window.App && window.App.Pomodoro && window.App.Pomodoro.isActive()) ? 'pomodoro' : 'kitchen';
    }

    App.sheet(
      '<div class="sheet-pad timer-sheet">' +
      '<div class="t-sheet-top">' +
      '  <div class="label" id="tSheetKicker">' + (activeTab === 'pomodoro' ? 'Fokus &amp; Lernen' : 'Küche &amp; Haushalt') + '</div>' +
      '  <h2 class="serif sheet-h" id="tSheetTitle">' + (activeTab === 'pomodoro' ? 'Pomodoro-Lernuhr' : 'Küchen-Timer') + '</h2>' +
      '</div>' +
      '<div class="seg timer-tabs">' +
      '  <button class="' + (activeTab === 'kitchen' ? 'is-on' : '') + '" data-timer-tab="kitchen">⏱️ Küchen-Timer</button>' +
      '  <button class="' + (activeTab === 'pomodoro' ? 'is-on' : '') + '" data-timer-tab="pomodoro">🍅 Pomodoro Lernen</button>' +
      '</div>' +

      // Tab 1: Kitchen Timer
      '<div class="timer-tab-pane timer-tab-pane--kitchen" style="display:' + (activeTab === 'kitchen' ? 'block' : 'none') + ';">' +
      '  <div class="t-active-container">' + renderActiveTimersHTML() + '</div>' +
      '  <div class="label" style="margin: 22px 0 10px;">Schnellstart-Vorlagen</div>' +
      '  <div class="t-presets-grid">' + PRESETS.map(function (p, idx) {
        return '<button class="t-pre-btn" data-pre="' + idx + '">' +
          '<span class="t-pre-emoji">' + p.emoji + '</span>' +
          '<div class="t-pre-text">' +
          '  <b>' + p.label + '</b>' +
          '  <span class="t-pre-desc num">' + p.desc + '</span>' +
          '</div>' +
          '</button>';
      }).join('') + '</div>' +
      '  <div class="label" style="margin: 22px 0 10px;">Eigene Zeit</div>' +
      '  <div class="t-custom-chips">' +
      '    <button class="chip" data-sec="60">+1 Min</button>' +
      '    <button class="chip" data-sec="180">+3 Min</button>' +
      '    <button class="chip" data-sec="300">+5 Min</button>' +
      '    <button class="chip" data-sec="600">+10 Min</button>' +
      '    <button class="chip" data-sec="900">+15 Min</button>' +
      '    <button class="chip" data-sec="1200">+20 Min</button>' +
      '    <button class="chip" data-sec="1800">+30 Min</button>' +
      '  </div>' +
      '  <div class="t-stepper-box">' +
      '    <div class="t-stepper">' +
      '      <button class="t-step-btn" data-step="-1" aria-label="1 Minute weniger">−</button>' +
      '      <div class="t-step-val"><b id="tCustomMins" class="num">5</b> <small>Minuten</small></div>' +
      '      <button class="t-step-btn" data-step="1" aria-label="1 Minute mehr">+</button>' +
      '    </div>' +
      '    <button class="btn btn--solid t-step-start" id="tStartCustom">Timer starten</button>' +
      '  </div>' +
      '</div>' +

      // Tab 2: Pomodoro Lernen
      '<div class="timer-tab-pane timer-tab-pane--pomodoro" style="display:' + (activeTab === 'pomodoro' ? 'block' : 'none') + ';">' +
      '  <div class="pomo-pane-inner">' +
      (window.App && window.App.Pomodoro ? window.App.Pomodoro.renderSheetHTML() : '') +
      '  </div>' +
      '</div>' +
      '</div>',
      {
        onMount: function (el, close) {
          // Tab switcher
          el.querySelectorAll('[data-timer-tab]').forEach(function (tabBtn) {
            tabBtn.onclick = function () {
              var tab = tabBtn.dataset.timerTab;
              el.querySelectorAll('[data-timer-tab]').forEach(function (b) { b.classList.remove('is-on'); });
              tabBtn.classList.add('is-on');
              var kitchenPane = el.querySelector('.timer-tab-pane--kitchen');
              var pomoPane = el.querySelector('.timer-tab-pane--pomodoro');
              if (kitchenPane) kitchenPane.style.display = tab === 'kitchen' ? 'block' : 'none';
              if (pomoPane) pomoPane.style.display = tab === 'pomodoro' ? 'block' : 'none';
              var kicker = el.querySelector('#tSheetKicker');
              var title = el.querySelector('#tSheetTitle');
              if (kicker) kicker.textContent = tab === 'pomodoro' ? 'Fokus & Lernen' : 'Küche & Haushalt';
              if (title) title.textContent = tab === 'pomodoro' ? 'Pomodoro-Lernuhr' : 'Küchen-Timer';
            };
          });

          // Kitchen preset buttons
          el.querySelectorAll('[data-pre]').forEach(function (btn) {
            btn.onclick = function () {
              var p = PRESETS[parseInt(btn.dataset.pre, 10)];
              startTimer(p.label, p.emoji, p.sec);
              close();
            };
          });

          // Quick minute chips
          el.querySelectorAll('[data-sec]').forEach(function (btn) {
            btn.onclick = function () {
              var sec = parseInt(btn.dataset.sec, 10);
              var label = 'Timer (' + Math.round(sec / 60) + 'm)';
              startTimer(label, '⏱️', sec);
              close();
            };
          });

          // Custom stepper
          var customMins = 5;
          var minsVal = el.querySelector('#tCustomMins');
          el.querySelectorAll('[data-step]').forEach(function (stepBtn) {
            stepBtn.onclick = function () {
              var d = parseInt(stepBtn.dataset.step, 10);
              customMins = Math.max(1, Math.min(120, customMins + d));
              if (minsVal) minsVal.textContent = customMins;
            };
          });
          var btnStartCust = el.querySelector('#tStartCustom');
          if (btnStartCust) {
            btnStartCust.onclick = function () {
              startTimer('Timer (' + customMins + 'm)', '⏱️', customMins * 60);
              close();
            };
          }

          // Active timers event binding
          function bindTimerItemActions() {
            el.querySelectorAll('.t-btn-add').forEach(function (btn) {
              btn.onclick = function (e) {
                e.stopPropagation();
                addMinutes(btn.dataset.tid, 1);
              };
            });
            el.querySelectorAll('.t-btn-del').forEach(function (btn) {
              btn.onclick = function (e) {
                e.stopPropagation();
                stopTimer(btn.dataset.tid);
              };
            });
          }
          bindTimerItemActions();

          // Live reactive updates while sheet is open
          function onTimerUpdate() {
            if (!el.isConnected) return;
            var container = el.querySelector('.t-active-container');
            if (!container) return;
            var items = container.querySelectorAll('.t-active-item');
            if (items.length !== timers.length) {
              container.innerHTML = renderActiveTimersHTML();
              bindTimerItemActions();
              return;
            }
            timers.forEach(function (t) {
              var card = container.querySelector('[data-item-tid="' + t.id + '"]');
              if (card) {
                var timeSpan = card.querySelector('.t-a-time');
                if (timeSpan) timeSpan.textContent = fmtTime(t.remSec);
                var barFill = card.querySelector('.t-bar-fill');
                if (barFill) {
                  var pct = Math.max(0, Math.min(100, Math.round((t.remSec / t.totalSec) * 100)));
                  barFill.style.width = pct + '%';
                }
              }
            });
          }
          App.on('timer-update', onTimerUpdate);

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
        pill.innerHTML = '<span class="rail-timer-dot pulse"></span><span class="rail-timer-emoji">' + first.emoji + '</span><b class="num">' + fmtTime(first.remSec) + '</b>';
        pill.style.display = 'flex';
      } else if (p) {
        var isWork = p.phase === 'work';
        var icon = isWork ? '🍅' : '☕';
        pill.className = 'rail-timer-pill ' + (isWork ? 'is-pomo-work' : 'is-pomo-break');
        pill.innerHTML = '<span class="rail-timer-dot pulse"></span><span class="rail-timer-emoji">' + icon + '</span><b class="num">' + fmtTime(p.remSec) + '</b>';
        pill.style.display = 'flex';
      } else {
        pill.className = 'rail-timer-pill';
        pill.style.display = 'none';
      }
    }
  });

})();

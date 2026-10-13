// Garmin LiveTrack Full-Screen Takeover View
(function () {
  'use strict';

  var userDismissed = false;

  function fmtDuration(startedAt) {
    var diffMin = Math.max(0, Math.round((Date.now() - (startedAt || Date.now())) / 60000));
    return diffMin < 60 ? (diffMin + ' Min') : (Math.floor(diffMin / 60) + ' Std ' + (diffMin % 60) + ' Min');
  }

  function openFull(isManual) {
    var tr = (window.DATA && window.DATA.livetrack) || {};
    if (!tr || !tr.active) return;
    if (isManual) userDismissed = false;

    // Wake tablet to day mode if in ambient or night
    if (window.App && window.App.mode !== 'day') {
      window.App.go('home');
      window.App.setMode('day');
    }

    var startedAt = tr.startedAt || Date.now();
    var html = '<div class="livetrack-takeover">' +
      '<div class="livetrack-bar">' +
      '  <div class="livetrack-bar-title">' +
      '    <span class="live-pulse-dot"></span>' +
      '    <b>Marius unterwegs · Garmin LiveTrack</b>' +
      '    <span class="livetrack-badge" id="ltDuration">Seit ' + fmtDuration(startedAt) + '</span>' +
      '  </div>' +
      '  <div class="livetrack-bar-actions">' +
      '    <a href="' + (tr.url || '#') + '" target="_blank" rel="noopener noreferrer" class="lt-btn lt-btn--ghost">↗️ Im Browser</a>' +
      '    <button class="lt-btn lt-btn--solid" id="ltBtnMinimize" data-close>Dashboard anzeigen</button>' +
      '    <button class="lt-btn lt-btn--danger" id="ltBtnStop">Tracking beenden</button>' +
      '  </div>' +
      '</div>' +
      '<div class="livetrack-frame-full">' +
      '  <iframe class="livetrack-iframe-full" id="livetrackFullIframe" src="/api/livetrack/view"></iframe>' +
      '</div>' +
      '</div>';

    App.takeover(html, {
      cls: 'takeover--livetrack',
      onMount: function (box, close) {
        var timer = setInterval(function () {
          var durEl = box.querySelector('#ltDuration');
          if (durEl) durEl.textContent = 'Seit ' + fmtDuration(startedAt);
        }, 30000);

        var minimizeBtn = box.querySelector('#ltBtnMinimize');
        if (minimizeBtn) {
          minimizeBtn.onclick = function () {
            userDismissed = true;
            close();
          };
        }

        var stopBtn = box.querySelector('#ltBtnStop');
        if (stopBtn) {
          stopBtn.onclick = async function () {
            if (confirm('Live-Tracking auf dem Tablet beenden?')) {
              await fetch('/api/livetrack?action=stop', { method: 'POST' }).catch(function () {});
              if (window.DATA) window.DATA.livetrack = null;
              clearInterval(timer);
              close();
              App.emit('data');
              App.toast('Live-Tracking beendet', { icon: 'check' });
            }
          };
        }

        box.dataset.timerId = timer;
      },
      onClose: function () {
        var box = document.getElementById('takeover');
        if (box && box.dataset.timerId) {
          clearInterval(parseInt(box.dataset.timerId, 10));
        }
        var ifr = document.getElementById('livetrackFullIframe');
        if (ifr) {
          ifr.src = 'about:blank';
          ifr.remove();
        }
      }
    });
  }

  function closeFull() {
    userDismissed = false;
    App.closeTakeover();
  }

  function isOpen() {
    var box = document.getElementById('takeover');
    return Boolean(box && box.classList.contains('is-open') && box.classList.contains('takeover--livetrack'));
  }

  App.LiveTrack = {
    openFull: openFull,
    close: closeFull,
    isOpen: isOpen,
    isDismissed: function () { return userDismissed; },
    resetDismissed: function () { userDismissed = false; }
  };
})();

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
    var iframeSrc = (tr.sessionId && tr.token) ? ('/session/' + tr.sessionId + '/token/' + tr.token) : '/api/livetrack/view';
    var html = '<div class="livetrack-takeover">' +
      '<header class="livetrack-bar">' +
      '  <div class="livetrack-bar-title">' +
      '    <div class="label"><span class="live-pulse-dot"></span>Live <span id="ltDuration">· seit ' + fmtDuration(startedAt) + '</span></div>' +
      '    <div class="serif">Marius unterwegs</div>' +
      '  </div>' +
      '  <div class="livetrack-bar-actions">' +
      '    <button class="btn btn--ghost" id="ltBtnMinimize" data-close>' + App.icon('left', 20) + ' Dashboard</button>' +
      '    <button class="btn btn--ghost btn--stop" id="ltBtnStop">Beenden</button>' +
      '  </div>' +
      '</header>' +
      '<div class="livetrack-frame-full">' +
      '  <iframe class="livetrack-iframe-full" id="livetrackFullIframe" src="' + iframeSrc + '" allow="geolocation"></iframe>' +
      '</div>' +
      '</div>';

    App.takeover(html, {
      cls: 'takeover--livetrack',
      onMount: function (box, close) {
        var timer = setInterval(function () {
          var durEl = box.querySelector('#ltDuration');
          if (durEl) durEl.textContent = '· seit ' + fmtDuration(startedAt);
        }, 30000);

        var minimizeBtn = box.querySelector('#ltBtnMinimize');
        if (minimizeBtn) {
          minimizeBtn.onclick = function () {
            userDismissed = true;
            close();
            if (window.App) {
              window.App.go('home');
              window.App.setMode('day');
              window.App.rerender();
            }
          };
        }

        var stopBtn = box.querySelector('#ltBtnStop');
        if (stopBtn) {
          // Zweistufig statt Browser-Dialog: erst "Wirklich?", dann beenden
          var armed = null;
          stopBtn.onclick = async function () {
            if (!armed) {
              stopBtn.textContent = 'Wirklich beenden?';
              stopBtn.classList.add('is-armed');
              armed = setTimeout(function () { armed = null; stopBtn.textContent = 'Beenden'; stopBtn.classList.remove('is-armed'); }, 4000);
              return;
            }
            clearTimeout(armed);
            await fetch('/api/livetrack?action=stop', { method: 'POST' }).catch(function () {});
            if (window.DATA) window.DATA.livetrack = null;
            clearInterval(timer);
            close();
            if (window.App) {
              window.App.go('home');
              window.App.setMode('day');
              window.App.emit('data');
              window.App.rerender();
              window.App.toast('Live-Tracking beendet', { icon: 'check' });
            }
          };
        }

        box.dataset.timerId = timer;
      },
      onClose: function () {
        var box = document.getElementById('takeover');
        if (box) {
          if (box.dataset.timerId) {
            clearInterval(parseInt(box.dataset.timerId, 10));
            delete box.dataset.timerId;
          }
          box.className = 'takeover';
          box.innerHTML = '';
        }
        var ifr = document.getElementById('livetrackFullIframe');
        if (ifr) {
          ifr.src = 'about:blank';
          ifr.remove();
        }
        if (window.App) {
          window.App.resetIdle();
          window.App.go('home');
          window.App.setMode('day');
          window.App.rerender();
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

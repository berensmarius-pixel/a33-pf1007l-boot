// Photos: full-bleed editorial slideshow with layout modes.
(function () {
  'use strict';
  var V = { el: null, show: null, layout: 'auto', loud: false };
  var LAYOUTS = [['auto', 'Auto'], ['cover', 'Vollbild'], ['pair', 'Paar'], ['collage', 'Collage'], ['polaroid', 'Polaroid']];

  function heart() {
    var s = V.show && V.show.current, on = s && s.photos[0].fav;
    var b = V.el.querySelector('[data-fav]');
    b.classList.toggle('is-on', !!on);
    b.querySelector('span').textContent = on ? 'Favorit' : 'Favorit';
  }

  var SPEEDS = [[30000, '30s'], [60000, '1m'], [120000, '2m'], [300000, '5m']];

  App.register('photos', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        var curSpeed = App.photoInterval ? App.photoInterval() : 60000;
        el.innerHTML = '<div class="photos">' +
          '<div class="ph-stage"></div>' +
          '<button class="ph-zone ph-zone--l" data-prev aria-label="Zurück"></button>' +
          '<button class="ph-zone ph-zone--c" data-loud aria-label="Details anzeigen"></button>' +
          '<button class="ph-zone ph-zone--r" data-next aria-label="Weiter"></button>' +
          '<div class="ph-top" style="display:flex;gap:8px">' +
          '  <div class="seg seg--glass">' + LAYOUTS.map(function (l) {
            return '<button data-layout="' + l[0] + '" class="' + (l[0] === V.layout ? 'is-on' : '') + '">' + l[1] + '</button>';
          }).join('') + '</div>' +
          '  <div class="seg seg--glass">' + SPEEDS.map(function (s) {
            return '<button data-speed="' + s[0] + '" class="' + (s[0] === curSpeed ? 'is-on' : '') + '">' + s[1] + '</button>';
          }).join('') + '</div>' +
          '</div>' +
          '<div class="ph-bottom">' +
          '  <button class="ph-btn" data-prev>' + App.icon('left', 30) + '</button>' +
          '  <button class="ph-btn ph-btn--fav" data-fav>' + App.icon('heart', 30) + '<span>Favorit</span></button>' +
          '  <button class="ph-btn" data-next>' + App.icon('right', 30) + '</button>' +
          '</div></div>';
        V.show = new App.Slideshow(el.querySelector('.ph-stage'), { layout: V.layout, interval: curSpeed, onChange: function () { setTimeout(heart); } });
        el.addEventListener('click', function (e) {
          var t = e.target.closest('button');
          if (!t) return;
          if (t.hasAttribute('data-next')) V.show.next();
          if (t.hasAttribute('data-prev')) V.show.prev();
          if (t.hasAttribute('data-loud')) { V.loud = !V.loud; el.querySelector('.photos').classList.toggle('is-loud', V.loud); }
          if (t.dataset.layout) {
            V.layout = t.dataset.layout;
            App.$$('[data-layout]', el).forEach(function (b) { b.classList.toggle('is-on', b === t); });
            V.show.setLayout(V.layout);
          }
          if (t.dataset.speed) {
            var ms = parseInt(t.dataset.speed, 10);
            App.photoInterval(ms);
            App.$$('[data-speed]', el).forEach(function (b) { b.classList.toggle('is-on', b === t); });
            App.toast('Wechsel alle ' + t.textContent, { icon: 'clock', ms: 2500 });
          }
          if (t.hasAttribute('data-fav')) {
            var p = V.show.current && V.show.current.photos[0];
            if (!p) return;
            p.fav = !p.fav;
            heart();
            App.toast(p.fav ? 'Zu Favoriten hinzugefügt · wird öfter gezeigt' : 'Aus Favoriten entfernt', { icon: 'heart', ms: 2500 });
          }
        });
      }
      V.show.start();
    },
    resume: function () { V.show.start(); },
    hide: function () { if (V.show) V.show.stop(); }
  });
})();

// Mock data for the prototype. Everything is relative to "today" so the demo always looks current.
window.DATA = (function () {
  var base = new Date();
  base.setHours(0, 0, 0, 0);

  function at(d, hm) {
    var p = hm.split(':');
    var x = new Date(base);
    x.setDate(x.getDate() + d);
    x.setHours(+p[0], +p[1], 0, 0);
    return x;
  }
  var n = 0;
  function ev(d, s, e, title, people, extra) {
    return Object.assign({ id: 'e' + (++n), start: at(d, s), end: at(d, e), title: title, people: people }, extra || {});
  }
  function allDay(d, days, title, people, extra) {
    return Object.assign({ id: 'e' + (++n), allDay: true, start: at(d, '00:00'), end: at(d + days, '00:00'), title: title, people: people }, extra || {});
  }

  var ALL = ['marius', 'soraya'];

  var people = [
    { id: 'marius', name: 'Marius', color: '#2D5BFF', rgb: '45 91 255', ink: '#FFFFFF', home: true, status: 'Zuhause' },
    { id: 'soraya', name: 'Soraya', color: '#E4007C', rgb: '228 0 124', ink: '#FFFFFF', home: true, status: 'Zuhause' }
  ];
  var family = { id: 'family', name: 'Marius & Soraya', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' };

  // ---------------------------------------------------------------- calendar
  var events = [];
  var busyExtras = [];

  // ---------------------------------------------------------------- chores
  var routines = [
    { id: 'morning', name: 'Morgen', range: '6 – 11 Uhr', from: 0, to: 11 },
    { id: 'after', name: 'Nachmittag', range: '11 – 17 Uhr', from: 11, to: 17 },
    { id: 'evening', name: 'Abend', range: '17 – 24 Uhr', from: 17, to: 24 }
  ];
  // Aufgaben kommen vom Server (js/lists.js), nicht mehr aus dieser Datei.
  var chores = [];
  var stars = {};
  var week = {};

  // ---------------------------------------------------------------- shopping
  var stores = [{ id: 'rewe', name: 'REWE' }, { id: 'dm', name: 'dm' }, { id: 'edeka', name: 'EDEKA' }];
  var catOrder = {
    all: ['Obst & Gemüse', 'Bäckerei', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Vorrat', 'Tiefkühl', 'Snacks', 'Drogerie & Haushalt'],
    rewe: ['Obst & Gemüse', 'Bäckerei', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Vorrat', 'Tiefkühl', 'Snacks', 'Drogerie & Haushalt'],
    dm: ['Drogerie & Haushalt', 'Snacks', 'Vorrat', 'Milchprodukte & Eier', 'Obst & Gemüse', 'Bäckerei', 'Fleisch & Fisch', 'Tiefkühl'],
    edeka: ['Obst & Gemüse', 'Bäckerei', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Vorrat', 'Tiefkühl', 'Snacks', 'Drogerie & Haushalt']
  };
  var groceries = []; // kommt vom Server (js/lists.js)
  var catalog = [
    ['Äpfel', 'Obst & Gemüse'], ['Avocados', 'Obst & Gemüse'], ['Bananen', 'Obst & Gemüse'], ['Babyspinat', 'Obst & Gemüse'], ['Blaubeeren', 'Obst & Gemüse'],
    ['Brokkoli', 'Obst & Gemüse'], ['Karotten', 'Obst & Gemüse'], ['Gurke', 'Obst & Gemüse'], ['Knoblauch', 'Obst & Gemüse'], ['Weintrauben', 'Obst & Gemüse'],
    ['Zitronen', 'Obst & Gemüse'], ['Limetten', 'Obst & Gemüse'], ['Zwiebeln', 'Obst & Gemüse'], ['Kartoffeln', 'Obst & Gemüse'], ['Erdbeeren', 'Obst & Gemüse'],
    ['Tomaten', 'Obst & Gemüse'], ['Brot', 'Bäckerei'], ['Brötchen', 'Bäckerei'], ['Croissants', 'Bäckerei'], ['Sauerteigbrot', 'Bäckerei'],
    ['Toastbrot', 'Bäckerei'], ['Burger Buns', 'Bäckerei'], ['Bacon', 'Fleisch & Fisch'], ['Hähnchenbrust', 'Fleisch & Fisch'],
    ['Hackfleisch', 'Fleisch & Fisch'], ['Lachsfilet', 'Fleisch & Fisch'], ['Garnelen', 'Fleisch & Fisch'],
    ['Butter', 'Milchprodukte & Eier'], ['Gouda', 'Milchprodukte & Eier'], ['Frischkäse', 'Milchprodukte & Eier'], ['Eier', 'Milchprodukte & Eier'],
    ['Griechischer Joghurt', 'Milchprodukte & Eier'], ['Milch 3,8%', 'Milchprodukte & Eier'], ['Hafermilch', 'Milchprodukte & Eier'], ['Parmesan', 'Milchprodukte & Eier'],
    ['Schwarze Bohnen', 'Vorrat'], ['Müsli', 'Vorrat'], ['Kaffeebohnen', 'Vorrat'], ['Mehl', 'Vorrat'], ['Honig', 'Vorrat'],
    ['Ahornsirup', 'Vorrat'], ['Olivenöl', 'Vorrat'], ['Tomatensauce', 'Vorrat'], ['Erdnussbutter', 'Vorrat'], ['Reis', 'Vorrat'],
    ['Nudeln', 'Vorrat'], ['Spaghetti', 'Vorrat'], ['Zucker', 'Vorrat'], ['Tee', 'Vorrat'], ['Erbsen TK', 'Tiefkühl'],
    ['Beeren TK', 'Tiefkühl'], ['Eiscreme', 'Tiefkühl'], ['Pizza TK', 'Tiefkühl'], ['Chips', 'Snacks'],
    ['Kekse', 'Snacks'], ['Dunkle Schokolade', 'Snacks'], ['Nüsse', 'Snacks'], ['Müsliriegel', 'Snacks'],
    ['Popcorn', 'Snacks'], ['Spülmittel', 'Drogerie & Haushalt'], ['Spülmaschinentabs', 'Drogerie & Haushalt'], ['Müllbeutel', 'Drogerie & Haushalt'],
    ['Waschmittel', 'Drogerie & Haushalt'], ['Küchenrolle', 'Drogerie & Haushalt'], ['Toilettenpapier', 'Drogerie & Haushalt'], ['Zahnpasta', 'Drogerie & Haushalt']
  ];
  var usuals = ['Milch 3,8%', 'Eier', 'Bananen', 'Brot', 'Äpfel', 'Kaffeebohnen', 'Griechischer Joghurt', 'Gouda', 'Butter', 'Babyspinat', 'Hähnchenbrust', 'Küchenrolle'];

  // ---------------------------------------------------------------- weather (index = hour of day)
  var weather = {
    hi: 17, lo: 8, feels: -2, humidity: 71, wind: 18,
    t: [9, 9, 8, 8, 8, 8, 9, 10, 11, 12, 13, 15, 16, 17, 16, 15, 14, 13, 12, 12, 11, 10, 10, 9],
    c: ['moon', 'moon', 'moon', 'moon', 'moon', 'moon', 'partly', 'partly', 'sun', 'sun', 'sun', 'partly', 'partly', 'cloud', 'cloud', 'cloud', 'rain', 'rain', 'rain', 'rain', 'cloud', 'cloud', 'moon', 'moon'],
    p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 10, 20, 25, 40, 80, 90, 70, 55, 20, 10, 0, 0]
  };

  // ---------------------------------------------------------------- photos
  var t = new Date(base);
  var mmdd = ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  var photos = [
    {
      url: '/photos/20260920_155050.jpg',
      o: 'l',
      date: '2026-09-20',
      place: '',
      from: 'marius',
      tag: 'urlaub'
    },
    {
      url: '/photos/20260923_122930.jpg',
      o: 'l',
      date: '2026-09-23',
      place: '',
      from: 'soraya',
      tag: 'urlaub'
    }
  ];

  // ---------------------------------------------------------------- AI agent usage (CodexBar-style)
  // left = minutes until the window resets; win = window length in minutes (for pace)
  var H5 = 300, WEEK = 10080;
  // Nur Anbieter mit echter Datenquelle. Claude kommt aus scripts/push-usage.js (/api/usage).
  var agents = [
    {
      id: 'claude', name: 'Claude', plan: 'Code', color: '#D97757', rgb: '217 119 87', status: 'ok',
      meters: [], tokens: 0, cost: 0, week: [0, 0, 0, 0, 0, 0, 0], live: false
    }
  ];

  return {
    people: people, family: family, ALL: ALL,
    events: events, busyExtras: busyExtras,
    routines: routines, chores: chores, stars: stars, week: week,
    stores: stores, catOrder: catOrder, groceries: groceries, catalog: catalog, usuals: usuals, meals: [],
    weather: weather, photos: photos, agents: agents,
    fuel: null,   // kommt live vom Worker (/api/fuel)
    _gid: function () { return 'g' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); },
    _eid: function () { return 'e' + (++n); }
  };
})();

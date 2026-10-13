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

  // ---------------------------------------------------------------- home control
  var rooms = [
    { id: 'kitchen', name: 'Küche' },
    { id: 'living', name: 'Wohnzimmer' },
    { id: 'entry', name: 'Flur & Eingang' },
    { id: 'upstairs', name: 'Schlafzimmer' },
    { id: 'yard', name: 'Garten & Terrasse' }
  ];
  var devices = [
    { id: 'k-pend', room: 'kitchen', type: 'light', name: 'Esstischlampe', on: true, level: 80 },
    { id: 'k-under', room: 'kitchen', type: 'light', name: 'Arbeitsplatte', on: true, level: 55 },
    { id: 'k-island', room: 'kitchen', type: 'light', name: 'Kücheninsel', on: false, level: 100 },
    { id: 'k-speaker', room: 'kitchen', type: 'blind', name: 'Küchenrollo', pos: 100 },
    { id: 'l-lamp', room: 'living', type: 'light', name: 'Stehlampe', on: true, level: 45 },
    { id: 'l-ceil', room: 'living', type: 'light', name: 'Deckenleuchte', on: false, level: 100 },
    { id: 'l-blinds', room: 'living', type: 'blind', name: 'Jalousie', pos: 60 },
    { id: 'l-fire', room: 'living', type: 'light', name: 'Ambientelicht', on: false, level: 70 },
    { id: 'e-door', room: 'entry', type: 'lock', name: 'Haustür', locked: true },
    { id: 'e-porch', room: 'entry', type: 'light', name: 'Eingang außen', on: true, level: 100 },
    { id: 'g-door', room: 'entry', type: 'garage', name: 'Garagentor', state: 'closed' },
    { id: 'g-side', room: 'entry', type: 'lock', name: 'Nebeneingang', locked: true },
    { id: 'u-maya', room: 'upstairs', type: 'light', name: 'Nachttisch links', on: true, level: 30 },
    { id: 'u-otto', room: 'upstairs', type: 'light', name: 'Nachttisch rechts', on: false, level: 15 },
    { id: 'u-hall', room: 'upstairs', type: 'light', name: 'Flurlicht', on: false, level: 60 },
    { id: 'u-bath', room: 'upstairs', type: 'light', name: 'Badezimmer', on: false, level: 100 },
    { id: 'y-string', room: 'yard', type: 'light', name: 'Lichterkette', on: false, level: 100, flaky: true },
    { id: 'y-back', room: 'yard', type: 'lock', name: 'Terrassentür', locked: true },
    { id: 'y-flood', room: 'yard', type: 'light', name: 'Flutlicht', on: false, level: 100 }
  ];
  var climate = { current: 20.5, set: 21.5, mode: 'heat', humidity: 42, outside: 14 };
  var media = { room: 'Küche', title: 'Harvest Moon', artist: 'Neil Young', playing: true, volume: 35, seed: 'harvest-vinyl' };
  var cameras = [
    { id: 'c-front', name: 'Hauseingang', seed: 'porch-steps' },
    { id: 'c-drive', name: 'Einfahrt', seed: 'driveway-maple' },
    { id: 'c-yard', name: 'Garten', seed: 'garden-yard' }
  ];
  var scenes = [
    { id: 'morning', name: 'Guten Morgen', icon: 'sunrise', set: { 'k-pend': 100, 'k-under': 80, 'l-blinds': 100, 'l-lamp': 0, 'u-hall': 60 } },
    { id: 'dinner', name: 'Abendessen', icon: 'utensils', set: { 'k-pend': 55, 'k-under': 30, 'k-island': 70, 'l-lamp': 40, 'l-ceil': 0 } },
    { id: 'movie', name: 'Filmabend', icon: 'film', set: { 'k-pend': 0, 'k-under': 15, 'k-island': 0, 'l-lamp': 15, 'l-ceil': 0, 'l-blinds': 0, 'l-fire': 30 } },
    { id: 'away', name: 'Unterwegs', icon: 'away', set: { 'k-pend': 0, 'k-under': 0, 'k-island': 0, 'l-lamp': 0, 'l-ceil': 0, 'l-fire': 0, 'u-maya': 0, 'u-hall': 0, 'e-porch': 100 } },
    { id: 'night', name: 'Gute Nacht', icon: 'moon', set: { 'k-pend': 0, 'k-under': 10, 'k-island': 0, 'l-lamp': 0, 'l-ceil': 0, 'l-fire': 0, 'u-hall': 10, 'u-otto': 15, 'e-porch': 0 } }
  ];

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
    rooms: rooms, devices: devices, climate: climate, media: media, cameras: cameras, scenes: scenes,
    weather: weather, photos: photos, agents: agents,
    fuel: {
      cheapest: { name: 'JET', street: 'Pariser Str. 123', dist: 1.4, price: 1.719 },
      trend: 'cheap',
      trendText: 'Günstiger Zeitpunkt · Jetzt tanken!',
      stations: [
        { name: 'JET', street: 'Pariser Str. 123', dist: 1.4, price: 1.719 },
        { name: 'ED', street: 'Mainzer Str. 104', dist: 2.1, price: 1.739 },
        { name: 'TotalEnergies', street: 'Donnersberger Str. 1', dist: 2.5, price: 1.759 }
      ]
    },
    _gid: function () { return 'g' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); },
    _eid: function () { return 'e' + (++n); }
  };
})();

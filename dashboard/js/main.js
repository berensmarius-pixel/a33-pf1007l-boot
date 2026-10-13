// Entry point. Order matters: each module attaches to the shared window.App.
import './icons.js';
import './data.js';
import './recipes-data.js';
import './app.js';
import './lists.js';
import './system.js';
import './slideshow.js';
import './timer.js';
import './livetrack.js';
import './views/home.js';
import './views/calendar.js';
import './views/tasks.js';
import './views/shopping.js';
import './views/photos.js';
import './views/agents.js';
import './views/ambient.js';
import './diag.js';
import './live-sync.js';

// Offline-Fallback (nur über HTTPS oder localhost möglich)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(function () {});
}

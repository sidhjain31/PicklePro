// Loaded by the service worker (vite.config.js → workbox.importScripts). When a NEW version of the
// site replaces an older one on a phone, reload the open pages once so they show the new version
// straight away — even pages still running old code that can't reload themselves. A first visit (no
// older version installed) is never reloaded. A new version only arrives after a deploy, and there
// are no deploys during an event (none planned during one).
let hadOlderVersion = false;
self.addEventListener('install', () => {
  // While this worker installs, registration.active is the version it replaces (null on a first visit).
  hadOlderVersion = Boolean(self.registration.active);
});
self.addEventListener('activate', () => {
  if (!hadOlderVersion) return;
  hadOlderVersion = false;
  // NOT inside event.waitUntil: the reloaded page's requests wait for this worker to finish
  // activating, so waiting for the reload there would deadlock (seen in testing, 2026-11-18).
  self.clients.claim()
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(list => list.forEach(c => c.navigate(c.url).catch(() => {})))
    .catch(() => {});
});

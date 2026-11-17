// The site works offline (PWA): a phone that opened it before keeps showing the old version until the
// new one takes over in the background. When that happens, reload once so everyone sees the latest —
// but never while someone is typing (host score boxes), and wait a moment so a score that was just
// typed is saved first. Tabs left open (e.g. since the WhatsApp teaser) look for a new version when
// they come back to the front. A brand-new visitor already has the latest: no reload.
const KEY = 'picklepro:sw-reloaded-at';

export function autoRefresh() {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  let controlled = Boolean(sw.controller);
  let queued = false;
  const typing = () => Boolean(document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]'));
  const reload = () => {
    try {
      // At most once a minute (belt and braces against a reload loop).
      if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 60000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* storage blocked: a new worker takes over only once, so there is no loop */
    }
    location.reload();
  };
  const whenIdle = () => (typing() ? document.addEventListener('focusout', () => setTimeout(whenIdle, 2500), { once: true }) : reload());
  sw.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true; // first visit: this page is already the latest
      return;
    }
    if (queued) return;
    queued = true;
    setTimeout(whenIdle, 2500);
  });
  const check = () => sw.getRegistration().then(r => r?.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

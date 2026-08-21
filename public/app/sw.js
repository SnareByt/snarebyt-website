/* ============================================================
   SnareByt phone dashboard — service worker
   ============================================================
   Scope is /app/ only. The public site and /admin are outside it
   on purpose.

   This worker deliberately does NOT cache pages.

   That is not laziness — it is the only correct choice here. Every
   screen in this dashboard shows live business state: what has been
   paid, what is awaiting delivery, which beats are on sale. A cached
   copy of any of it is a lie with a timestamp, and the failure mode
   is Samir acting on a stale order list. An admin tool that is
   confidently wrong is worse than one that says it is offline.

   So the worker exists for exactly three jobs:
     1. Make the app installable to the Home Screen.
     2. Receive pushes while the app is closed.
     3. Focus the right screen when a notification is tapped.
   ============================================================ */

/* Take over immediately rather than waiting for every tab to close. A
   dashboard has one tab; waiting would mean a fix ships a day late. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Sweep anything a previous version of this worker cached, so an old
      // page can never be served by a new worker.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('snarebyt-')).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/**
 * An incoming alert: a new order, a verified payment, a booking.
 *
 * The payload arrives encrypted end-to-end — Apple relays a blob it cannot
 * read — and is decrypted here by the browser before this handler sees it.
 *
 * Everything is defensive. A push that throws while parsing shows the generic
 * notification rather than nothing at all: a buzz that says "something
 * happened, open the app" is far better than silence on a sale.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'SnareByt';
  const options = {
    body: data.body || 'Open the dashboard.',
    icon: '/app/icon-192.png',
    badge: '/app/badge.png',
    // Two alerts sharing a tag replace one another instead of stacking, so
    // three status changes on one order are one line on the lock screen.
    tag: data.tag || 'snarebyt',
    renotify: true,
    data: { url: data.url || '/app' },
    // A sale should buzz. iOS ignores the pattern but honours the intent.
    vibrate: [18, 60, 18],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Tapping the notification.
 *
 * If the dashboard is already open, that window is focused and navigated
 * rather than a second one being opened — on iOS a duplicate would leave two
 * copies of the app in the switcher.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes('/app')) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * The push subscription can be rotated by the browser without warning. When
 * that happens the old endpoint stops working, and unless the server is told
 * the new one, alerts stop silently — the worst kind of failure for a
 * notification system, because nothing looks wrong.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = event.newSubscription
          || (await self.registration.pushManager.subscribe(event.oldSubscription.options));
        await fetch('/app/api/push/resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint,
            subscription: sub.toJSON(),
          }),
        });
      } catch {
        /* Nothing useful to do here. The Notifications screen shows the
           device as silent, which is how this surfaces to a human. */
      }
    })(),
  );
});

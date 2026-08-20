'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes this installable.
 *
 * On iOS a site is only offered "Add to Home Screen" as a real app — its own
 * icon, no Safari chrome, its own storage — when it serves a manifest and a
 * service worker. The worker is also the only thing that can receive a push
 * while the app is closed, which is the whole point of the notifications.
 *
 * Scope is the reason the file lives at /app/sw.js rather than /sw.js. A
 * worker's default scope is its own directory, so this one governs /app and
 * nothing else. The public site and the desktop admin are deliberately outside
 * it: caching a page that shows live order counts would be a bug, and the
 * public site has its own caching story through the CDN.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Registration is fire-and-forget. A worker that fails to install must
    // leave a fully working app behind it — everything here is server-rendered
    // and the worker only adds installability and push.
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
  }, []);

  return null;
}

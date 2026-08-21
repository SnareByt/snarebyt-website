/* ============================================================
   SnareByt — push worker, root scope
   ============================================================
   The phone dashboard's worker lives at /app/sw.js and can only
   claim the /app/ scope, because a worker's scope cannot rise above
   its own directory. That is why notifications could not be turned
   on from /admin on a computer: the desktop admin sits outside it,
   so there was no worker there to receive a push.

   This file exists to claim the root scope, and it is one line of
   real content: the same implementation, not a second copy. A
   duplicated worker would drift, and the version that drifts is the
   one that silently stops delivering.

   Safe at root because that worker has NO fetch handler. It never
   intercepts a navigation and never caches a page, so the public
   site is completely unaffected by its presence. It only wakes for
   `push`, `notificationclick` and `pushsubscriptionchange`.

   Registered only from the admin. A visitor to the public site never
   calls register(), so this is never installed for them.
   ============================================================ */

importScripts('/app/sw.js');

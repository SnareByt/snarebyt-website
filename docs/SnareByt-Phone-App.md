# The SnareByt phone dashboard

The admin dashboard, built for one thumb, installed to the Home Screen of one
iPhone. It lives at **`/app`** inside this same Next.js project.

---

## Setting it up, once

### 1. Generate the push keys

```bash
npx web-push generate-vapid-keys
```

Put the two values into the hosting environment (Vercel → Settings →
Environment Variables), along with a subject:

```
VAPID_PUBLIC_KEY   = BB…            (the public half — safe to send to a browser)
VAPID_PRIVATE_KEY  = xk…            (never NEXT_PUBLIC_, never in a page)
VAPID_SUBJECT      = mailto:snarebyt@gmail.com
```

Skip this and everything else still works. The Alerts screen simply says push
is not configured, and email alerts carry on unchanged.

### 2. Push the schema

Three new tables and one new column:

```bash
npm run db:push
```

| What | Why |
|---|---|
| `WebAuthnCredential` | Face ID public keys. The private key never leaves the phone. |
| `PushDevice` | One row per installed copy that has agreed to receive alerts. |
| `Session.kind` / `.label` / `.lastSeenAt` | Tells an app session from a browser one, so the app can hold a longer session and the security screen can name each device. |

### 3. Install it on the phone

1. Open **`https://snarebyt.com/app`** in Safari.
2. Sign in with the email and password.
3. Tap **Share → Add to Home Screen**.
4. Open it again **from the new icon**, not from Safari.
5. Go to **More → Security → Set up Face ID on this phone**.
6. Go to **More → Alerts → Turn alerts on**, then **Send a test alert**.

Steps 4–6 are not optional extras:

- iOS only delivers push notifications to an installed web app. In Safari they
  never arrive at all.
- The full-screen look — no address bar, colour under the status bar — only
  appears when launched from the icon.
- **A passkey is welded to the exact hostname it was created on.** One enrolled
  on `www.snarebyt.com` will not unlock `snarebyt.com`. Always use the same
  address. If you want to pin it, set `WEBAUTHN_RP_ID` to your apex domain.

---

## What is on each tab

| Tab | What it does |
|---|---|
| **Today** | Anything wrong first, then verified revenue, then recent orders. |
| **Beats** | Prices, publishing, cover art, previews, MP3/WAV/stems, licence tiers. |
| **Orders** | Every order, payment attempts, refunds, re-issuing download links. |
| **Site** | Releases, portfolio credits, page copy, media library, services. |
| **More** | Bookings, customers, analytics, alerts, security, settings. |

### Still on the desktop, on purpose

These are not missing — they are jobs a phone does badly, and a half-working
version would be worse than an honest pointer:

- **Bangla licence terms and package descriptions.** Both languages get written
  together or not at all; a screen that let the English be edited alone is the
  exact mechanism by which the two drift apart.
- **Page section order, images and list fields.** A drag-to-reorder list and a
  media picker need more room than a bottom sheet has.
- **Turning on two-factor.** It needs a QR code, which is awkward to scan with
  the phone displaying it.
- **Email templates, licence tier multipliers, content history.**

---

## How it stays in step with the website

There is no second system, no separate API, and no copy of any rule.

```
        the phone (/app)          the desktop (/admin)
                 \                       /
                  \                     /
                   the same server actions
                   the same Prisma client
                   the same PostgreSQL database
```

Every button on the phone calls the server action `/admin` already used. That
is the whole architecture, and it is what guarantees a rule cannot be enforced
in one place and missing in the other — there is only ever one copy of each
rule. A change made on the phone is live on the website immediately, because
it is the same row in the same database.

Two things were extracted into shared modules rather than duplicated:

- `src/lib/upload-client.ts` — presigned uploads, the MIME table, and the CORS
  diagnosis.
- `src/lib/money-client.ts` — `bdt` / `usd` / `licencePrice`, so client
  components can format money without importing Prisma.

Both are re-exported from where they used to live, so nothing else changed.

---

## Security

| | |
|---|---|
| **Sign-in** | The same `signIn()` the desktop uses. Lockout after five failures, TOTP if enabled, timing flattened with a decoy hash, and an error that never says which half was wrong. |
| **Face ID** | The private key is generated in the Secure Enclave and never leaves the phone. Only the public key is stored, so a database dump contains nothing that can sign a login. A biometric is required at every assertion, not merely an unlocked phone. |
| **Sessions** | Only the SHA-256 of each token is stored. App sessions last longer than browser ones and are labelled, so an unrecognised device can be signed out from the Security screen. |
| **Authorisation** | `requireAdmin()` at the top of every action, `requireOwner()` for destructive ones. Middleware only redirects browsers — a server action is a public HTTP endpoint, so the guard has to be inside it. |
| **Rate limiting** | Per-IP on both password and Face ID sign-in, in front of the per-account lockout. Without it, a public login endpoint plus a lockout is a way to keep Samir permanently locked out on purpose. |
| **Sign-up** | None. There is no registration route at all. |
| **Secrets** | Nothing sensitive is stored in the app or rendered into a page. The gateway credentials, R2 keys, Resend key and the VAPID private key stay in server environment variables. |
| **Indexing** | `/app` is `noindex, nofollow` and `no-store`, same as `/admin`. |

### Rules that hold on the phone exactly as they do on the website

- **No "mark as paid" button.** An order becomes paid only when SSLCOMMERZ
  confirms it to our server. If a customer insists they paid, re-validate.
- A beat cannot go on sale without a tagged preview and an untagged MP3.
- A beat with paid sales is archived, not deleted.
- A paid order cannot be edited or deleted; a refund cannot exceed what is left.
- A portfolio credit cannot be published without a role.
- A booking cannot be marked delivered with nothing attached to download.
- An unconfirmed release year shows a dash, never a guess.

---

## Alerts

New order, verified payment, and enquiry alerts go out by **push and email
together**, so one failing does not silence the other.

The push payload is encrypted end to end — Apple relays a blob it cannot read.
The service worker deliberately **caches no pages**: every screen here shows
live business state, and a cached order list is a lie with a timestamp.

If alerts stop arriving:

1. **More → Alerts** — the screen names the actual cause rather than guessing.
   A device the push service has rejected is shown as *silent*, with the reason,
   instead of quietly disappearing from the list.
2. **Send a test alert** proves the whole chain: keys, worker, OS permission,
   Apple's relay.
3. If iOS shows as *blocked*, no button in the app can undo it — only
   Settings → Notifications → SnareByt can.

---

## Verifying it

```bash
npm run check:app
```

133 checks across three suites: the booking rules called directly with nothing
mocked, every screen and every server action guard, and the install surface
(manifest, worker, icons, headers, viewport).

It found a real bug on its first run — a revision could be requested before
anything had been sent, silently spending one of the client's paid revisions —
which is the reason it exists.

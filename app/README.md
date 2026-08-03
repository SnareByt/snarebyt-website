# SnareByt — database + admin dashboard

Phase 3 of the build plan. Next.js 15 App Router, PostgreSQL via Prisma,
Cloudflare R2 for private files, Resend for email, SSLCOMMERZ for payment.

---

## Get it running (about 20 minutes)

You need Node 20+ installed. Everything else is free.

```bash
# 1. install
npm install

# 2. create your .env
cp .env.example .env
```

Now fill in three things in `.env`:

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | neon.tech → new project → copy the connection string |
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste the output |
| `ADMIN_PASSWORD` | choose your own. There is no default — the seed refuses to run without it |

```bash
# 3. create the tables and load the real catalogue
npm run setup

# 4. start
npm run dev
```

Open `http://localhost:3000/admin` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

R2, Resend and SSLCOMMERZ keys can stay empty until you need uploads,
email and payments. Everything else works without them.

---

## What the seed loads

- **5 licence tiers**, English + Bangla, with the multipliers that drive every beat price
- **5 services / 15 packages** at your exact prices, English + Bangla
- **11 releases**, including the four verified Spotify IDs. Stray is seeded hidden
- **8 portfolio credits** with the correct role on each
- **6 beats as DRAFT** — they cannot be published until files are uploaded
- Discount codes `SNARE10` and `FIRSTBEAT`
- One admin user

---

## Design decisions worth knowing

**Money.** Every amount is a whole number of BDT. USD is calculated at render
time from the `usdRate` setting. There is no second currency column, because
two columns drift apart and eventually someone is charged the wrong figure.

**Bangla is required, not optional.** `LicenceTier.termsMarkdownBn` and
`ServiceTier.descriptionBn` are non-nullable. A package or licence tier
physically cannot be saved without its Bangla text.

**Role is required on portfolio items.** A credit card cannot render without
stating what you actually did, which is what stops a mix credit ever being
displayed as a production credit.

**Spotify link instead of artwork.** Paste a URL, get a live player with
Spotify's own cover art. The save action calls Spotify's public oEmbed
endpoint and warns you if the title does not match what you typed. That check
caught two real errors in this catalogue.

**A beat cannot be published without deliverables.** `saveBeat` refuses
`PUBLISHED` unless a tagged preview and an untagged MP3 exist. Otherwise a
customer pays and receives nothing.

**Beats with sales are archived, not deleted.** Issued licences must stay
provable.

**Files never pass through the web server.** The browser gets a presigned R2
URL and uploads straight to storage. A 2GB stems zip would otherwise time out.

**Two buckets.** Public holds cover art and tagged previews. Private holds
untagged MP3, WAV, stems, licence PDFs and client uploads — no public URL
exists for any of it. Downloads go through a grant that is expiring,
attempt-limited and logged.

**Payments are never trusted from the browser.** Read
`src/app/api/payments/sslcommerz/ipn/route.ts` — the callback is a public URL,
so the code re-asks SSLCOMMERZ with the `val_id` and compares status, amount,
currency and transaction id against our own record before releasing anything.
There is no "mark as paid" button in the admin panel, on purpose.

**Authorisation lives in the actions, not the middleware.** A server action is
a public HTTP endpoint. Middleware only redirects browsers; `requireAdmin()`
inside each action is the real check. Destructive operations require
`requireOwner()` (full ADMIN, not STAFF).

**Sessions store a hash.** Only the SHA-256 of the session token is in the
database, so a database dump cannot be replayed as a live login. Accounts lock
for 15 minutes after 5 failed attempts, and login is rate-limited per IP.

---

## What is in this package

```
prisma/
  schema.prisma          36 models — full data model
  seed.ts                the real catalogue, bilingual
src/lib/
  prisma.ts              pooled client, dev-safe
  auth.ts                argon2, hashed sessions, lockout, RBAC
  audit.ts               audit log + database-backed rate limiting
  validators.ts          zod schemas shared by forms and actions
  money.ts               BDT storage, USD derivation, licence pricing
  spotify.ts             URL parser, embed builder, oEmbed verification
  storage.ts             R2 presigned upload/download, download grants
middleware.ts            admin gate + security headers
src/app/admin/
  layout.tsx             sidebar shell with live counts
  login/page.tsx         rate-limited sign-in
  page.tsx               dashboard — revenue, blockers, top beats
  beats/page.tsx         beat list with deliverable readiness
  beats/actions.ts       save / delete / presigned upload
  releases/page.tsx      release list with live + featured toggles
  releases/ReleaseForm   client form with live Spotify preview
  releases/actions.ts    save / toggle / delete with oEmbed verification
src/app/api/payments/sslcommerz/ipn/route.ts
```

---

## Editing the website itself (the CMS layer)

Everything visible on the public site is a database row, so nothing needs code.

**Page → section → field.** Each page has ordered sections; each section holds
its values as JSON. The *spec* for those fields (label, type, hint) lives in
`src/lib/content-spec.ts`, which means adding a paragraph is a one-line change
with no migration, while the admin still gets a properly typed editor — text,
long text, Bangla, link, image, audio, list, toggle, colour, number.

| Screen | What it controls |
|---|---|
| **Site editor** | Every headline, paragraph, button label, link and list on all 7 pages. Hide or reorder whole sections. Live preview beside you, desktop and phone. |
| **Media** | One library for images and audio. Upload once, use anywhere. Alt text flagged when missing. |
| **Design** | Brand red, background, text colour, corner radius, animations on/off, film grain, display typeface. |
| **Menu & links** | Navigation items and every social/streaming link, each with its own show/hide. |
| **SEO** | Per-page title, description and share image, with length warnings and a share-card preview. |
| **History** | Snapshot before a risky edit, restore in one click. |

### Decisions behind it

**Media fields store an id, not a URL.** Replace a file and every page using it
updates. A URL copied into six places would have to be fixed in six places.

**Edits patch one section's JSON, not the whole document.** Two tabs open at
once cannot silently overwrite each other.

**The field spec is an allow-list.** `updateField` rejects any key that is not
in the spec, so a crafted request cannot inject arbitrary data into the JSON.

**Hiding is not deleting.** A section switched off keeps every word, so turning
it back on later costs nothing.

**Restoring a version touches content only.** Beats, orders, projects and
customers are never in a snapshot — a rollback cannot destroy trading data.

**Empty links hide themselves.** A social row with no URL never renders as a
dead icon.

**Theme values are data, not CSS constants.** They render as custom properties
on `<html>`, which is why a colour change shows up instantly everywhere.

### Files

```
src/lib/content-spec.ts        field specs — the shape of every section
src/lib/content.ts             cached readers the public pages use
src/app/admin/site/actions.ts  updateField, toggleSection, reorder, SEO,
                               theme, nav, saveVersion, restoreVersion
src/app/admin/media/actions.ts presigned upload, alt text, safe delete
```

## Still to build (Phases 4–8)

Portfolio, services, orders, projects, customers and settings screens follow
the exact same pattern as `releases/` — page + client form + actions + zod
schema. The site-editor, media, design, menu, SEO and history screens follow
the pattern in `site/actions.ts`. `SnareByt-Admin.html` is the working
prototype of all fifteen screens, so the layout and behaviour of each is
already settled.

Then: customer accounts, SSLCOMMERZ checkout initiation, licence PDF
generation, the service order workflow, and the email templates.

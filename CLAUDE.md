# SnareByt — project brief

You are continuing an existing project, not starting one. A complete, approved
design and a fully working browser prototype already exist in this folder. Your
job is to port them to a hosted Next.js application without changing the design
or losing any behaviour.

**Read `reference/SnareByt.html` and `reference/SnareByt-Admin.html` before
writing code.** They are the specification. Every layout, animation, interaction
and piece of copy in them was reviewed and signed off across many rounds. When
the prototype and your instinct disagree, the prototype wins.

---

## Who this is for

SnareByt is Samir Islam — a music producer, recording artist and mixing/mastering
engineer from Dhaka, Bangladesh, and a member of the Wrong Side collective. The
site is his artist platform *and* his business: it sells beats with licences,
takes bookings for studio services, and shows his production credits.

He is not a developer. Everything he needs to change must be changeable from the
admin dashboard. If a change requires editing code, the feature is not finished.

---

## Stack (already chosen — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript, React 19 |
| Database | PostgreSQL (Neon) via Prisma |
| Auth | Custom — argon2id, hashed session tokens, TOTP 2FA |
| Files | Cloudflare R2, two buckets (public + private) |
| Email | Resend |
| Payments | SSLCOMMERZ (Bangladesh) |
| Hosting | Vercel |
| Styling | Plain CSS in `globals.css` — already ported from the prototype |

No Tailwind, no component library, no CMS package. The design system is bespoke
and already written.

---

## What already exists in this folder

```
prisma/schema.prisma     42 models, complete. Extend; do not rewrite.
prisma/seed.ts           Real catalogue, bilingual. Extend; do not replace.
prisma/seed-content.ts   Approved copy for all 7 pages, as Page/PageSection rows
src/lib/                 auth, totp, money, spotify, storage, content, validators, audit
src/components/site/     public site components (player, store, forms, wordmark)
src/app/(site)/          public pages — section-driven from PageSection rows
src/app/admin/(dash)/    layout, dashboard, beats, releases, site, media
src/app/admin/login/     outside (dash) on purpose — that layout redirects
src/app/api/payments/sslcommerz/ipn/route.ts   the security-critical file
src/app/globals.css      public design system, ported verbatim from the prototype
src/app/admin/admin.css  admin styles — kept separate; they use bare `main`/`header`
scripts/                 check-r2, check-site
reference/
  SnareByt.html          the approved public site — working, interactive
  SnareByt-Admin.html    the approved admin dashboard — working, interactive
docs/
  SnareByt-Build-Plan.md      phase plan, asset checklist, what was verified
  SnareByt-Operating-Guide.md how Samir runs the business day to day
```

### Build order

1. **Public site pages** rendered from the database (`/`, `/music`, `/beats`,
   `/services`, `/portfolio`, `/about`, `/contact`). Section-driven: a page loads
   its `PageSection` rows and maps each `key` to a React component.
2. **Remaining admin screens** — portfolio, services, orders, projects,
   customers, settings, emails, theme, navigation, SEO, history. `releases/` is
   the reference pattern: `page.tsx` (server) + `Form.tsx` (client) +
   `actions.ts` (server actions) + a zod schema.
3. **Cart and checkout**, then real SSLCOMMERZ initiation.
4. **Licence PDF generation** and the download route.
5. **Email templates** in the black-and-red identity.
6. **Customer accounts** and dashboard.
7. **Legal pages**, SEO, analytics, launch.

---

## Decisions that are locked

Each of these was a deliberate call. Do not "improve" them without asking.

### Money
Every amount is a whole number of **BDT**, stored once. USD is derived at render
time from the `usdRate` setting and never stored. Two currency columns drift
apart and eventually charge someone the wrong figure.

### Bilingual is mandatory, not optional
`LicenceTier.termsMarkdownBn` and `ServiceTier.descriptionBn` are **non-nullable**.
A licence tier or service package cannot be saved without its Bangla text, and
both languages print into the licence PDF. Bangladeshi buyers must never see an
English-only description of what they are paying for.

The beat store also carries a prominent explainer, in both languages, of what
"non-exclusive" means — that the beat stays in the store and other artists can
licence the same beat. It is the single most misunderstood thing in a beat store.

### Payments are never trusted from the browser
`src/app/api/payments/sslcommerz/ipn/route.ts` is the most security-sensitive
file in the project. The callback URL is public, so anyone can POST "payment
successful" to it. The code must:

1. Look up our own `Payment` row by `tran_id`; unknown id → ignore.
2. Stop if `valId` is already set — duplicate callback.
3. Call the SSLCOMMERZ Transaction Validation API **server-side** with `val_id`.
4. Compare status, amount, currency and transaction id against **our** record.
5. Only then mark paid, generate licences, issue download grants, send email,
   and pull any exclusive beat off the store.

**There is no "mark as paid" button in the admin, on purpose.** If a customer
insists they paid, the admin re-validates with SSLCOMMERZ instead.

### Files
Two buckets. **Public**: cover art and *tagged* previews. **Private**: untagged
MP3, WAV, stems, licence PDFs, client uploads — no public URL exists for any of
it. Downloads go through a grant that is expiring, attempt-limited and logged.
Uploads use presigned URLs so a 2GB stems zip never passes through the server.

A beat cannot be published without a tagged preview and an untagged MP3.
Otherwise a customer pays and receives nothing.

A beat with paid sales is **archived, not deleted** — issued licences must stay
provable.

### Releases
Every release has a **live** flag, defaulting to hidden. The public site shows
nothing unless it is on, so a record that has been taken down cannot keep
advertising itself. Pasting a **Spotify URL** gives a live player with Spotify's
own cover art, so no artwork upload is needed for anything already released. The
save action verifies the link via Spotify's public oEmbed endpoint and warns if
the returned title does not match what was typed.

### Portfolio
`role` is a **required** field. A credit card cannot render without stating
exactly what SnareByt did — this is what stops a mix credit ever being displayed
as a production credit.

### Admin security
No public registration exists. First run forces password creation: 10+
characters with upper, lower and a number, enforced server-side by
`passwordSchema`. Five failed attempts locks the account for 15 minutes. Optional
TOTP 2FA (`src/lib/totp.ts`, RFC 6238, works with Google Authenticator). Sessions
store only the SHA-256 of the token, so a database dump cannot be replayed.

**Authorisation lives in the server actions, not the middleware.** A server
action is a public HTTP endpoint; middleware only redirects browsers. Call
`requireAdmin()` at the top of every action, `requireOwner()` for destructive
ones.

Secrets live in server environment variables only. Never `NEXT_PUBLIC_` a
credential. The Settings screen deliberately displays them as
"set in server env — never in the browser".

### Content editing
Everything visible on the site is a database row. Page → section → typed field.
Field *values* are JSON on `PageSection`; the field *spec* (label, type, hint)
is in `src/lib/content-spec.ts`. Adding a paragraph is a one-line change with no
migration, and `updateField` treats the spec as an allow-list so nothing
arbitrary can be injected.

Hiding is not deleting. Restoring a content version touches content only —
never beats, orders, projects or customers.

Media fields store a `MediaAsset` **id**, not a URL, so replacing a file updates
every page that uses it. Every image has alt text and the admin flags anything
missing it.

---

## Accuracy rules — these matter more than features

This is a real person's professional reputation. The following were explicitly
requested and must be preserved:

- **Never invent testimonials.** The testimonials section renders empty
  placeholder slots until real quotes with permission to publish are supplied.
- **Never invent statistics.** No stream counts, view counts or ratings that
  cannot be sourced.
- **Awaaz Utha** is credited as *Produced by SnareByt*. Its reach is described
  only as "millions of views on YouTube and billions of views across TikTok" —
  no other numbers, and it is a production credit, never a news story.
- **Kotha Ko** is *mixed and mastered* by SnareByt for SHEZAN — the first protest
  song of the July movement. Never label it as produced.
- Only releases confirmed live appear. Unverified release years show a dash, not
  a guess. Missing artwork shows "cover art pending", not a placeholder image.
- Do not mention JD or Banglawood anywhere.
- Do not add beatboxing history or a timeline biography to the About page.
- The service is **Cover Art Design**, never "Album Art". Vocal mixing is
  included inside Mixing and Mastering, not a separate service.

Verified Spotify IDs (checked against Spotify's oEmbed endpoint — do not guess
others): TOO TOXIC `7iYnFAAPw4CUDBm1pdVwTY`, WRONG TAPE
`7whDkrIejKyF7JG5sY8f4t`, Chondo Giti `4Mjg3LKI2a9CmMTZ4bbKUn`, KATSUKI
`5IOUivWbpp6yP35bX4n9FN`.

---

## Design direction

Black carries the design; red only punctuates it. The look is a premium
recording studio crossed with a luxury fashion house — cinematic, restrained,
expensive. Deep blacks, subtle crimson glows, chrome gradients, film grain at
very low opacity.

- Display typeface **Syne** (headlines and the wordmark), **Archivo** for
  interface text, **Inter** for body, **Instrument Serif** italic for accents,
  **Hind Siliguri** for Bangla.
- The wordmark is a hand-built SVG: SNAREBYT as one locked unit, never split,
  chrome gradient with an animated light sweep and a red waveform tick.
- Animations should feel unhurried. Glows are subtle, hover lifts are small,
  transitions are long and eased. Excessive effects read as cheap.
- Respect `prefers-reduced-motion`, and the admin Design screen's motion and
  grain toggles.

Exact tokens, keyframes and component styles are already in `globals.css`.

---

## How to work

**Verify, don't assume.** Every phase of this project was checked with an
automated harness before being called done — 158 checks across five suites so
far. Continue that. After a feature, write or extend a test that proves it, run
it, and report the result. "It should work" is not acceptable; neither is
claiming something passes without running it.

**Check before you claim.** If you are about to say a link, ID, credit or fact
is correct, verify it. Guessing a Spotify ID means someone else's song plays on
his site.

**Small, verifiable steps.** Build one screen or one flow, prove it works, then
move on. Do not generate twenty files and hope.

**Ask when a decision is his.** Prices, copy, which releases are live, brand
choices — these are Samir's calls, not yours. Technical trade-offs are yours to
make and explain.

**Say what you did not do.** If something is stubbed, partial or untested, say
so plainly. Unflagged gaps are how a launch breaks.

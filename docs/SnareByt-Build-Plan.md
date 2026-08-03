# SnareByt — Build Plan

---

## 0. The connected preview — how to try it

**Open `SnareByt-Admin.html` and `SnareByt.html` side by side in two tabs of the same browser.** They now share one database.

Try this sequence:

1. In the **admin**, Site editor → Hero → change the headline. Switch to the site tab — it's already there.
2. Change a beat price, the USD rate, or paste your WhatsApp number in Settings. All of it flows through.
3. On the **site**, buy a beat: licence → cart → checkout. You'll enter a name and email, then land on a **sandbox SSLCOMMERZ screen** with bKash / Nagad / Card / net banking, plus buttons to simulate a *failed* and a *cancelled* payment.
4. Pay with bKash. You get a verified-payment screen with working download buttons. Now check the admin: the order is in **Orders** (badged "From the site", status Paid, with the validation ID), the receipt / licence / notification emails are in the new **Emails** screen, and the download attempt is counted.
5. Try the failure button on another purchase — the order records as Failed, no licence is issued, no download exists, and a failure email goes out instead.
6. Buy a beat with **Exclusive Rights** — it's marked *Sold — Exclusive* on the store instantly and in the admin catalogue.
7. Submit the contact form — a project appears in the admin pipeline. Join the newsletter — a subscriber and a confirmation email appear.

The one honest limitation: this preview lives in your browser's storage, so it syncs between tabs on *one* computer. The hosted build (the `snarebyt-admin.zip` code) replaces that storage with PostgreSQL — same records, same flow, every device.

Verified end to end: **31-step cross-tab harness plus the three earlier suites, 103 checks passing, zero console errors.**

Also in this pass: animations tuned toward the "expensive" end — glows at roughly 60% of their old intensity, film grain and scanlines dimmed, hero reds deepened, slower marquee, gentler hover lifts, softer button shadows. The site also respects the admin Design toggles now: motion off and grain off both work.

*Written for someone building their first real website. Nothing here assumes prior experience.*

---

## 1. What you have right now

**`SnareByt.html`** — open it by double-clicking. This is the real design, running, in your browser. It is not a picture of a website; it is a website. Working in it right now:

| Feature | Status |
|---|---|
| 8 pages with cinematic transitions | Working |
| Loading animation, custom cursor, particles, grain, reveal-on-scroll | Working |
| Beat store, 12 beats, filters for genre / mood / key / BPM / sort / search | Working |
| **Audio previews that actually play** | Working — synthesised live in your browser from each beat's BPM and key, so you can test the player before you own a single audio file |
| Waveform players — click anywhere to seek | Working |
| Sticky bottom player — play, pause, next, previous, seek, volume, visualiser | Working |
| 5 licence tiers with full written terms | Working |
| Cart, discount codes (`SNARE10`, `FIRSTBEAT`), order summary | Working |
| BDT ↔ USD switcher (top right) | Working |
| Service packages in 3 tiers each, before/after slider | Working |
| Portfolio with category filters and project detail views | Working |
| Project brief form with real validation and order numbers | Working |
| Favourites, share links, newsletter, FAQ accordions, toasts | Working |
| Fully responsive down to 360px, respects reduced-motion | Working |

**What is deliberately not real yet:** payment, email, accounts, admin, file delivery. Those cannot live in a browser file — they need a server. That is Phase 3 onward. Every one of those buttons in the prototype shows you the exact flow it will run instead of pretending to work.

**Two things I checked before handing this over:** every page renders, every route resolves, every filter narrows correctly, forms reject bad input and accept good input, the cart maths and discount are correct, the sold-out exclusive beat correctly hides its buy options, and the console is clean — zero JavaScript errors across all 8 pages and 30+ interactions.

---

## 1 (latest). Revision 4 — live Spotify players

**72 automated checks, 72 passing, zero console errors.**

**Kotha Ko removed** from the four-card grid under your photo on About. Replaced with *Awaaz Utha · Produced by SnareByt*. It stays in the About prose, the hero proof strip, Major Credits and the portfolio — only that one card is gone.

**Spotify embeds are live.** Real players, real audio, and **real cover art pulled straight from Spotify** — no artwork files to upload. I only embedded IDs I could verify against Spotify's own oEmbed endpoint, so nothing is guessed:

| Release | Type | Verified ID |
|---|---|---|
| TOO TOXIC | album · 352px | `7iYnFAAPw4CUDBm1pdVwTY` ✓ (yours) |
| WRONG TAPE | album · 352px | `7whDkrIejKyF7JG5sY8f4t` ✓ (yours) |
| Chondo Giti | track · 152px | `4Mjg3LKI2a9CmMTZ4bbKUn` ✓ |
| KATSUKI | track · 152px | `5IOUivWbpp6yP35bX4n9FN` ✓ |

Two things worth knowing. **The ID you pasted as an example was TOO TOXIC** — I checked before using it rather than assuming. And **KATSUKI turned out to be a WRONG TAPE track** — its Spotify artwork is byte-identical to the WRONG TAPE cover — so I switched it from hidden to live and labelled it "from WRONG TAPE".

Where they appear: Music page release cards (the embed replaces the placeholder art entirely, so TOO TOXIC and WRONG TAPE now show their real covers), a "Play on Spotify — Live now" grid, the release detail modals, and a four-player grid on the homepage under Selected Recent Releases with an "ON SPOTIFY" flag on the track rows.

**Still awaiting links:** MANTRA, Flex Maar, KOBIRAZ, STREET E TOR, JARE PAKHI, NOKSHA, TESTY. The Music page lists them in a dashed note. I could not find verified Spotify IDs for these and I won't guess — a wrong ID means someone else's song playing on your site. **Send me the Spotify URLs and each becomes a live player with its real cover art automatically.** In the finished admin panel you paste the URL and the server extracts the ID and type itself (`spotifyEmbedType` / `spotifyEmbedId` in the schema).

MANTRA keeps its "Cover art pending" badge until you send either its Spotify link or the artwork file.

---

## 1a. Revision 3 — hero, Bangla licensing, Kotha Ko

**55 automated checks, 55 passing, zero console errors.**

**New hero.** "Music Producer & artist" was a job title, not a hook. It now reads **MADE IN DHAKA. / Heard everywhere.** — true, specific to you, and it earns the claim immediately underneath with a proof strip: MANTRA · WRONG TAPE · Awaaz Utha · Kotha Ko. The role hierarchy sits below in three descending tiers so *Music Producer & Recording Artist* is unmistakably the primary identity.

**Kotha Ko added** as a major credit — mixed and mastered by you, described as the first protest song of the July movement and a viral record. It's in the hero proof strip, the Major Credits section, the portfolio (flagged "Major credit") and the About story. Your role is stated as mix and master, never as production.

**WRONG TAPE completed** with your real data: beat tape, 22 tracks, 14 July 2023, and your Spotify album link live on an "Open on Spotify" button. It still carries a "Cover art pending" badge rather than an invented cover.

**Bangla licensing — the important one.** Every licence tier now shows its name, files and all nine terms in **English and Bangla**, and every service package description is bilingual too. Above the tiers there's a prominent explainer in both languages answering the question buyers actually get wrong:

> Non-exclusive means the beat **stays in the store**. Other artists can licence the same beat and release their own song on it. You are buying the right to *use* it, not the right to stop others using it. Only Exclusive Rights takes it off sale permanently.
>
> নন-এক্সক্লুসিভ মানে বিটটি স্টোরে থেকে যাবে — অন্য শিল্পীরাও একই বিট নিয়ে গান রিলিজ করতে পারবে। শুধুমাত্র এক্সক্লুসিভ রাইটস কিনলে বিটটি স্থায়ীভাবে সরিয়ে ফেলা হয়।

This is now enforced at database level: `termsMarkdownBn` and `descriptionBn` are **required** fields, so a licence tier or package physically cannot be saved without its Bangla text, and both languages print into the licence PDF.

**The name, properly.** *Snare* — the drum, the hit in the middle of the bar that moves a room before anyone decides whether they like the song. *Byt* — **bite**, from a snake's strike: fast, exact, impossible to ignore once it lands. A snare you feel, a bite you remember. Feel first, precision second, nothing shipped until both are true.

**Also done:** the "Hidden from the public site" admin panel is gone from the Music page (the live/hidden flag still works, it's just no longer visible to visitors). "Want your record here?" is replaced with **Send your session** pointing at mixing and production, since you don't take recording bookings. The "Can we get on a call?" FAQ now reads: no scheduled calls, instant support on WhatsApp direct from SnareByt — with a WhatsApp button wired to `wa.me`.

**One thing I need from you:** your **WhatsApp number**. The button is live but pointing at a placeholder (`8801XXXXXXXXX`).

---

## 1a. Revision 2 — your corrections, applied

All 18 of your confirmation points verified automatically. **42 checks, 42 passing, zero console errors.**

**Positioning.** Producer first, everywhere. Hero now reads *Music Producer & Artist* as the headline, *Mixing & Mastering Engineer* second, *creative visual services* third and deliberately smallest. Beatboxing and BattleBoxBD are gone completely, along with the "How It Happened" timeline.

**Discography.** MANTRA leads as the debut instrumental album, then TOO TOXIC, then WRONG TAPE (added — it was missing). Stray no longer opens anything; it sits in the hidden list. Beshi Beshi / Fiha Noor removed, TESTY — DRRT Gang added. JD and every Banglawood reference removed.

**Awaaz Utha.** Now a production credit — *Produced by SnareByt* — inside the Major Production Credits section and the portfolio, not a news story. Wording is exactly "millions of views on YouTube and billions of views across TikTok". The view-count and trending claims are gone, and so is the press section.

**Portfolio.** Rebuilt into four categories, music before visual: Produced by SnareByt → Mixed & Mastered by SnareByt → SnareByt Releases → Selected Visual Work. Kotha Ko is flagged as a major credit. Kashundi, Woop, MC Mugz, Grameenphone and Chorki all added with the correct role — mixed is never labelled produced. The Grameenphone and Chorki YouTube links you gave me are live on the cards. **Role is now a required database field**, so a card physically cannot render without stating what you did.

**Services.** Five only: Custom Beat Production, Mixing and Mastering, Cover Art Design, Video Editing, Lyric Video or Visualiser. Vocal Mixing folded into Mixing and Mastering as included vocal processing. Social Promo Pack, "Album Art" wording and the before/after slider all removed. Every price matches your figures exactly, in BDT, with live USD conversion.

**Beat store.** The filter bar no longer sticks. On desktop it's a compact single row in normal flow that scrolls away. On mobile it collapses into a bottom-sheet drawer behind a Filters button with an active-filter count badge, a Reset, and a Show Results button — so beats, players and Buy/Licence buttons keep the whole screen.

**Release visibility.** Every release now has a live/hidden flag, defaulting to hidden. Only what you switch on appears publicly. The Music page shows a dashed "Hidden from the public site — toggle in admin" panel so you can see exactly what's off. Nothing invents artwork: WRONG TAPE carries an "Artwork pending" badge instead of a fake cover.

**One thing I did not do.** Testimonials are in the homepage order you asked for, but the three cards are empty dashed slots. I won't write fake client quotes for a real brand. Send three real ones with permission to publish and they go in immediately.

**Also new:** `SnareByt-Operating-Guide.md` — the stack recommendation, what to automate vs handle manually, and click-by-click instructions for adding beats, processing orders, updating project statuses and delivering files.

---

## 1b. What the site now says about you — please check it

I researched your public footprint and rebuilt the copy, discography, credits and About page around the real thing. **Everything below is now live in the prototype.** Read it and correct me.

**Verified and used:**

- Samir Islam, Dhaka. Producer, audio engineer, director. Member of **Wrong Side**.
- Started 2015 · national beatbox scene · **4th place, BattleBoxBD 2017** · first release **"Stray" (2018)** as an EDM producer.
- **MANTRA (2022)** — debut producer project, built entirely from Desi instrumentation.
- **TOO TOXIC (2023)** — debut album, eight tracks, includes "Baan" feat. HANNAN.
- **"Awaaz Utha" (18 July 2024)** — written and voiced by Hannan Hossain Shimul, **mixed and mastered by you**. 6M+ YouTube views in 13 days, fifth most-trending song in Bangladesh, label Killaz Kulture. Covered by The Daily Star, Prothom Alo, Bangla Tribune and The Telegraph. **This is now the centrepiece of the site** — it's your strongest credential and it was buried.
- 16 singles and collaborations: Flex Maar, KOBIRAZ, STREET E TOR (BIHAN), Chondo Giti (NIHON), JARE PAKHI, NOKSHA (THE BEASTBUZZ), Jonaki Poka, Loco (Banglawood), Die Tonight (JD), Killmonger, Jonggol (1230 Klassick & SHEZAN), Seal Maar (SHEZAN), Beshi Beshi (Fiha Noor), Shagred (T. Zed), KATSUKI, Stray.
- Real platform links wired throughout: Spotify, Apple Music, SoundCloud, TIDAL, Deezer, Instagram, Facebook.
- Your SoundCloud profile photo is now the hero image and About portrait.
- Structured data (`MusicGroup` schema) with your real albums and every profile as `sameAs`.

**Things I could not verify — please confirm or correct:**

1. **Release years** for Jonggol, Seal Maar, Beshi Beshi, Shagred and KATSUKI. They show a dash rather than a guess.
2. **The other 7 track titles on TOO TOXIC.** Only "Baan" is documented publicly. The tracklist shows "+7 remaining" rather than invented names.
3. **MANTRA's full tracklist.**
4. **WRONG TAPE (2023)** appeared in one search result but I could not confirm it's yours, so I left it out.
5. **Your YouTube channel URL** — I only found individual video links.
6. **Your real business email.** Currently `hello@snarebyt.com` as a placeholder.
7. **Whether you still want "Artist. Producer. Creative Visionary."** as the headline — your public identity reads more as *producer and engineer* than *artist*, though TOO TOXIC changes that.

**Two things I deliberately did not do:**

- **No invented testimonials.** Fake client quotes on a real person's site is a reputational risk, not a design flourish. That section is now **Press & recognition** with four real, linked articles about Awaaz Utha — which is far stronger than anything I could have made up. When you have real client quotes with permission to publish, they go in.
- **No invented stream counts.** The stats bar now shows facts I can stand behind: 2015, 6M+ views in 13 days, 4th at BattleBoxBD, 2 projects.

**The beat store titles are placeholders** — but I rewrote them to match your actual sound rather than generic US trap: Puran Dhaka, Baul Drill, Ektara Ghost, Monsoon Drill, Sarod Static, Jatra Bass, Maa Er Chithi, Cha Stall 3AM. Swap in your real beat names and prices.

---

## 1c. The wordmark

You were right — the old one was a default font with a coloured square next to it.

**SNAREBYT is now one locked unit**, never split. It's a hand-built SVG: Syne ExtraBold caps with forced tracking so it can never reflow, filled with a five-stop chrome gradient, a second copy on top carrying an animated light sweep that travels across the letters every six seconds, a three-bar red waveform tick locked to the right, and a red rule beneath that extends on hover. It scales cleanly from 23px in the nav to the loader.

I also replaced the display typeface across every heading — **Syne** instead of Archivo. Syne is used by art institutions and fashion houses; it reads as *designed* rather than *default*, which was the problem. Archivo stays for interface text and Instrument Serif for the italic accents.

If you want a different direction for the wordmark — high-contrast fashion serif, or something more brutal and condensed — say so and I'll show you two or three alternatives side by side.

---

## 2. Decisions I made for you

You said you didn't know — so here are the choices, and why.

### Stack: Next.js + PostgreSQL

| Layer | Choice | Why |
|---|---|---|
| Website | **Next.js 15** (React) | Fastest page loads, best animation control, and the SEO/structured-data work you asked for is built in |
| Styling | **Tailwind CSS** | The brand tokens in the prototype map straight across |
| Database | **PostgreSQL** on Neon or Supabase | Free to start, scales without a migration |
| Database access | **Prisma** | Your schema is in `schema.prisma` — see below |
| Accounts | **Auth.js** | Email verification, password reset, admin roles included |
| Private files | **Cloudflare R2** | Cheap, no egress fees, supports signed expiring links — this is what protects your stems |
| Email | **Resend** | Branded HTML templates, good deliverability |
| Payment | **SSLCOMMERZ** | Your requirement; settles in BDT |
| Hosting | **Vercel** | Free tier is genuinely enough to launch |

**Why not WordPress:** you would spend the whole budget fighting plugins to get this look, and beat licensing would need three paid add-ons that don't talk to each other.

**Why not Laravel:** it's a fine choice and cheaper on shared hosting — pick it instead only if you already pay for cPanel hosting and want to keep it. Tell me and I'll rebuild the backend in Laravel; the frontend design is unaffected.

### Currency: BDT primary, USD display — as you asked

Already working in the prototype. The mechanics: **every price is stored once, in BDT.** The USD figure is calculated for display only, and the SSLCOMMERZ transaction always settles in BDT. This matters — storing two prices means they drift apart and customers get charged the wrong amount. The exchange rate lives in one admin setting you can update, and the cart tells international buyers the exact Taka figure before they pay.

---

## 3. Phases

You are at the end of Phase 1.

| Phase | What happens | Depends on |
|---|---|---|
| **1. Brand + design** ✅ | Done. Colour system, type, motion, all 8 page designs, working prototype | — |
| **2. Rebuild as Next.js** | Port the prototype into a real project. Same look, now with real pages, real routing, real image optimisation | Nothing — I can start now |
| **3. Database + admin** | Schema live, admin panel where you add beats, prices, releases, services, portfolio, blog posts — no code | Free Neon account |
| **4. Accounts + dashboard** | Signup, email verification, password reset, customer dashboard, order history, downloads | Resend account |
| **5. SSLCOMMERZ** | Sandbox first, then live. Server-side initiation, IPN listener, transaction validation, duplicate guard, transaction log | Sandbox credentials (free, today) |
| **6. Licences + delivery** | Auto-generated licence PDFs with buyer name and order number, signed expiring download links, exclusive auto-sold-out | R2 account |
| **7. Service orders** | Brief form → file upload → deposit → 9-stage status tracking → preview → revision → final delivery | Phases 4–5 |
| **8. Emails** | All 20 automated emails in the black-and-red template | Domain + Resend |
| **9. SEO + analytics** | Sitemap, robots, canonicals, Product/Music/Service schema, Search Console, GA4, Meta Pixel, TikTok Pixel, conversion events | Domain live |
| **10. Legal** | 10 pages written around *your* business — with every clause a lawyer must review clearly flagged | Your real terms |
| **11. QA + launch** | The full checklist: every link, button, form, email, payment, download, on desktop / tablet / mobile | Everything above |

Phases 2–4 are the bulk of the work. Phases 5–6 are where care matters most, because that is where money and your unreleased stems live.

---

## 4. What you need to do — in order

Do these in order. Each is free or cheap, and each unblocks a phase.

### Right now (free, 30 minutes total)

1. **SSLCOMMERZ sandbox account** — [developer.sslcommerz.com/registration](https://developer.sslcommerz.com/registration/). You get a Store ID and Store Password by email. This is test-only, no documents needed, no money moves. Send me those two values when you have them.
2. **Neon** (database) — neon.tech, free tier.
3. **Resend** (email) — resend.com, free tier covers early volume.
4. **Cloudflare** account — for R2 private file storage.

### This week

5. **Buy the domain.** `snarebyt.com` if it's free. Own it before you promote anything.
6. **Decide your real prices.** The numbers in the prototype are realistic placeholders. Yours should reflect what you will actually accept. Beat base prices and the eight service tier prices.

### Before you can take real money

7. **Business registration.** SSLCOMMERZ live accounts require documentation — for a sole proprietorship typically a Trade Licence, TIN certificate, DBID, VAT document, and the Merchant Enrolment Form; a limited company also needs incorporation documents and a board resolution. Bangladesh Bank rules also require a dedicated business merchant account and KYC. Start this early — it takes longer than the code does.
8. **A music lawyer, once.** Specifically for the Exclusive Rights contract and the ownership clauses in the licence agreement. Everything else I can draft; ownership transfer is the one place a template can genuinely cost you a master recording.

### Never

9. **Never put your SSLCOMMERZ Store Password anywhere near frontend code.** It lives in a server environment variable only. Same for database URLs and email API keys. If a credential ever appears in a browser file, treat it as compromised and rotate it.

---

## 5. Asset checklist

Bring these when you have them. Anything missing just keeps its placeholder — nothing breaks.

### Brand
- **Logo** — SVG if you have it, otherwise PNG at 1000px+ with transparent background. Light version for dark backgrounds.
- **Favicon** — 512×512 PNG, square, readable at 32px.

### Photography — highest priority
Right now the site pulls your SoundCloud avatar from SoundCloud's servers. That works today but it is a 1080px square being cropped to portrait, and you don't control that URL. Replace it with:

- **Hero portrait** — you, 1600×2000 portrait minimum, shot vertical. Single highest-impact asset on the site.
- **Studio image** — landscape, 2400×1600 minimum.
- **3–5 press images** — high resolution, for the press kit.
- Shoot in low light with one warm source. The design is built for dark, moody imagery — bright flat photos will fight it.

### Music — you already have these files, they just need collecting
- **TOO TOXIC cover** — 3000×3000.
- **MANTRA cover** — 3000×3000.
- **Cover art for all 16 singles** — 3000×3000 each. These exist on your DSPs; export the originals.
- **The 7 missing TOO TOXIC track titles** and MANTRA's tracklist, with durations.
- **Your YouTube channel URL**, and per-release video URLs.
- **Lyrics** where you have them.

### Beats
Per beat:
- **Tagged preview MP3** — with your producer tag. Public.
- **Untagged MP3 320kbps** — private, delivered on purchase.
- **WAV 24-bit** — private.
- **Stems ZIP** — private, one folder per instrument group.
- **Cover art** — 1500×1500.
- Title, genre, mood, BPM, key, tags, base price.

### Portfolio
Per project: title, client name, category, service used, 2–3 sentence description, a 1600×1200 thumbnail, and where relevant a before/after audio pair or an embedded video URL.

### Copy
- Your real bio — the About page has a draft written in your voice, but the actual studio gear, achievements and collaborations should be yours.
- Real testimonials with permission to publish names.

**File naming:** lowercase, hyphens, no spaces — `crimson-static-wav.wav`, not `Crimson Static FINAL v2.wav`. It will save you hours later.

---

## 6. How the money flow will actually work

Worth understanding, because it is the part where trust is won or lost.

1. Customer clicks pay. Your **server** — never the browser — creates the order, generates a unique transaction ID, and stores the expected amount and currency.
2. Server calls SSLCOMMERZ to initiate the session and redirects the customer to the gateway.
3. Customer pays with card, bKash, Nagad, Rocket or net banking.
4. SSLCOMMERZ sends a server-to-server **IPN** notification to your listener endpoint.
5. Your server calls the **Transaction Validation API** with the `val_id` and re-checks the amount, currency and transaction ID against its own stored record. **Nothing is trusted until this passes.** This single step is what stops someone forging a "payment successful" callback.
6. Duplicate guard rejects any repeat callback for a transaction already marked paid.
7. Only now: licence PDFs generated with the buyer's name, order number and date; receipt and licence emails sent; signed download links issued — expiring, attempt-limited, logged; exclusive beats marked sold and pulled from the store.
8. Everything appears in the customer's dashboard.

Sandbox first. You will run several fake purchases end to end — including deliberately failed and cancelled payments — before a single real Taka moves.

---

## 7. What I need from you to start Phase 2

Just one thing: **look at `SnareByt.html` and tell me what to change.**

Colours too red or not red enough. Typography too loud. A page missing something. A section you'd cut. The tone of the About copy. Placeholder prices that are nowhere near yours.

It is much cheaper to change the design now than after the backend is wired to it. Once you're happy, I start the Next.js build.

---

*Sources for the payment and registration details in section 4:*
- [SSLCOMMERZ developer documentation (v4)](https://developer.sslcommerz.com/doc/v4/)
- [SSLCOMMERZ sandbox registration](https://developer.sslcommerz.com/registration/)
- [SSLCOMMERZ integration document](https://sslcommerz.com/integration-document/)
- [E-Commerce business registration & legal compliance in Bangladesh](https://nashirahmed.com/ecommerce-business-registration-legal-compliance-bangladesh/)
- [Trade licence requirements in Bangladesh](https://juralacuity.com/trade-license-requirements-in-bd/)

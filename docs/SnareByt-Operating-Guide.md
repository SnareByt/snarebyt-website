# SnareByt — Running the Site Alone

---

## 0a. Signing in — the first time and every time

**First run:** the dashboard asks you to create a password before anything else. It must be 10+ characters with an uppercase letter, a lowercase letter and a number — the checklist turns green as you type. There is no default password and no public registration; this screen never appears again.

**Every run after that:** password (plus a rotating 6-digit code if you enable two-factor in Settings → Security). Five wrong attempts locks sign-in for 60 seconds. Sessions expire after 30 minutes of inactivity — any click extends them — and the ⎋ button in the sidebar signs you out immediately.

**Enable two-factor** the day you go live, not later: Settings → Security → toggle. In the hosted build you scan a QR into Google Authenticator or Authy; the preview shows the current code on screen so you can rehearse the flow.

## 0b. Covers, thumbnails and links — the media editor

Every beat, release, portfolio credit and service now has the same media panel in its edit drawer:

1. **Upload / Replace / Remove** a cover. After upload, **click on the image to set the focal point** — that single click controls how it crops everywhere: square beat cards, wide portfolio tiles, list thumbnails.
2. **Paste a link** — YouTube, Spotify, SoundCloud, Apple Music, Deezer, TIDAL, Facebook, Instagram. The platform is detected instantly; **Fetch info** pulls the real title and artwork from the platform itself.
3. **Anything you type wins.** Fetched details are a starting point — edit the title or upload your own image and the fetched version is ignored. **Use link artwork** copies the platform's image in as your cover with one click.
4. **Button label** — Listen / Watch / Preview / Read / Open — is suggested by the platform but yours to change.
5. **Visibility** — Published / Featured / Hidden / Draft on every item. Featured also publishes; Hidden and Draft never render on the site. Hiding deletes nothing.

Everything here reaches the public site the moment you save — same shared database, both directions.

*No coding, no team, no monthly agency bill. This is the stack I recommend, what to automate, and exactly what you click.*

---

## 1. The stack — cheapest reliable option for one person

| Job | Service | Cost to start | Why this one |
|---|---|---|---|
| Website hosting | **Vercel** | Free, then $20/mo only if you outgrow it | Deploys automatically, global CDN, free SSL. You never touch a server. |
| Database | **Neon** (PostgreSQL) | Free tier, then ~$19/mo | Stores beats, orders, customers, projects. Automatic backups. |
| Private file storage | **Cloudflare R2** | ~$0.015/GB/mo, **no download fees** | Where WAVs and stems live. No bandwidth charges is the key — S3 would bill you every time a customer downloads. |
| Email sending | **Resend** | Free up to 3,000/mo, then $20/mo | Receipts, licences, project updates. |
| Payments | **SSLCOMMERZ** | Per-transaction fee only | Cards, bKash, Nagad, Rocket, net banking. Settles in BDT. |
| Admin panel | **Built into your site** | Included | One login at `snarebyt.com/admin`. No third-party tool to learn. |
| Domain | Namecheap / Cloudflare | ~$12/yr | Buy `snarebyt.com` before you promote anything. |

**Total to launch: the domain (~£10/yr) plus SSLCOMMERZ transaction fees.** Everything else is free until you have real volume. At roughly 100 orders a month you'd be looking at about $40–60/mo total.

**What I do *not* recommend:** shared cPanel hosting (slow, and the animations will suffer), WordPress + WooCommerce (you'd fight plugins forever and beat licensing needs three paid add-ons), or Shopify (monthly fee, and digital licence delivery is clumsy).

---

## 2. Automate this. Do that by hand.

The mistake solo operators make is automating everything on day one, then not understanding their own system when something breaks.

### Automate from day one — non-negotiable

These involve money or must happen instantly, at 3am, without you:

- **Payment verification.** Server checks SSLCOMMERZ before anything is released.
- **Beat delivery.** Receipt + licence PDF + secure download link, emailed within seconds of payment clearing.
- **Licence generation.** Your name, buyer's name, beat, order number, date, terms — filled in automatically.
- **Exclusive sold-out.** The moment an exclusive sells, it disappears from the store. If this is manual, you will double-sell an exclusive one day, and that is a legal problem, not an admin one.
- **Order confirmation emails** to the customer and to you.
- **Download link expiry** and attempt limits.
- **Email verification and password reset.**

### Do manually at first — automate later if it gets annoying

- **Adding beats.** You'll add a handful a week. Upload through admin, takes three minutes.
- **Project status updates.** One click each — and the customer gets the email automatically. Keep this manual: it's your only reason to check in on a project.
- **Replying to enquiries.** Never automate this. A real reply within a day is your biggest advantage over bigger studios.
- **Testimonials and portfolio items.** You add them when you get them.
- **Abandoned-cart reminders.** Turn on after three months, once you can see whether people are actually abandoning carts.
- **Newsletter campaigns.** Send when you release something, not on a schedule.
- **Refunds.** Always manual. Always your decision.

### Never automate

- Approving a testimonial or publishing a client's name.
- Deleting customer files.
- Anything that sends money out.

---

## 3. The admin dashboard

One login. Nine screens.

| Screen | What you do |
|---|---|
| **Dashboard** | Today's orders, revenue this month, projects needing action, low-stock exclusives |
| **Beats** | Add, edit, hide, delete. Prices, licences, artwork, tags, BPM, key, preview, MP3/WAV/stems |
| **Releases** | Add releases, paste Spotify/YouTube/Apple links, **toggle live/hidden**, set order |
| **Portfolio** | Add credits, set the role (produced / mixed / both), thumbnail, link |
| **Services** | Edit packages, prices, delivery times, revision counts |
| **Orders** | Every order, payment status, transaction log, resend licence, issue refund |
| **Projects** | Service bookings — brief, uploaded files, status, deliverables |
| **Customers** | Accounts, order history, saved beats, messages |
| **Settings** | USD rate, discount codes, email templates, homepage content, SEO |

**Role toggle for releases** is the feature you specifically asked for. Every release has a live/hidden switch. The public site only ever shows what's switched on — so nothing appears that has been taken down or was never officially uploaded. It's already wired in the prototype: the Music page shows a "Hidden from the public site" panel listing what's currently switched off.

---

## 4. Step-by-step: adding a beat

Three minutes once you have the files ready.

1. **Admin → Beats → Add Beat**
2. Fill in: title, genre, mood, BPM, key, tags, base price in BDT.
3. Upload **four files**:
   - Cover art — 1500×1500 JPG
   - **Tagged** preview MP3 (with your producer tag — this is the only audio the public hears)
   - Untagged MP3 320kbps *(private)*
   - WAV 24-bit *(private)*
   - Stems ZIP *(private, only needed if you're selling the Trackout tier)*
4. Tick which licence tiers are available. Prices calculate automatically from the base price.
5. Tick **Exclusive available** if you're willing to sell it outright.
6. Save as **Draft** → check how it looks → switch to **Published**.

**The tagged/untagged split matters.** The tagged MP3 sits in public storage and streams to anyone. The untagged MP3, WAV and stems sit in private storage and are only reachable through a signed link issued after a verified payment. Never upload an untagged file as the preview.

---

## 3b. Step-by-step: changing anything on the website

**Site editor → pick a page → pick a section → edit the fields.** The preview beside you is the real layout with your live values, updating as you type. There is no separate "publish" step for text — an edit is live the moment you stop typing.

**Before a big round of edits, hit "Save a version."** That is your undo. History → Restore puts the content back exactly as it was. Restoring only affects site content — beats, releases, orders, projects and customers are never touched.

### The six things you'll actually do

1. **Change a headline or paragraph.** Site editor → section → type. Done.
2. **Swap a photo.** Site editor → the image field → Choose → upload or pick from your library. Every page using that file updates, because fields store the file, not a copied link.
3. **Hide a whole section.** The toggle on the right of each section row. Nothing is deleted — flip it back any time.
4. **Reorder sections.** The ▲▼ arrows. Useful when a new release deserves to sit above the introduction for a month.
5. **Add or remove a list item** — a proof-strip credential, an FAQ, a testimonial, a collaborator name. The + Add item button at the bottom of any list field.
6. **Change a link.** Menu & links. A link with an empty URL hides itself, so an unfinished profile never shows a dead icon.

### Alt text, briefly

Every image in the Media library has an alt text box, and the admin flags anything without one. It matters twice: screen readers read it aloud, and Google Images uses it — which is free traffic for an artist name. One honest sentence describing what is in the photo is enough.

### Design screen — a caution

You can change the brand red, the background, the corner radius, animations and the display typeface. Two things worth knowing before you do:

- **Check contrast on your own phone in daylight.** A darker or more saturated red on black can fail accessibility standards and become genuinely hard to read outdoors.
- **Turning animations off is not a downgrade.** It makes the site faster and is what some visitors' devices request anyway.

---

## 4b. Step-by-step: adding a release

Thirty seconds, and no artwork file needed.

1. **Admin → Releases → Add Release**
2. Paste the **Spotify URL** — album or track, either works. Copy it from Spotify: ⋯ → Share → Copy link.
3. The server extracts the ID and type. Save.

That's it. The page renders a live Spotify player with **real audio and the real cover art from Spotify**, so you never upload an image for a release that's already out. Fill in the title, type and year for the text around the player, tick **Live**, and it appears on the site.

**If a release isn't on Spotify yet**, leave the URL blank and upload a 3000×3000 cover instead. Until you do, the card shows a "Cover art pending" badge rather than inventing artwork.

**Only tick Live when the release is actually public.** That switch is the whole reason nothing on the site can advertise a record that's been taken down.

---

## 5. Step-by-step: a beat order (mostly hands-off)

**What happens without you:**

1. Customer picks a licence, pays via SSLCOMMERZ.
2. Server verifies the payment with SSLCOMMERZ directly — the browser is never trusted.
3. Licence PDF generated with their name, the beat, order number and date.
4. Receipt + licence + download links emailed.
5. Order appears in their dashboard.
6. If exclusive: beat marked sold, removed from the store, other licence options disabled.
7. You get a notification email.

**What you do:** nothing. Check the Orders screen once a day.

**When something goes wrong:**

- *"I didn't get my files"* → Orders → find order → **Resend delivery email**. Also regenerates fresh download links.
- *"My download expired"* → Orders → **Issue new download grant**.
- *Payment shows Pending for over an hour* → open the order, click **Re-validate with SSLCOMMERZ**. It re-checks their API. If it comes back unpaid, nothing was charged.
- *Customer wants a refund* → Orders → **Refund**. Note the reason. Digital goods are non-refundable once delivered under your policy, so this is your judgement call, not an automatic right.

---

## 6. Step-by-step: a service booking

1. **Enquiry arrives.** Admin → Projects. Status: *Order received*. Their brief, references, deadline and budget are all there.
2. **Send the quote.** Reply from the project's message thread. When they accept, click **Request deposit** — sends a 50% payment link.
3. **Deposit clears** → status flips to *Payment confirmed* automatically.
4. **They upload stems** → status flips to *Files received*, you get notified.
5. **Start work** → click *In progress*. Customer gets an email. This is the one status you should never skip; it stops "any update?" messages.
6. **Upload a preview** → drag the file into the project, tick **Send to customer**, set status *First preview ready*. They get a notification and can stream it in their dashboard.
7. **Revision requested** → status changes, revision counter increments. When they hit the package limit, admin shows **Revisions exhausted** and offers a paid extra revision link. Don't skip this — it's how a ৳6,000 mix stops becoming a ৳6,000 mix with eleven revisions.
8. **Finalising** → then upload finals: WAV master, MP3, instrumental, clean version.
9. **Completed** → click **Request balance payment**.
10. **Balance clears** → click **Deliver**. Status *Delivered*, files unlock, delivery email sent. Two days later an automatic review request goes out.

**Rule: final files unlock on final payment.** Previews are watermarked or low-bitrate. This isn't distrust; it's the only version of this that works.

---

## 7. Managing customers

- **Customers screen** — search by name, email, or artist name. Every order, project, download and message in one place.
- **Before you reply to any "where is my file"** — open their record first. Nine times out of ten the answer is on screen: link expired, payment pending, or they used a different email.
- **Never delete a customer** with completed orders. Their licence has to remain provable. Use **Deactivate** instead.
- **Data requests.** If someone asks for their data or deletion, Customers → **Export** or **Anonymise**. Anonymise keeps the order record for your accounts but strips personal details.

---

## 8. Your weekly routine

**Daily (5 minutes):** Orders screen — anything stuck on Pending? Projects — anything waiting on you? Inbox — reply to enquiries.

**Weekly (30 minutes):** Add new beats. Update project statuses. Check the USD rate in Settings if it's moved. Skim sales reports for which genres are actually selling.

**Monthly (1 hour):** Add finished work to the portfolio. Ask two happy clients for a testimonial. Send one newsletter. Check the licence terms still match how you actually work. Confirm a database backup restored cleanly — an untested backup is not a backup.

---

## 9. Five rules that will save you

1. **Never put a secret key in the website's public files.** Store ID, store password, database URL, email API key — these live in server environment variables only. If one ever appears in a browser file, rotate it immediately.
2. **Never mark an order paid manually** to help someone out. That's the one door a fraudster needs. If a payment genuinely succeeded, **Re-validate with SSLCOMMERZ** will find it.
3. **Test the whole purchase flow in sandbox before going live** — and test a *failed* payment and a *cancelled* payment too, not just the happy path.
4. **Keep the tagged preview and the untagged master in separate buckets.** Public and private. Never the same folder.
5. **Have a lawyer read the Exclusive Rights contract once.** Everything else in the legal pack I can draft. Master ownership transfer is the one clause where a template can cost you a record.

---

## 10. What's left to build

The prototype you have is the complete front end. The admin dashboard and automation described above are **Phases 3–8** in the build plan. Sequence:

1. Port the prototype to Next.js
2. Database + admin dashboard (this document's screens)
3. Accounts + customer dashboard
4. SSLCOMMERZ, sandbox first
5. Licence generation + secure delivery
6. Service order workflow
7. Email automation
8. SEO, analytics, legal pages, QA, launch

Nothing in this guide requires you to write code — but it does require you to click **Deliver** and to reply to people. That part doesn't automate, and it's the part that makes the business.

/**
 * Starting drafts for the legal pages.
 *
 * These are DRAFTS, not legal advice. Every page is created with
 * `lawyerReviewNeeded: true` and the admin shows that as a warning until
 * someone qualified has actually read them. They are written to match how this
 * business really works — non-exclusive beat licences that stay on sale,
 * exclusive licences that pull a beat permanently, service bookings paid
 * through SSLCOMMERZ in taka, files delivered through expiring links — so that
 * a lawyer is correcting a real document rather than starting from nothing.
 *
 * Existing pages are left alone. Re-running this will not overwrite wording
 * that has been edited in the admin, because those edits are the ones that
 * matter and a seed script must never be able to undo them.
 *
 *   npx tsx --env-file=.env prisma/seed-legal.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BUSINESS = 'SnareByt (Samir Islam), Dhaka, Bangladesh';
const EMAIL = 'snarebyt@gmail.com';

type Draft = { slug: string; title: string; body: string };

const DRAFTS: Draft[] = [
  {
    slug: 'beat-licensing',
    title: 'Beat Licensing Agreement',
    body: `This agreement covers every beat licensed through this site. It is between you (the "Licensee") and ${BUSINESS} ("SnareByt", "we", "us").

## What you are buying

You are buying a **licence to use a beat**. You are not buying the beat itself. SnareByt keeps ownership of the composition and the master recording in every case, including exclusive licences.

The licence begins when your payment is confirmed by the payment gateway, and not before.

## Non-exclusive licences

This is the most misunderstood part of any beat store, so it is stated plainly:

- A non-exclusive beat **stays on sale**. Other artists can licence the same beat, before you and after you.
- Your licence is real and permanent for the uses it covers, but it is not unique to you.
- The number of other people who licence the same beat is not limited.

If you need the beat to be yours alone, buy an exclusive licence.

## Exclusive licences

- An exclusive licence **removes the beat from sale permanently**. Nobody can licence it after you.
- Licences sold before yours remain valid. Exclusivity is not retrospective, and we cannot cancel a licence somebody already paid for.
- The exact files and rights included are listed on the licence you buy, and that listing is what governs.

## What every licence allows

Unless your licence says otherwise, you may:

- Record, release and distribute one song using the beat.
- Put that song on streaming services, and monetise it there.
- Perform the song live, including at paid shows.
- Use the song in a music video.

## What no licence allows

- Reselling, re-licensing, giving away or redistributing the beat as a beat, in any form.
- Registering the beat, or any part of it, with a content-identification system (Content ID, YouTube's system, or any equivalent) as your own work.
- Claiming authorship of the underlying composition.
- Using the beat in anything that is unlawful, or that promotes hatred or violence against any group.

## Credit

Unless your licence says otherwise, credit SnareByt in the title or description of any release, in the form **"prod. SnareByt"**.

## Your files

Files are delivered through a private download link that expires and limits how many times it can be used. Download them promptly and keep your own backup. Ask us if a link expires before you have your files — we will issue another.

## Tagged previews

Preview files on this site carry an audio tag. They are for auditioning only and may not be released in any form.

## If something goes wrong

If a beat turns out not to be ours to license, we will refund what you paid for it in full. That refund is the limit of what we owe you for it. Nothing in this agreement excludes liability that cannot lawfully be excluded.

## Governing law

This agreement is governed by the laws of Bangladesh.

Questions: [${EMAIL}](mailto:${EMAIL}).`,
  },

  {
    slug: 'terms',
    title: 'Terms & Conditions',
    body: `These terms cover the use of this website and everything bought through it from ${BUSINESS}.

By placing an order you accept these terms, the [Beat Licensing Agreement](/legal/beat-licensing) where beats are involved, and the [Privacy Policy](/legal/privacy).

## Prices and payment

- Every price is in **Bangladeshi Taka (BDT)** and that is what you are charged.
- Any US dollar figure shown is a conversion for reference only. It is not the amount charged and the rate may differ from your bank's.
- Payment is handled by **SSLCOMMERZ**. Your card details are entered on their systems and are never seen or stored by us.
- An order is only paid once SSLCOMMERZ confirms it to our servers. A message in your browser is not confirmation.

## Beats

Beats are covered by the [Beat Licensing Agreement](/legal/beat-licensing). Read it before buying — particularly the part explaining that a non-exclusive beat stays on sale to other artists.

## Services

Mixing, mastering, cover art, video editing and custom production are booked as packages.

- What each package includes, how long it takes and how many revisions it carries is stated on the package at the time you order, and that is what applies.
- Delivery times start when we have **everything we asked for**, not when you paid. If stems or reference files arrive three days late, delivery moves three days.
- Revisions mean adjustments within the brief you gave. A change of direction — a different concept, a new arrangement, a re-shoot — is new work and is quoted separately.
- You confirm that you own or have permission to use everything you send us.

## What you send us

Do not send material you do not have the right to use. If a claim is made against us because of something you supplied, you are responsible for it.

We keep your project files while the project is open and for a reasonable period afterwards. Keep your own copies; we are not your backup.

## Your account

You are responsible for what happens through your account. Tell us straight away if you think someone else has access to it.

## Availability

We try to keep this site available, but we do not guarantee it. Prices, packages and the beats on sale can change at any time. A change never alters an order already placed — every order records its own prices and terms as they were at the time.

## Ending things

We may refuse or cancel an order, and refund it, if we cannot deliver it or if it would break these terms or the law.

## Governing law

These terms are governed by the laws of Bangladesh.

Questions: [${EMAIL}](mailto:${EMAIL}).`,
  },

  {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `This explains what ${BUSINESS} collects, why, and what you can do about it.

## What we collect

**When you order:** your name, email address, WhatsApp number, country, optionally your artist name, and what you bought. We keep the order itself as a record of the agreement between us.

**When you create an account:** your email address, and a password stored only as an irreversible hash. We cannot read your password and neither can anyone who obtains our database.

**When you send us files or a brief:** whatever you choose to send, kept in private storage that has no public address.

**When you visit:** the page visited, the site that referred you (the site name only, never the full address, because a full address can carry what you searched for), your country, and whether you are on a phone, tablet or desktop. Visits are counted against an identifier that is **re-hashed every day** and cannot be reversed to a person. We do not use advertising cookies and we do not track you across other websites.

## What we do not collect

We never see or store your card details. Payment happens on SSLCOMMERZ's systems.

## Why we hold it

- To deliver what you bought and to support you afterwards.
- To keep proper records of sales, licences and payments, as we are required to.
- To understand roughly how many people visit and what they look at.

We do not sell your information. We do not share it for advertising.

## Who else sees it

Only the services this site is built on, and only what each needs to do its job:

- **SSLCOMMERZ** — payments.
- **Resend** — email delivery.
- **Cloudflare R2** — file storage.
- **Neon** — the database.
- **Vercel** — hosting.

## How long we keep it

Order, payment and licence records are kept as long as the law requires, because a licence you bought has to stay provable. Project files are kept while the project is open and for a reasonable period after delivery. Visit statistics are kept in aggregate.

## What you can ask for

Email [${EMAIL}](mailto:${EMAIL}) and you can ask us to:

- tell you what we hold about you,
- correct anything wrong,
- delete your account and personal details.

Deleting your account does not delete the record of an order or a licence you bought — those have to stay for as long as the law requires, and a licence with no record is not a licence.

## Security

Passwords are hashed with argon2id. Sessions are stored as hashes, so a copy of our database cannot be used to sign in as you. Files you send are stored privately and reached only through links that expire and limit their own use.

## Children

This site is not intended for anyone under 13, and we do not knowingly collect their information.

## Changes

If this policy changes materially we will update the version and the date at the bottom of this page.

Questions: [${EMAIL}](mailto:${EMAIL}).`,
  },

  {
    slug: 'refunds',
    title: 'Refund Policy',
    body: `Written plainly, because a refund policy that needs interpreting is not a policy.

## Beats

Beat licences are **digital goods delivered immediately**, so they are not refundable once the files have been downloaded — the same rule every beat store works to, for the obvious reason.

We will refund in full if:

- You were charged and did not receive your files, and we cannot get them to you.
- The files are faulty or are not what the licence described.
- The beat turns out not to have been ours to license.
- You were charged twice for the same thing.

Buying the wrong licence tier is not a refund, but tell us — we will usually let you pay the difference and upgrade.

## Services

- **Before work starts:** cancel and we refund in full.
- **After work has started:** we refund what has not yet been worked on. What has been done is charged for.
- **After delivery:** the revisions included in your package are how a result that is not right gets fixed. We would rather finish the job properly than refund it.

If we cannot deliver a booking at all, you get everything back.

## Delivery times

A missed delivery date is not by itself a refund — tell us and we will fix the timing. If a deadline is critical, say so **before** you book so we can agree it in writing.

Delivery time starts when we have everything we asked for. If your files arrive late, the date moves.

## How to ask

Email [${EMAIL}](mailto:${EMAIL}) with your order number and what went wrong. We aim to answer within two working days.

Approved refunds go back through SSLCOMMERZ to the method you paid with, in Bangladeshi Taka. Your bank decides how long it takes to appear — usually 5 to 10 working days.

## Chargebacks

If something is wrong, please tell us first. A chargeback raised without contacting us costs us a fee and gets your issue solved more slowly than an email would.

Nothing here removes any right you have under Bangladeshi consumer law.`,
  },

  {
    slug: 'cookies',
    title: 'Cookie Policy',
    body: `Short, because this site uses very few cookies.

## What we use

**Strictly necessary — always on:**

- A **session cookie** when you sign in, so the site knows it is still you. It holds a random token, not your details.
- A **cart** stored in your browser, so what you added is still there when you come back. It stays on your device.

**Counting visits:** we count visitors with an identifier that is re-hashed **every day** and cannot be traced back to a person. There is no advertising cookie, no third-party tracker, and nothing that follows you to other websites.

## What we do not use

- No advertising or retargeting cookies.
- No social media tracking pixels.
- No cross-site profiling.

This is also why you are not shown a consent banner demanding you accept things: there is nothing here to consent to beyond what the site needs to work.

## Cookies set by others

Embedded players — Spotify and YouTube — set their own cookies when you play something, under their own policies. Nothing is embedded until you interact with it.

## Turning them off

Your browser can block or delete cookies. Blocking the session cookie means you will not be able to stay signed in.

Questions: [${EMAIL}](mailto:${EMAIL}).`,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const d of DRAFTS) {
    const existing = await prisma.legalPage.findUnique({ where: { slug: d.slug } });
    if (existing) {
      console.log(`  · /legal/${d.slug} already exists — left exactly as it is`);
      skipped += 1;
      continue;
    }

    await prisma.legalPage.create({
      data: {
        slug: d.slug,
        title: d.title,
        bodyMarkdown: d.body,
        // Always true for a draft nobody qualified has read.
        lawyerReviewNeeded: true,
        version: '1.0',
      },
    });
    console.log(`  ✓ /legal/${d.slug} — ${d.title}`);
    created += 1;
  }

  console.log(`\n${created} created, ${skipped} left alone.`);
  if (created) {
    console.log('\nThese are drafts. They are marked "not lawyer-reviewed" in the admin');
    console.log('and stay that way until someone qualified has actually read them.\n');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

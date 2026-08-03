# Moving SnareByt to Claude Code

You have never used a terminal. That's fine — this is written for that. Follow it
top to bottom and stop at anything that doesn't match; don't improvise past a
step that failed.

Total time to a running site on your own machine: **about an hour**, most of it
waiting for downloads.

---

## Part 1 · Install the two things you need (30 min, once)

### 1. Node.js

Go to **nodejs.org** and download the **LTS** version for Windows. Run the
installer, click Next through everything, accept the defaults.

To check it worked, press `Windows key`, type **PowerShell**, open it, and type:

```
node --version
```

You should see something like `v22.11.0`. If you get an error saying node isn't
recognised, close PowerShell, open it again, and retry — the installer needs a
fresh window.

### 2. Claude Code

In that same PowerShell window:

```
npm install -g @anthropic-ai/claude-code
```

That takes a couple of minutes. Then:

```
claude --version
```

A version number means you're ready.

> **Which Claude plan?** Claude Code runs on Pro and Max subscriptions, and on
> API billing. Pro is enough to start; a project this size will move faster on
> Max. You sign in the first time you run `claude`, in the browser.

---

## Part 2 · Set up the project folder (10 min)

1. Unzip **`snarebyt-project.zip`** somewhere you'll find it. `Documents` is fine.
   Do **not** put it in OneDrive — sync conflicts cause strange errors.
2. Open the folder. You should see:

```
snarebyt-project/
  CLAUDE.md          ← the brief Claude Code reads automatically
  app/               ← the actual code
  reference/         ← your two approved prototypes
  docs/              ← plan and operating guide
```

3. In PowerShell, move into the folder. Type `cd `, then **drag the folder from
   File Explorer into the PowerShell window** (it pastes the path for you), then
   press Enter:

```
cd C:\Users\You\Documents\snarebyt-project
```

---

## Part 3 · Create your free accounts (20 min)

Do these before your first Claude Code session so nothing blocks you.

| Service | Where | What you need from it |
|---|---|---|
| **Neon** (database) | neon.tech | Create a project → copy the connection string |
| **SSLCOMMERZ sandbox** | developer.sslcommerz.com/registration | Store ID + Store Password by email |
| **Resend** (email) | resend.com | An API key |
| **Cloudflare** (files) | cloudflare.com → R2 | Account ID + access keys, two buckets |

Neon is the only one you need today. The rest can wait until the phase that uses
them — Claude Code will tell you when.

Then, in the project folder, open `app\.env.example` in Notepad, **Save As**
`.env` (no name before the dot), and fill in:

- `DATABASE_URL` — the string Neon gave you
- `AUTH_SECRET` — any long random string, at least 32 characters
- `ADMIN_PASSWORD` — the password you'll use to log into your own dashboard

**Never share the `.env` file, never put it in a screenshot, never paste it into
a chat.** It is the keys to your business.

---

## Part 4 · Your first session

In PowerShell, inside the project folder:

```
claude
```

It signs you in, then gives you a prompt. Claude Code automatically reads
`CLAUDE.md`, so it already knows the whole project — the brand, the locked
decisions, the accuracy rules, what's built and what isn't.

**Paste this first:**

```
Read CLAUDE.md, then open reference/SnareByt.html and
reference/SnareByt-Admin.html and study them properly — they are the approved
design and the specification for everything you build.

Then give me:
1. A summary of what already exists in app/ and what is still missing.
2. The order you'd build the missing pieces in.
3. Anything in the existing code you think is wrong or risky.

Don't write any code yet.
```

Read what it says. If the plan looks right, continue. If something sounds off,
say so — it's much cheaper to correct a plan than a build.

**Then get it running:**

```
Set up the project so I can see it locally: install dependencies, push the
Prisma schema to my Neon database, run the seed, and start the dev server.
Walk me through anything I need to do myself, one step at a time.
```

When it finishes you'll be able to open **http://localhost:3000** in your browser
and see your own site, pulling from your own database.

---

## Part 5 · The build, phase by phase

One phase per session. Start a fresh session for each — long sessions get
expensive and lose focus. Paste these as-is.

### Phase 1 — the public site

```
Build the public site pages from the database, exactly matching
reference/SnareByt.html: home, music, beats, services, portfolio, about, contact.

Make them section-driven — each page loads its PageSection rows and maps each
section key to a React component. Use globals.css as it is; the design is
approved and must not change.

Build one page at a time. After each, tell me what to click to check it.
```

### Phase 2 — the rest of the admin

```
Build the remaining admin screens, following the exact pattern in
src/app/admin/releases/ (page.tsx + client form + actions.ts + zod schema):
portfolio, services, orders, projects, customers, settings, emails, theme,
navigation, SEO, history.

reference/SnareByt-Admin.html shows precisely how each should look and behave,
including the media editor with cover upload, focal point, link auto-fetch and
the published/featured/hidden/draft control. Match it.
```

### Phase 3 — cart and payments

```
Build the cart, checkout and SSLCOMMERZ integration in sandbox mode.

The IPN route already exists — review it first and tell me if anything is wrong
before you build around it. Nothing from the browser is trusted; every payment is
re-validated server-side against our own record.

Then test the full flow end to end, including a failed payment and a cancelled
payment, and show me the results.
```

### Phase 4 — licences, downloads, email

```
Build licence PDF generation with the buyer's name, order number and date, both
languages of the terms snapshotted in. Then the secure download route using
DownloadGrant — expiring, attempt-limited, logged. Then the Resend email
templates in the black-and-red identity.

Test that a verified sandbox payment produces a licence, a working download link
and the right emails.
```

### Phase 5 — accounts, legal, launch prep

```
Build customer accounts and the customer dashboard, then the legal pages written
around this actual business — flagging clearly which clauses need a lawyer.

Then run a full pre-launch review: every link, button, form, payment path,
download, and the site on mobile. Give me a checklist with what passed and what
didn't.
```

---

## Part 6 · Going live

When phase 5 is clean:

```
Deploy this to Vercel and walk me through connecting my domain, setting the
environment variables, and switching SSLCOMMERZ from sandbox to live. Tell me
exactly what I need to do in each dashboard.
```

**On launch day, in this order:**

1. Point the domain at Vercel.
2. Set every environment variable in Vercel — the same ones as your `.env`.
3. Log into your admin and **turn on two-factor authentication**. Write the
   backup secret down somewhere offline.
4. Run **one real purchase of a cheap beat with your own card**, confirm the
   licence email and download arrive, then refund yourself.
5. Only then announce it.

---

## Things worth knowing

**Talk to it normally.** "The beat cards look cramped on my phone" works as well
as any technical phrasing. It can see the code; you can see the site. That's a
fair trade.

**Make it prove things.** If it says something works, ask: *"show me the test that
proves that, and run it."* That habit caught several real bugs in this project —
including a leftover fragment that was displaying a release you'd asked to hide.

**Use `/clear` between unrelated tasks.** It resets the conversation and keeps
responses sharp.

**Commit your work.** Ask it to *"set up git and commit this"* early on. Then any
bad change is one command from being undone.

**When something breaks, paste the whole error.** Every red line, not a summary.

**Don't let it skip the accuracy rules.** No invented testimonials, no invented
statistics, no guessed Spotify links. Those are in `CLAUDE.md` and they protect
your name.

---

## If you get stuck

| Problem | Fix |
|---|---|
| `node`/`claude` not recognised | Close PowerShell, open a new one |
| `npm install` fails on permissions | Right-click PowerShell → Run as administrator |
| Can't connect to the database | Check `DATABASE_URL` is one line with no spaces, and that Neon isn't paused |
| Port 3000 already in use | `npx kill-port 3000`, then start again |
| It changed something you liked | `git checkout .` undoes uncommitted changes |
| Genuinely stuck | Paste the error into Claude Code and say what you were doing |

---

## What you're carrying over

Nothing here starts from zero:

- **42-model database schema**, complete, with the bilingual and role constraints
  built in at database level
- **Seed data** with your real catalogue, verified Spotify IDs and exact pricing
- **The security core** — argon2 hashing, hashed sessions, RFC-6238 2FA, lockout,
  role-based access
- **The SSLCOMMERZ IPN route** — the file that decides whether a payment is real
- **R2 storage** with presigned uploads and expiring, attempt-limited downloads
- **The full design system**, ported verbatim from the prototype you approved
- **Two working prototypes** as the specification, so there is no guessing about
  how anything should look or behave

The design decisions are settled. What's left is engineering.

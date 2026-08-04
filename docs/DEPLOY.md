# Going live — GitHub, Vercel, environment

Written for someone who has not deployed a site before. Do it in this order.

---

## 1. The GitHub repo

Create it at **github.com/new** while signed in as **SnareByt**:

- Name: `snarebyt`
- **Private**
- Do **not** add a README, .gitignore or licence — the repo must be empty

The local repo is already committed and its remote already points at
`https://SnareByt@github.com/SnareByt/snarebyt.git`. The username in that URL is
deliberate: Windows Credential Manager keys credentials per user, so this repo
authenticates as SnareByt while `killaz-beatz-website` keeps authenticating as
KillazBeatz. One machine, two GitHub accounts, no switching.

**Do not run `gh auth login` and accept its offer to manage git credentials.**
It installs a global credential helper for github.com, and every repo on the
machine — including Killaz Beatz — would then push as whichever account gh holds.

---

## 2. Vercel

Sign up at **vercel.com** with the SnareByt email, then **Add New → Project →
Import** the `snarebyt` repo.

**Accept every default.** The Next.js project sits at the repo root, so Vercel
detects the framework, build command and output directory on its own. There is
no Root Directory to set.

It used to live in an `app/` subfolder, which meant Root Directory had to be
changed by hand — and a build that silently produces nothing and serves a 404 is
a miserable thing to debug. Moving it to the root removed that step permanently.

`package.json` already runs `prisma generate` before `next build`, which Vercel
requires — without it a cached build would ship a stale Prisma client.

---

## 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. They are
server-side only. Never prefix any of them with `NEXT_PUBLIC_` — that ships the
value to the browser and burns the credential.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string — see below |
| `DIRECT_URL` | Neon direct connection string (the one without `-pooler`) |
| `AUTH_SECRET` | A **new** 32-byte random string, not the local one |
| `ADMIN_EMAIL` | `snarebyt@gmail.com` |
| `ADMIN_PASSWORD` | A **new** password, not the local one |
| `APP_URL` | `https://your-project.vercel.app`, then the real domain |

Generate a fresh `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The local `.env` values are for your machine. Reusing them in production means a
laptop compromise is a production compromise.

### The pooled connection string — this one matters

Neon gives two hostnames for the same database:

```
ep-rough-dust-azqgu58e.c-3.ap-southeast-1.aws.neon.tech           ← direct
ep-rough-dust-azqgu58e-pooler.c-3.ap-southeast-1.aws.neon.tech    ← pooled
```

Vercel runs each request in its own short-lived serverless function. Every one
opens its own database connection, so a burst of traffic against the **direct**
endpoint exhausts Neon's connection limit and requests start failing. The
**pooled** endpoint (`-pooler` in the hostname) exists for exactly this.

Use pooled for `DATABASE_URL`, direct for `DIRECT_URL` — Prisma migrations need
a real session and cannot run through the pooler.

This was observed locally, not guessed: Neon suspended the compute after a period
of inactivity, killed the open connections, and one page request returned a 500
before recovering. On the direct endpoint under real traffic that is not a one-off.

---

## 4. Create the tables on the production database

Once the variables are set, from the project folder on your machine:

```bash
npm run db:push
```

This reads your local `.env`, so temporarily point `DATABASE_URL` at the same
Neon database Vercel uses, or run it from Vercel's CLI. Then seed once:

```bash
npm run db:seed
```

The seed refuses to run without `ADMIN_PASSWORD`. That is deliberate — there is
no default admin password anywhere in this project.

---

## 4b. Going up privately first (recommended)

You do not need the domain to have a fully working live site. Deploy now, keep
it private, attach `snarebyt.com` whenever you are ready. Nothing has to be
rebuilt at that point.

**Make it private.** Settings → Deployment Protection → **Vercel Authentication**,
scope it to **all deployments**. Only someone logged into your Vercel account can
open it. Free on every plan. (*Password Protection* — a shared password with no
Vercel account needed — is the paid tier; you do not need it. To show one person,
generate a temporary shareable link instead.)

**Set these two while private:**

| Variable | Value now |
|---|---|
| `APP_URL` | `https://your-project.vercel.app` |
| `SITE_LIVE` | leave unset, or `false` |

`SITE_LIVE` is the launch switch. While it is anything other than `true`,
`robots.txt` disallows everything and the sitemap is empty, so the preview URL
cannot reach a search index. `APP_URL` matters more than it looks: download
grants are built as `${APP_URL}/download/…`, and it is the base for every
canonical and share-card URL.

### Switching the domain on

1. Vercel → Settings → Domains → add `snarebyt.com`, follow the DNS instructions.
2. Change `APP_URL` to `https://snarebyt.com`.
3. Set `SITE_LIVE` to `true`.
4. **Redeploy.** Environment variables are read at build and run time; changing
   them without redeploying leaves the old values live.
5. Turn Deployment Protection off.

Do those in that order. Turning protection off before the domain is attached
leaves the .vercel.app URL publicly crawlable for however long the gap is.

**The .vercel.app URL keeps working forever.** That is why `robots.txt` disallows
`/admin`, `/api/` and `/download/` even when live, and why every page carries a
canonical URL built from `APP_URL` — so the real domain gets the credit and the
two addresses never compete for the same content.

---

## 5. Before you announce it

1. Sign into `/admin` and **change the admin password**.
2. Turn on **two-factor authentication** in Settings → Security. Write the backup
   secret somewhere offline.
3. Confirm the public site shows nothing you have not approved — every release
   has a live flag and every beat needs its files before it can be published.
4. Only then point the domain at it.

Do not switch SSLCOMMERZ from sandbox to live until a sandbox purchase, a failed
payment and a cancelled payment have all been tested end to end.

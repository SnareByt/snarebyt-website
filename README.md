# SnareByt — project handoff

**Open `START-HERE.md` first.** It walks through installing Node and Claude Code,
setting up the folder, creating accounts, and the exact prompts to paste for each
build phase.

```
CLAUDE.md      Claude Code reads this automatically — the full project brief
START-HERE.md  step-by-step guide for moving this into Claude Code
src/           the Next.js app — pages, components, lib
prisma/        schema (42 models) and the seed
scripts/       check-r2, check-site
reference/     the two approved prototypes — these are the specification
docs/          build plan, deploy guide, operating guide
```

The Next.js project sits at the repo root so Vercel needs no configuration.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run setup        # push the schema, then seed
npm run check:site   # every route responds and the accuracy rules hold
npm run check:r2     # prove the Cloudflare R2 credentials actually work
```

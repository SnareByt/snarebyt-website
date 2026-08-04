// Prisma stops auto-loading .env as soon as a config file exists, so this has
// to be done explicitly — without it `db push` and `db seed` cannot find
// DATABASE_URL and fail with "Environment variable not found".
import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Replaces the `prisma` key in package.json, which is deprecated and removed
 * in Prisma 7.
 *
 * The datasource URL is read straight from the environment rather than through
 * prisma/config's `env()` helper. That helper throws the moment this file is
 * loaded, for every command — including `prisma generate`, which only writes
 * TypeScript and never opens a connection. Vercel runs `prisma generate` during
 * the build, so an over-eager check here would fail the build rather than the
 * thing that actually needs a database.
 *
 * Commands that do connect still fail loudly on an empty string.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});

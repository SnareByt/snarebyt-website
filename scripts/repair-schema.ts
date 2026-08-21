/**
 * ONE-TIME SCHEMA REPAIR
 * ======================
 *
 * Runs during the Vercel build, where DATABASE_URL already lives. Delete this
 * file and the `db:repair &&` from the build script once a deploy has printed
 * "repair complete" — it is a fix for one specific accident, not a permanent
 * part of the pipeline.
 *
 * WHAT WENT WRONG
 *
 * `prisma db push` was run from a branch whose schema predated the artist
 * portal. db:push makes the database match the schema it is given, with no
 * history and no notion of "this branch is older than that one", so it
 * faithfully removed everything the newer schema had added:
 *
 *   · SessionKind was rewritten from ADMIN|ACCOUNT back to WEB|APP
 *   · Session.revokedAt was dropped
 *   · Session.lastSeenAt became NOT NULL
 *   · User.suspendedAt, User.suspendedReason, User.adminNote were dropped
 *
 * The deployed code then wrote kind:'ADMIN' into an enum with no such value,
 * so every request that touched a session threw. The public site absorbed it
 * (AccountButton catches), /app did not.
 *
 * WHY EXPLICIT SQL RATHER THAN `db push --accept-data-loss`
 *
 * That flag would fix this in one line and is the wrong tool. It is a blanket
 * permission to drop anything the schema no longer mentions — the very
 * behaviour that caused this — and leaving it in a build script means the next
 * accidental field removal silently takes a column with it. The statements
 * below can only touch Session and three columns of User. Everything else in
 * the database is unreachable from here, by construction.
 *
 * SAFETY
 *
 *   · Idempotent. IF NOT EXISTS / IF EXISTS throughout; running it twice is a
 *     no-op, which matters because every redeploy runs it again until removed.
 *   · Transactional. Either the whole repair lands or none of it does.
 *   · Fail-soft. If the database is unreachable it logs loudly and exits 0.
 *     A migration that cannot run must never take the site down with it — a
 *     broken /app is survivable, a failed build is not.
 *
 * The only data destroyed is rows in Session, which are disposable by nature:
 * everyone signed in gets signed out and signs back in. That deletion is what
 * makes the enum swap safe, because a row holding 'WEB' cannot be cast to a
 * type that has no such value.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Rebuild the SessionKind enum.
 *
 * Postgres will not remove a value from an enum in place, so the type is
 * renamed, a correct one built beside it, the column moved across and the old
 * one dropped. The USING clause maps every surviving row to ADMIN; there are
 * none, because the sessions are cleared first, and being explicit costs
 * nothing while leaving no room for a silent cast failure.
 */
const REPAIR = [
  `DELETE FROM "Session"`,

  `ALTER TABLE "Session" ALTER COLUMN "kind" DROP DEFAULT`,
  `DROP TYPE IF EXISTS "SessionKind_broken"`,
  `ALTER TYPE "SessionKind" RENAME TO "SessionKind_broken"`,
  `CREATE TYPE "SessionKind" AS ENUM ('ADMIN', 'ACCOUNT')`,
  `ALTER TABLE "Session" ALTER COLUMN "kind" TYPE "SessionKind" USING 'ADMIN'::"SessionKind"`,
  `ALTER TABLE "Session" ALTER COLUMN "kind" SET DEFAULT 'ADMIN'`,
  `DROP TYPE "SessionKind_broken"`,

  // The client axis, which never reached the database at all.
  `DO $$ BEGIN
     CREATE TYPE "SessionClient" AS ENUM ('BROWSER', 'APP');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "client" "SessionClient" NOT NULL DEFAULT 'BROWSER'`,
  `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "label" TEXT`,

  // Dropped by the bad push. revokedAt is how the artist portal signs a device
  // out without erasing the fact that it existed.
  `ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Session" ALTER COLUMN "lastSeenAt" DROP NOT NULL`,

  // Also dropped. Empty now — whatever was in them is gone — but their absence
  // is what breaks every customer screen in the desktop admin.
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminNote" TEXT`,
];

/** Enum values actually present, so the log states fact rather than intent. */
async function enumValues(name: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
    `SELECT e.enumlabel AS v
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder`,
    name,
  );
  return rows.map((r) => r.v);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2`,
    table,
    column,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

(async () => {
  console.log('\n[repair-schema] starting');

  try {
    const before = await enumValues('SessionKind');
    console.log(`[repair-schema] SessionKind is currently: ${before.join(' | ') || '(missing)'}`);

    /* Already correct — the common case on every redeploy after the first.
       Checked rather than assumed, so a redeploy does not clear live sessions
       for no reason. */
    if (before.includes('ADMIN') && (await columnExists('Session', 'client'))) {
      console.log('[repair-schema] nothing to do — repair complete already');
      console.log('[repair-schema] this script can now be removed from the build\n');
      return;
    }

    console.log('[repair-schema] repairing; every signed-in device will need to sign in again');

    /* The array form, so the statements run in order inside one transaction.
       It takes no timeout option — that belongs to the interactive form — and
       does not need one: these are DDL statements against a table with a
       handful of rows. */
    await prisma.$transaction(REPAIR.map((sql) => prisma.$executeRawUnsafe(sql)));

    const after = await enumValues('SessionKind');
    console.log(`[repair-schema] SessionKind is now: ${after.join(' | ')}`);
    console.log(`[repair-schema] Session.client present: ${await columnExists('Session', 'client')}`);
    console.log(`[repair-schema] User.adminNote present: ${await columnExists('User', 'adminNote')}`);
    console.log('[repair-schema] repair complete\n');
  } catch (err) {
    /* Loud, but never fatal. A build that dies here would replace a broken
       /app with a broken everything, and the previous deployment would keep
       serving anyway — so the failure has to be visible in the log without
       being visible to a visitor. */
    console.error('\n[repair-schema] ==========================================');
    console.error('[repair-schema] REPAIR DID NOT RUN. The build continues.');
    console.error('[repair-schema] /app will keep failing until this succeeds.');
    console.error('[repair-schema] Reason:', err instanceof Error ? err.message : err);
    console.error('[repair-schema] ==========================================\n');
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})();

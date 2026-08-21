import 'server-only';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { headers } from 'next/headers';
import { prisma } from './prisma';

/**
 * Passkeys — which on Samir's iPhone means Face ID.
 *
 * The shape of this is worth stating plainly, because "log in with your face"
 * sounds like the face is being sent somewhere. It is not. The private key is
 * generated inside the phone's Secure Enclave and never leaves it; Face ID only
 * unlocks its use. What we store is the matching PUBLIC key. A stolen database
 * therefore contains nothing that can sign a login — unlike a password hash,
 * which can at least be ground at offline.
 *
 * Two properties this buys beyond convenience:
 *
 *  - Phishing resistance. The signature is bound by the browser to the origin
 *    that requested it, so a passkey minted for snarebyt.com cannot be replayed
 *    against snarebyt-admin.example even if Samir is fooled into visiting it.
 *    A TOTP code can be typed into a fake site; this cannot.
 *  - No shared secret in transit. Nothing reusable crosses the network at all.
 *
 * A passkey is an ADDITION, never a replacement: the password and its TOTP stay
 * enrolled and stay sufficient. If the phone is lost, the way back in must not
 * itself be on the lost phone.
 */

/**
 * The relying party ID: the domain the credential is welded to.
 *
 * It has to be the registrable domain — "snarebyt.com", not the full URL and
 * not a path. Getting this wrong does not fail loudly at enrolment; it fails
 * later, when a credential minted under one host silently refuses to
 * authenticate under another.
 *
 * WHY THIS READS THE REQUEST RATHER THAN APP_URL.
 *
 * The obvious implementation derives it from APP_URL, the way the payment
 * callbacks and emails do. That is wrong here, and silently so. APP_URL is
 * deliberately UNSET in production — see siteUrl() in src/lib/seo.ts, which
 * falls back to the request host precisely because this app answers on
 * snarebyt.com, www.snarebyt.com and a permanent *.vercel.app address. An
 * unset APP_URL would make this return "localhost" in production, and every
 * Face ID enrolment would be minted for a domain the phone will never visit.
 * Nothing would error; sign-in would just never work.
 *
 * So: an explicit WEBAUTHN_RP_ID wins if set, then APP_URL if it is set, then
 * the actual host of the request. That last case is the one that runs in
 * production today.
 */
async function hostFromRequest(): Promise<{ id: string; origin: string }> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return { id: host.split(':')[0], origin: `${proto}://${host}` };
}

export async function rpId(): Promise<string> {
  const explicit = process.env.WEBAUTHN_RP_ID?.trim();
  if (explicit) return explicit;

  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).hostname;
    } catch {
      /* fall through to the request */
    }
  }
  return (await hostFromRequest()).id;
}

/**
 * The exact origin the browser will claim in the assertion.
 *
 * WebAuthn compares this string for equality, so port and scheme matter:
 * "http://localhost:3000" and "http://localhost" are different origins and one
 * will not verify against the other.
 */
export async function rpOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to the request */
    }
  }
  return (await hostFromRequest()).origin;
}

const RP_NAME = 'SnareByt Admin';

/**
 * A WebAuthn challenge is single-use and short-lived, and it must be issued and
 * checked server-side — a challenge the client is allowed to choose is not a
 * challenge at all. Ninety seconds is long enough for a Face ID prompt that
 * gets interrupted by a phone call, short enough that a captured one is stale.
 */
const CHALLENGE_TTL_MS = 90_000;

async function putChallenge(id: string, challenge: string) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.authChallenge.upsert({
    where: { id },
    create: { id, challenge, expiresAt },
    update: { challenge, expiresAt },
  });
}

/**
 * Read a challenge and burn it in the same breath.
 *
 * Deleting before verifying rather than after is deliberate: if verification
 * throws, the challenge is still gone, so a failed attempt cannot be retried
 * against it. Expired rows are swept here too, which keeps the table empty
 * without a cron job.
 */
async function takeChallenge(id: string): Promise<string | null> {
  const row = await prisma.authChallenge.findUnique({ where: { id } });
  await prisma.authChallenge.deleteMany({
    where: { OR: [{ id }, { expiresAt: { lt: new Date() } }] },
  });
  if (!row || row.expiresAt < new Date()) return null;
  return row.challenge;
}

const regKey = (userId: string) => `webauthn:reg:${userId}`;
const authKey = (handle: string) => `webauthn:auth:${handle}`;

// ------------------------------------------------------------
//  Enrolment — run from the Account screen, while already signed in
// ------------------------------------------------------------

export async function startPasskeyRegistration(user: { id: string; email: string; name: string | null }) {
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: await rpId(),
    userName: user.email,
    userDisplayName: user.name ?? 'SnareByt',
    // Passkeys are discoverable so the phone can offer the account before an
    // email is typed — the "tap, look, in" flow. Without this the login screen
    // would have to ask who you are first, which on a single-user dashboard is
    // a pointless question.
    attestationType: 'none',
    // Already-enrolled credentials are excluded so the same phone cannot
    // silently register twice and leave two rows that look like two devices.
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as never,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required', // Face ID / passcode, not merely presence
      authenticatorAttachment: 'platform', // this phone, not a roaming key
    },
  });

  await putChallenge(regKey(user.id), options.challenge);
  return options;
}

export type PasskeyResult = { ok: true; label: string } | { ok: false; error: string };

export async function finishPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  label: string,
): Promise<PasskeyResult> {
  const expectedChallenge = await takeChallenge(regKey(userId));
  if (!expectedChallenge) {
    return { ok: false, error: 'That took too long. Tap “Add Face ID” and try again.' };
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: await rpOrigin(),
      expectedRPID: await rpId(),
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, error: 'This device could not be verified. Nothing was saved.' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'This device could not be verified. Nothing was saved.' };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: (credential.transports ?? []) as string[],
      label: label.trim().slice(0, 60) || 'iPhone',
    },
  });

  return { ok: true, label: label.trim().slice(0, 60) || 'iPhone' };
}

// ------------------------------------------------------------
//  Login — Face ID instead of typing a password
// ------------------------------------------------------------

/**
 * Begin a passkey login.
 *
 * `handle` is a random id the client echoes back, not the user's identity. The
 * challenge has to be pinned to something before we know who is logging in,
 * and keying it by email would let anyone confirm which emails have a passkey.
 */
export async function startPasskeyLogin(handle: string) {
  const options = await generateAuthenticationOptions({
    rpID: await rpId(),
    userVerification: 'required',
    // No allowCredentials: the passkey is discoverable, so the phone picks the
    // account itself. Listing credentials here would leak which ones exist to
    // anyone who loads the login screen.
  });
  await putChallenge(authKey(handle), options.challenge);
  return options;
}

export type PasskeyLogin =
  | { ok: true; userId: string; label: string }
  | { ok: false; error: string };

export async function finishPasskeyLogin(
  handle: string,
  response: AuthenticationResponseJSON,
): Promise<PasskeyLogin> {
  const generic = { ok: false as const, error: 'Face ID sign-in failed. Use your password.' };

  const expectedChallenge = await takeChallenge(authKey(handle));
  if (!expectedChallenge) return generic;

  const cred = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
    include: { user: { select: { id: true, role: true, lockedUntil: true } } },
  });
  if (!cred) return generic;

  // A passkey does not bypass the lockout. If the password path is frozen
  // because someone is hammering it, this door is shut too.
  if (cred.user.lockedUntil && cred.user.lockedUntil > new Date()) {
    return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
  }
  if (cred.user.role === 'CUSTOMER') return generic;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: await rpOrigin(),
      expectedRPID: await rpId(),
      requireUserVerification: true,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: Number(cred.counter),
        transports: cred.transports as never,
      },
    });
  } catch {
    return generic;
  }

  if (!verification.verified) return generic;

  /**
   * The signature counter is the clone detector.
   *
   * A genuine authenticator increments it on every assertion. A counter that
   * has gone backwards means two things are signing with the same key, which
   * means the key was extracted. Apple's platform authenticators report a
   * permanent zero, so zero is exempt — enforcing it there would lock Samir out
   * of his own phone on the second login.
   */
  const next = verification.authenticationInfo.newCounter;
  if (next > 0 && next <= Number(cred.counter)) {
    return { ok: false, error: 'This passkey has been refused. Sign in with your password and remove it from Account.' };
  }

  await prisma.webAuthnCredential.update({
    where: { id: cred.id },
    data: { counter: BigInt(next), lastUsedAt: new Date() },
  });

  return { ok: true, userId: cred.user.id, label: cred.label };
}

export async function listPasskeys(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, backedUp: true },
  });
}

export async function removePasskey(userId: string, id: string) {
  const { count } = await prisma.webAuthnCredential.deleteMany({ where: { id, userId } });
  return count > 0;
}

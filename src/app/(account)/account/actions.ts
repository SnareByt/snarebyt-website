'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import {
  registerAccount, issueOtp, verifyOtp, signInAccount,
  issueResetToken, completeReset, signOutAccount, currentAccount,
} from '@/lib/account';
import { passwordProblems, isObviousPassword } from '@/lib/account-rules';
import { sendOtpEmail, sendResetEmail } from '@/lib/account-mail';
import { siteUrl } from '@/lib/seo';
import { prisma } from '@/lib/prisma';
import type { FormState } from './form-state';

/**
 * Server actions for the artist portal's front door.
 *
 * A server action is a public HTTP endpoint, so every one of these validates
 * its own input and re-checks its own authorisation. Nothing here trusts that
 * a page rendered a form correctly.
 *
 * The userId being verified is held in a short-lived httpOnly cookie rather
 * than passed through the form. A hidden field would let anyone submit an
 * arbitrary id and have codes checked against an account of their choosing.
 */

const PENDING = 'sb_pending';
const PENDING_TTL = 60 * 20; // twenty minutes to finish verifying

async function setPending(userId: string, email: string) {
  (await cookies()).set(PENDING, `${userId}:${email}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PENDING_TTL,
  });
}

export async function readPending(): Promise<{ userId: string; email: string } | null> {
  const raw = (await cookies()).get(PENDING)?.value;
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at < 1) return null;
  return { userId: raw.slice(0, at), email: raw.slice(at + 1) };
}

async function clearPending() {
  (await cookies()).delete(PENDING);
}


/* ------------------------------------------------------------------ *
 *  Register
 * ------------------------------------------------------------------ */

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Tell us what to call you').max(120),
  artistName: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone: z.string().trim().max(40).default(''),
  country: z.string().trim().max(80).default(''),
  password: z.string(),
  terms: z.literal('on', { message: 'You need to accept the terms to create an account' }),
});

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const values = { ...raw };
  delete values.password;

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? 'form');
      if (!errors[k]) errors[k] = i.message;
    }
    return { ok: false, errors, values };
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length) {
    return { ok: false, errors: { password: problems.join(' · ') }, values };
  }
  if (isObviousPassword(parsed.data.password)) {
    return {
      ok: false,
      errors: { password: 'That is one of the most-guessed passwords there is. Pick something else.' },
      values,
    };
  }

  const res = await registerAccount({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    artistName: parsed.data.artistName,
    phone: parsed.data.phone,
    country: parsed.data.country,
  });

  if (!res.ok) return { ok: false, message: res.error, values };

  // userId is null when the address already has a verified account. The
  // outcome is identical from here so the form cannot be used to discover who
  // has an account; the real owner signs in or resets instead.
  // Whether the code actually left the building. A failed send used to be
  // swallowed here, which left someone staring at six empty boxes with no
  // code coming and nothing on screen saying so.
  let delivered = true;

  if (res.userId) {
    const otp = await issueOtp(res.userId);
    if (otp.ok) {
      const sent = await sendOtpEmail(parsed.data.email, otp.code);
      delivered = sent.sent;
    } else {
      delivered = false;
    }
    await setPending(res.userId, parsed.data.email);
  } else {
    await setPending('none', parsed.data.email);
  }

  redirect(delivered ? '/account/verify' : '/account/verify?nomail=1');
}

/* ------------------------------------------------------------------ *
 *  Verify
 * ------------------------------------------------------------------ */

export async function verifyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const pending = await readPending();
  if (!pending) {
    return { ok: false, message: 'That took too long. Start again and we will send a fresh code.' };
  }
  // The "already verified" branch of registration parks here with no real
  // account behind it, so the code can never be right. Same wording as a
  // genuine wrong code.
  if (pending.userId === 'none') {
    return { ok: false, message: 'That code is not right, or it has expired. Request a new one.' };
  }

  const code = String(fd.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, message: 'Enter all six digits.' };

  const res = await verifyOtp(pending.userId, code);
  if (!res.ok) return { ok: false, message: res.error };

  await clearPending();
  redirect('/account');
}

export async function resendAction(): Promise<{ ok: boolean; message: string }> {
  const pending = await readPending();
  if (!pending) return { ok: false, message: 'Start again and we will send a fresh code.' };
  if (pending.userId === 'none') {
    // Say the same thing as success. Reporting "no account to send to" here
    // would undo the non-disclosure the register step went to lengths for.
    return { ok: true, message: 'If that address needs a code, one is on its way.' };
  }

  const otp = await issueOtp(pending.userId);
  if (!otp.ok) return { ok: false, message: otp.error };

  const sent = await sendOtpEmail(pending.email, otp.code);
  if (!sent.sent) {
    return { ok: false, message: 'The code could not be sent just now. Try again in a moment.' };
  }
  return { ok: true, message: 'A new code is on its way.' };
}

/* ------------------------------------------------------------------ *
 *  Sign in
 * ------------------------------------------------------------------ */

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const values = { email };

  if (!email || !password) {
    return { ok: false, message: 'Enter your email and password.', values };
  }

  const res = await signInAccount(email, password);

  if (!res.ok && 'needsVerification' in res) {
    // Right password, unverified address. Send a code and continue rather than
    // making them start registration over.
    const otp = await issueOtp(res.userId);
    if (otp.ok) await sendOtpEmail(email, otp.code);
    await setPending(res.userId, email);
    redirect('/account/verify');
  }

  if (!res.ok) return { ok: false, message: res.error, values };

  const next = String(fd.get('next') ?? '');
  // Only ever a path on this site. An open redirect here would let a phishing
  // link bounce someone off a real sign-in to somewhere else entirely.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/account');
}

export async function logoutAction() {
  await signOutAccount();
  redirect('/');
}

/* ------------------------------------------------------------------ *
 *  Password reset
 * ------------------------------------------------------------------ */

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, errors: { email: 'Enter a valid email address' }, values: { email } };
  }

  const issued = await issueResetToken(email);
  if (issued) {
    const base = await siteUrl();
    if (base) await sendResetEmail(email, `${base}/account/reset/${issued.token}`);
  }

  // Always the same answer. "No account with that email" is the same
  // membership oracle the register form avoids.
  return {
    ok: true,
    step: 'sent',
    message: 'If there is an account with that address, a reset link is on its way. It expires in 30 minutes.',
  };
}

export async function resetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get('token') ?? '');
  const password = String(fd.get('password') ?? '');

  const problems = passwordProblems(password);
  if (problems.length) return { ok: false, errors: { password: problems.join(' · ') } };
  if (isObviousPassword(password)) {
    return { ok: false, errors: { password: 'That is one of the most-guessed passwords there is. Pick something else.' } };
  }

  const res = await completeReset(token, password);
  if (!res.ok) return { ok: false, message: res.error };

  // Deliberately does NOT sign them in. Reaching the inbox proves the address,
  // but typing the new password once more proves they know it — and it is the
  // step that stops a reset link forwarded by accident becoming a session.
  redirect('/account/login?reset=1');
}

/** Used by the layout to decide whether to render the signed-in shell. */
export async function whoAmI() {
  return currentAccount();
}

/** Countries offered in the profile form, ordered so the common ones are first. */
export async function countryOptions() {
  const rows = await prisma.order.findMany({
    where: { billingCountry: { not: null } },
    select: { billingCountry: true },
    distinct: ['billingCountry'],
    take: 40,
  });
  const seen = rows.map((r) => r.billingCountry!).filter(Boolean);
  const common = ['Bangladesh', 'India', 'United States', 'United Kingdom', 'Canada', 'Australia'];
  return [...new Set([...common, ...seen.sort()])];
}

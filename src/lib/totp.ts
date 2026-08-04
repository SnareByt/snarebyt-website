import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * RFC 6238 TOTP — no third-party dependency needed. Compatible with
 * Google Authenticator, Authy, 1Password: standard 30s step, 6 digits.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const buf = randomBytes(20);
  let bits = '', out = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v === -1) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: bigint): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const h = createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Accept the current step and one either side — clock drift happens. */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const step = BigInt(Math.floor(Date.now() / 30_000));
  for (const delta of [0n, -1n, 1n]) {
    const expected = hotp(key, step + delta);
    if (expected.length === clean.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, email: string) {
  return `otpauth://totp/SnareByt:${encodeURIComponent(email)}?secret=${secret}&issuer=SnareByt&algorithm=SHA1&digits=6&period=30`;
}

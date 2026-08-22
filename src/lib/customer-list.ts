/**
 * Turning orders into people.
 *
 * Pure functions over plain data — no Prisma, no request — for the same
 * reason discount-rules.ts and site-mode-rules.ts are. The bug this exists to
 * prevent is not a crash: it is a customer appearing twice, or not appearing
 * at all, and that is far easier to prove in a test than to notice on a phone.
 *
 * THE RULE: a person is an ACCOUNT or a GUEST, never both.
 *
 * Most buyers check out without registering, so a list of User rows alone
 * misses most of the people who have actually paid. But someone who bought as
 * a guest and later signed up with the same address has both a User row and
 * guest orders, and showing them twice — once with their account, once as an
 * anonymous buyer — is worse than either mistake on its own.
 *
 * Email is the join, because it is what the licence, the receipt and the
 * download link all key on, and it is compared lower-cased because people
 * type their own address in whatever case their phone decided on.
 */

export type GuestOrder = {
  billingEmail: string;
  billingName: string | null;
  guestName: string | null;
  billingCountry: string | null;
  artistName: string | null;
  totalBdt: number;
  createdAt: Date;
};

export type GuestBuyer = {
  email: string;
  name: string;
  artistName: string | null;
  country: string | null;
  orders: number;
  spent: number;
  last: Date;
};

/**
 * Fold paid guest orders into one row per person, skipping anyone who has an
 * account.
 *
 * `accountEmails` must be EVERY account, not the filtered page of them —
 * otherwise searching for "sam" would hide Sam's account row from the filter
 * and let his guest orders reappear as a second, accountless Sam.
 *
 * `orders` must arrive newest first: the first one seen for an address sets
 * the "last ordered" date, and every later one only adds to the totals.
 */
export function foldGuests(
  accountEmails: readonly string[],
  orders: readonly GuestOrder[],
): GuestBuyer[] {
  const known = new Set(accountEmails.map((e) => e.toLowerCase()));
  const by = new Map<string, GuestBuyer>();

  for (const o of orders) {
    const key = o.billingEmail.toLowerCase();
    if (known.has(key)) continue;

    const hit = by.get(key);
    if (hit) {
      hit.orders += 1;
      hit.spent += o.totalBdt;
      // Only fills a gap. The newest order already set it if it had one, and
      // an older order must not overwrite a current artist name.
      hit.artistName ??= o.artistName;
    } else {
      by.set(key, {
        email: o.billingEmail,
        name: o.billingName || o.guestName || o.billingEmail,
        artistName: o.artistName,
        country: o.billingCountry,
        orders: 1,
        spent: o.totalBdt,
        last: o.createdAt,
      });
    }
  }

  // Biggest spender first: on a phone the top of the list is the part that
  // gets read, and "who matters most" is a better default than "who is newest".
  return [...by.values()].sort((a, b) => b.spent - a.spent);
}

/** Does a guest match what was typed in the search box? */
export function guestMatches(g: GuestBuyer, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${g.name} ${g.email} ${g.artistName ?? ''}`.toLowerCase().includes(needle);
}

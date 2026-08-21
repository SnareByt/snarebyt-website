/**
 * Turning what the edge knows about a visit into words a person reads.
 *
 * WHAT IS ACTUALLY AVAILABLE, stated plainly, because the honest limit here
 * matters more than the feature:
 *
 * Vercel resolves the visitor's IP at the edge and hands us a country code, a
 * subdivision code, a city, a timezone and an approximate latitude/longitude.
 * That is the whole list. It is **IP geolocation**, and IP geolocation cannot
 * see a neighbourhood.
 *
 * So Mirpur, Banani, Rampura and Uttara are not obtainable. Every one of them
 * resolves to "Dhaka" and nothing finer, and on a mobile network it is often
 * worse than that: Grameenphone and Robi route through a handful of gateways,
 * so someone sitting in Uttara can appear in central Dhaka, or in another
 * district entirely. Broadband is better but still only city-accurate.
 *
 * The only ways to get a neighbourhood are to ask the visitor for GPS
 * permission — which is intrusive, which almost everyone declines, and which
 * would be a strange thing for a music site to request — or to ask them to
 * type it. Neither is worth doing, and inventing the detail would be worse
 * than not having it: a dashboard that confidently says "Banani" when it is
 * guessing is a dashboard that gets acted on.
 *
 * What this file does instead is make the real data readable: full country
 * names rather than two-letter codes, subdivision names where the platform
 * gives a recognisable one, and a clear "unknown" where nothing was resolved.
 */

/**
 * Full country name from an ISO 3166-1 alpha-2 code.
 *
 * Intl.DisplayNames rather than a hand-kept list of 250 countries: the data
 * ships with Node and the browser, it is already translated, and a list
 * maintained by hand is a list that goes stale and mislabels somebody's
 * country.
 */
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryName(code: string | null | undefined): string {
  const raw = (code ?? '').trim().toUpperCase();
  if (!raw || raw === '—') return 'Unknown';
  // Only well-formed alpha-2 codes; anything else is passed through as-is so a
  // surprise value is visible rather than silently renamed.
  if (!/^[A-Z]{2}$/.test(raw)) return raw;
  try {
    return countryNames.of(raw) ?? raw;
  } catch {
    return raw;
  }
}

/**
 * Bangladesh's divisions, because this is where the audience is and the code
 * on its own says nothing.
 *
 * Vercel sends the ISO 3166-2 subdivision code — for Bangladesh a single
 * letter. Elsewhere the code is usually already readable (CA, NY, ENG), so
 * anything not listed is returned unchanged rather than guessed at.
 */
const BD_DIVISIONS: Record<string, string> = {
  A: 'Barisal', B: 'Chittagong', C: 'Dhaka', D: 'Khulna',
  E: 'Rajshahi', F: 'Rangpur', G: 'Sylhet', H: 'Mymensingh',
};

export function regionName(
  code: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const raw = (code ?? '').trim();
  if (!raw) return null;
  if ((country ?? '').toUpperCase() === 'BD') return BD_DIVISIONS[raw.toUpperCase()] ?? raw;
  return raw;
}

/**
 * One line describing where a visit came from.
 *
 * City first because it is the most specific thing that is actually true, then
 * the division, then the country in full. Anything missing is left out rather
 * than filled with a placeholder — "Unknown, Unknown, Bangladesh" reads like a
 * bug.
 */
export function placeLine(v: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  const parts: string[] = [];

  const city = (v.city ?? '').trim();
  if (city) parts.push(city);

  const region = regionName(v.region, v.country);
  // A division that merely repeats the city adds nothing: "Dhaka, Dhaka".
  if (region && region.toLowerCase() !== city.toLowerCase()) parts.push(region);

  const country = (v.country ?? '').trim();
  if (country) parts.push(countryName(country));

  return parts.length ? parts.join(', ') : 'Unknown location';
}

/** The local time where a visitor is, from the IANA zone the edge resolved. */
export function localTime(timezone: string | null | undefined, at: Date = new Date()): string | null {
  const zone = (timezone ?? '').trim();
  if (!zone) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: zone,
    }).format(at);
  } catch {
    // An unrecognised zone must not take a dashboard down over a clock.
    return null;
  }
}

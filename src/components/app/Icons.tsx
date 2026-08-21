/**
 * The phone dashboard's icon set.
 *
 * Hand-drawn on a 24-grid rather than pulled from a package. Three reasons,
 * all of which matter more than the half hour saved:
 *
 *  - An icon font or SVG sprite is another network request on a cellular
 *    connection in Dhaka, and these are inlined into the HTML that was going
 *    to be sent anyway.
 *  - Icon libraries have a house style. The desktop admin uses bare glyphs
 *    (♫, ◉, ▣) and the public site is Syne and chrome gradients; a set of
 *    rounded Material icons would look borrowed on both.
 *  - `currentColor` and a 1.6 stroke throughout means the tab bar's active
 *    state is one CSS rule, not a second set of filled variants.
 *
 * Stroke weight is deliberately 1.6 rather than the more common 2. At 22px on
 * a 3× display a 2px stroke reads as heavy next to Archivo's interface text.
 */

type P = { className?: string };

const svg = (children: React.ReactNode) => {
  const Icon = ({ className }: P) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  return Icon;
};

/* ---------- Tab bar ---------- */

export const IcHome = svg(
  <>
    <path d="M3.5 10.4 12 3.8l8.5 6.6V19a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 19z" />
    <path d="M9.4 20.6v-6.2h5.2v6.2" />
  </>,
);

export const IcBeats = svg(
  <>
    <path d="M9 18V5.6l10-2v12" />
    <circle cx="6.4" cy="18" r="2.6" />
    <circle cx="16.4" cy="15.6" r="2.6" />
  </>,
);

export const IcOrders = svg(
  <>
    <path d="M3.6 6.4h16.8l-1.4 12a1.6 1.6 0 0 1-1.6 1.4H6.6a1.6 1.6 0 0 1-1.6-1.4z" />
    <path d="M8.4 9.4V6.2a3.6 3.6 0 0 1 7.2 0v3.2" />
  </>,
);

export const IcSite = svg(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.4 12h17.2" />
    <path d="M12 3.4a13.4 13.4 0 0 1 0 17.2 13.4 13.4 0 0 1 0-17.2z" />
  </>,
);

export const IcMore = svg(
  <>
    <circle cx="5.2" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18.8" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </>,
);

/* ---------- Navigation ---------- */

export const IcBack = svg(<path d="M14.6 5.4 8 12l6.6 6.6" />);
export const IcNext = svg(<path d="M9.4 5.4 16 12l-6.6 6.6" />);
export const IcClose = svg(
  <>
    <path d="M6.4 6.4 17.6 17.6" />
    <path d="M17.6 6.4 6.4 17.6" />
  </>,
);
export const IcPlus = svg(
  <>
    <path d="M12 5.4v13.2" />
    <path d="M5.4 12h13.2" />
  </>,
);
export const IcSearch = svg(
  <>
    <circle cx="10.8" cy="10.8" r="6.4" />
    <path d="M15.6 15.6 20 20" />
  </>,
);

/* ---------- Domain ---------- */

export const IcRelease = svg(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="2.4" />
  </>,
);

export const IcPortfolio = svg(
  <>
    <rect x="3.6" y="5.4" width="16.8" height="13.2" rx="2" />
    <path d="M3.6 15.2 8.4 11l4 3.4 3.2-2.6 4.8 4" />
    <circle cx="9" cy="9" r="1.2" />
  </>,
);

export const IcService = svg(
  <>
    <path d="M12 3.4 14.5 9l6 .5-4.6 3.9 1.4 5.9L12 16.2l-5.3 3.1 1.4-5.9L3.5 9.5l6-.5z" />
  </>,
);

export const IcProject = svg(
  <>
    <path d="M3.6 7.4a1.8 1.8 0 0 1 1.8-1.8h3.4l1.8 2.4h7.4a1.8 1.8 0 0 1 1.8 1.8v7.8a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z" />
  </>,
);

export const IcCustomer = svg(
  <>
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M5 19.6a7 7 0 0 1 14 0" />
  </>,
);

export const IcMedia = svg(
  <>
    <rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2" />
    <path d="M3.6 15.4 8.8 10.6l3.8 3.4 2.8-2.4 5 4.2" />
    <circle cx="8.6" cy="8.8" r="1.3" />
  </>,
);

export const IcAnalytics = svg(
  <>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16.4v-4.8" />
    <path d="M12.4 16.4V7.6" />
    <path d="M16.8 16.4v-7" />
  </>,
);

export const IcSettings = svg(
  <>
    <circle cx="12" cy="12" r="2.9" />
    <path d="M18.9 14.4a1.5 1.5 0 0 0 .3 1.65l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.8 1.8 0 1 1-3.6 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.17a1.8 1.8 0 1 1 0-3.6h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.8 1.8 0 1 1 7.25 4.84l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.17a1.8 1.8 0 1 1 3.6 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.17a1.8 1.8 0 1 1 0 3.6h-.09a1.5 1.5 0 0 0-1.37.9z" />
  </>,
);

export const IcLock = svg(
  <>
    <rect x="4.6" y="10.4" width="14.8" height="9.4" rx="2" />
    <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
  </>,
);

export const IcBell = svg(
  <>
    <path d="M18 8.8a6 6 0 0 0-12 0c0 6-2.4 7.6-2.4 7.6h16.8S18 14.8 18 8.8" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </>,
);

export const IcUpload = svg(
  <>
    <path d="M4.6 15.4v3a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8v-3" />
    <path d="M8.4 8.4 12 4.6l3.6 3.8" />
    <path d="M12 4.6v10.6" />
  </>,
);

export const IcCheck = svg(<path d="M5 12.6 9.6 17 19 6.6" />);

export const IcWarn = svg(
  <>
    <path d="M12 4.2 21 19.6H3z" />
    <path d="M12 10v3.6" />
    <circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none" />
  </>,
);

export const IcMoney = svg(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 6.8v10.4" />
    <path d="M14.6 9.4a2.6 2.6 0 0 0-2.6-1.6h-.4a2.2 2.2 0 0 0 0 4.4h1a2.2 2.2 0 0 1 0 4.4h-.4a2.6 2.6 0 0 1-2.6-1.6" />
  </>,
);

export const IcFile = svg(
  <>
    <path d="M13.4 3.6H6.8A1.8 1.8 0 0 0 5 5.4v13.2a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V9z" />
    <path d="M13.4 3.6V9H19" />
  </>,
);

export const IcSpotify = svg(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M7.8 9.6c2.9-.8 5.9-.5 8.4.9" />
    <path d="M8.4 12.4c2.4-.6 4.9-.4 7 .8" />
    <path d="M9 15.1c1.9-.5 3.9-.3 5.6.6" />
  </>,
);

export const IcYouTube = svg(
  <>
    <rect x="3" y="6" width="18" height="12" rx="3.4" />
    <path d="M10.6 9.6 15 12l-4.4 2.4z" fill="currentColor" stroke="none" />
  </>,
);

export const IcFaceId = svg(
  <>
    <path d="M4 8.4V6.2A2.2 2.2 0 0 1 6.2 4h2.2" />
    <path d="M15.6 4h2.2A2.2 2.2 0 0 1 20 6.2v2.2" />
    <path d="M20 15.6v2.2a2.2 2.2 0 0 1-2.2 2.2h-2.2" />
    <path d="M8.4 20H6.2A2.2 2.2 0 0 1 4 17.8v-2.2" />
    <path d="M8.8 9.6v1.8" />
    <path d="M15.2 9.6v1.8" />
    <path d="M12 9.8v3.4h-1.2" />
    <path d="M9.2 15.6a4 4 0 0 0 5.6 0" />
  </>,
);

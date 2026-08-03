/**
 * SNAREBYT wordmark.
 *
 * One locked unit — never split, never re-typed in a font. Syne ExtraBold
 * caps with forced tracking (textLength + lengthAdjust) so it cannot reflow,
 * a five-stop chrome gradient, a second copy carrying an animated light sweep,
 * a three-bar red waveform tick, and a red rule that extends on hover.
 *
 * `idPrefix` exists because SVG gradient ids are document-global: the nav and
 * the footer both render this, and duplicate ids would make one of them
 * inherit the other's gradient.
 */
export function Wordmark({ idPrefix, large = false }: { idPrefix: string; large?: boolean }) {
  const c = `${idPrefix}-chrome`;
  const s = `${idPrefix}-sweep`;
  const r = `${idPrefix}-rule`;

  return (
    <svg
      className={large ? 'wm wm-lg' : 'wm'}
      viewBox="0 0 306 46"
      role="img"
      aria-label="SnareByt"
    >
      <defs>
        <linearGradient id={c} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#d6d6dd" />
          <stop offset="50%" stopColor="#74747f" />
          <stop offset="64%" stopColor="#f6f6f9" />
          <stop offset="100%" stopColor="#8d8d98" />
        </linearGradient>
        <linearGradient id={s} x1="-.6" y1="0" x2="-.1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity=".9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          <animate attributeName="x1" values="-.6;1.1;1.1" dur="6s" repeatCount="indefinite" />
          <animate attributeName="x2" values="-.1;1.6;1.6" dur="6s" repeatCount="indefinite" />
        </linearGradient>
        <linearGradient id={r} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF2D4A" />
          <stop offset="70%" stopColor="#8A0F20" />
          <stop offset="100%" stopColor="#8A0F20" stopOpacity="0" />
        </linearGradient>
      </defs>
      <text className="wm-t" x="0" y="31" textLength="288" lengthAdjust="spacing" fill={`url(#${c})`}>
        SNAREBYT
      </text>
      <text className="wm-t" x="0" y="31" textLength="288" lengthAdjust="spacing" fill={`url(#${s})`}>
        SNAREBYT
      </text>
      <g className="wm-tick" fill="#FF2D4A">
        <rect x="292" y="6" width="3" height="10" rx="1.5" />
        <rect x="298" y="1" width="3" height="20" rx="1.5" />
        <rect x="304" y="9" width="3" height="5" rx="1.5" />
      </g>
      <rect className="wm-rule" x="0" y="39" width="288" height="1.6" rx=".8" fill={`url(#${r})`} />
    </svg>
  );
}

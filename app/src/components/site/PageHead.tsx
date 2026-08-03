/**
 * The header block every page except home shares: eyebrow, two-part headline,
 * intro line. Values come from that page's `head` section, so all four strings
 * are editable in the dashboard.
 */
export function PageHead({
  eyebrow,
  h1,
  h2,
  lead,
}: {
  eyebrow?: string;
  h1?: string;
  h2?: string;
  lead?: string;
}) {
  return (
    <div className="page-head">
      <div className="wrap">
        <div
          className="orb"
          style={{ width: 480, height: 480, background: 'rgba(224,27,54,.15)', top: '-36%', left: '-8%' }}
        />
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="display" style={{ margin: '1.1rem 0' }}>
          {h1}
          {h2 ? <><br /><span className="serif redtext">{h2}</span></> : null}
        </h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
    </div>
  );
}

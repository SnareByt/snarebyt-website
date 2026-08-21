/**
 * The small slice of Markdown a legal page needs.
 *
 * Headings, paragraphs, bullet and numbered lists, bold, italic, inline code
 * and links. Not a general Markdown engine and not trying to be — this exists
 * so terms and privacy pages can be written in the admin without a dependency,
 * and every feature it does not have is one fewer way to break a page that
 * people are legally held to.
 *
 * SECURITY: the input is escaped BEFORE any markup is produced, so a `<script>`
 * typed into the admin renders as visible text rather than running. The escape
 * happens first and nothing after it can reintroduce a raw angle bracket. Link
 * hrefs are additionally restricted to http, https and mailto, because
 * `javascript:` in a Markdown link is the one place this shape of renderer
 * usually leaks.
 *
 * Pure, so it can be proven in a test rather than eyeballed in a browser.
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** http(s) and mailto only. Anything else renders as plain text, not a link. */
const safeHref = (raw: string): string | null => {
  const href = raw.trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
};

/** Inline formatting, applied to already-escaped text. */
function inline(escaped: string): string {
  return escaped
    // [label](href) — before emphasis, so underscores inside a URL survive.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
      const safe = safeHref(href);
      return safe
        ? `<a href="${safe}" rel="noopener noreferrer">${label}</a>`
        : whole;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/**
 * Markdown to HTML.
 *
 * The result is safe to pass to dangerouslySetInnerHTML: everything came from
 * escapeHtml, and the only tags are the ones this function wrote itself.
 */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source ?? '').split(/\r?\n/);
  const out: string[] = [];

  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closePara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const openList = (kind: 'ul' | 'ol') => {
    if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) { closePara(); closeList(); continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closePara(); closeList();
      const level = heading[1].length + 1; // '#' is the page's h1 slot → h2
      const tag = `h${Math.min(level, 6)}`;
      out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      closePara(); closeList();
      out.push('<hr />');
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      closePara(); openList('ul');
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      closePara(); openList('ol');
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    para.push(line);
  }

  closePara();
  closeList();
  return out.join('\n');
}

/** First paragraph, flattened — for a meta description. */
export function firstParagraph(source: string, max = 160): string {
  for (const block of (source ?? '').split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || text.startsWith('#')) continue;
    const flat = text.replace(/[*`_>#-]/g, '').replace(/\s+/g, ' ').trim();
    if (flat) return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
  }
  return '';
}

/**
 * The Markdown renderer behind /legal/[slug].
 *
 * Its output goes to dangerouslySetInnerHTML, so the failure worth proving
 * against is not a wonky bullet list — it is a script tag reaching a visitor's
 * browser, or a `javascript:` link on the page that states SnareByt's terms.
 * Escaping happens before any markup is produced, and these checks are what
 * say so.
 *
 *   npx tsx scripts/check-markdown.ts
 */
import { renderMarkdown, firstParagraph } from '../src/lib/markdown';

let failures = 0;
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => { console.log(`  ✗ ${m}`); failures += 1; };
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass(name) : fail(`${name}${detail ? `\n      ${detail}` : ''}`);

console.log('\nNothing typed into the admin can execute\n');

const attacks: [string, string][] = [
  ['a script tag', '<script>alert(1)</script>'],
  ['an image error handler', '<img src=x onerror="alert(1)">'],
  ['an inline event on a div', '<div onclick="alert(1)">click</div>'],
  ['an iframe', '<iframe src="https://evil.example"></iframe>'],
  ['a style block', '<style>body{display:none}</style>'],
  ['a closing tag mid-sentence', 'we reserve </p><script>alert(1)</script> the right'],
];
// The only tags allowed out of here are the ones the renderer writes itself.
// An escaped "onerror=&quot;" is inert text, so the check is about raw angle
// brackets — anything that survived as a real tag — not about the words.
const ALLOWED = /^(p|h[2-6]|ul|ol|li|strong|em|code|hr ?\/?|a [^<>]*|\/(p|h[2-6]|ul|ol|li|strong|em|code|a))$/;
const strayTags = (html: string): string[] =>
  [...html.matchAll(/<([^<>]*)>/g)].map((m) => m[1]).filter((t) => !ALLOWED.test(t));

for (const [label, input] of attacks) {
  const html = renderMarkdown(input);
  const stray = strayTags(html);
  ok(`${label} is rendered as text, not markup`, stray.length === 0,
    stray.length ? `escaped through as tags: ${JSON.stringify(stray)}\n      ${html}` : '');
}
ok('the dangerous input is still visible as escaped text',
  renderMarkdown('<img src=x onerror="alert(1)">').includes('&lt;img'));

console.log('\nLinks cannot become code\n');

const jsLink = renderMarkdown('[click me](javascript:alert(1))');
ok('a javascript: link does not become an anchor', !/<a /i.test(jsLink), jsLink);
ok('…and its text is still readable', jsLink.includes('click me'));

for (const scheme of ['data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)', 'file:///etc/passwd']) {
  const html = renderMarkdown(`[x](${scheme})`);
  ok(`${scheme.split(':')[0]}: is refused as a link`, !/<a /i.test(html), html);
}

const good = renderMarkdown('[our terms](https://snarebyt.com/legal/terms)');
ok('an https link works', good.includes('<a href="https://snarebyt.com/legal/terms"'), good);
ok('…and carries rel="noopener noreferrer"', good.includes('rel="noopener noreferrer"'));
ok('a mailto link works', renderMarkdown('[mail](mailto:a@b.com)').includes('<a href="mailto:a@b.com"'));

console.log('\nThe formatting a legal page actually needs\n');

const doc = renderMarkdown(`# Terms of Service

These terms apply to every order.

## 1. Licences

- Non-exclusive licences leave the beat on sale.
- Exclusive licences take it off sale **permanently**.

1. First numbered point
2. Second numbered point

---

Contact *us* with \`support\` questions.`);

ok('# becomes an h2, not a second h1 on the page', doc.includes('<h2>Terms of Service</h2>'), doc);
ok('## becomes an h3', doc.includes('<h3>1. Licences</h3>'));
ok('paragraphs are wrapped', doc.includes('<p>These terms apply to every order.</p>'));
ok('bullets become a ul', doc.includes('<ul>') && doc.includes('<li>Non-exclusive licences leave the beat on sale.</li>'));
ok('numbers become an ol', doc.includes('<ol>') && doc.includes('<li>First numbered point</li>'));
ok('bold works', doc.includes('<strong>permanently</strong>'));
ok('italic works', doc.includes('<em>us</em>'));
ok('inline code works', doc.includes('<code>support</code>'));
ok('a rule becomes an hr', doc.includes('<hr />'));

// Every tag opened has to be closed, or the rest of the page inherits the
// list — a stray <ul> swallows the footer.
const opens = (doc.match(/<(ul|ol|p|h2|h3)>/g) ?? []).length;
const closes = (doc.match(/<\/(ul|ol|p|h2|h3)>/g) ?? []).length;
ok('every block tag is closed', opens === closes, `opened ${opens}, closed ${closes}`);

console.log('\nAwkward input does not produce broken markup\n');

ok('empty input gives empty output', renderMarkdown('') === '');
ok('only whitespace gives empty output', renderMarkdown('   \n\n  \n') === '');
const unclosed = renderMarkdown('- one\n- two');
ok('a list at the end of the document is closed', unclosed.trimEnd().endsWith('</ul>'), unclosed);
const mixed = renderMarkdown('- bullet\n1. number');
ok('switching list type closes the first list',
  mixed.includes('</ul>') && mixed.includes('<ol>'), mixed);
ok('an ampersand is escaped once, not twice',
  renderMarkdown('Terms & conditions').includes('Terms &amp; conditions'));
ok('a quote mark is escaped', renderMarkdown('say "no"').includes('&quot;'));
ok('a bare < is escaped', renderMarkdown('under 5 < 10').includes('&lt;'));

console.log('\nThe meta description\n');

ok('skips the heading and uses the first real paragraph',
  firstParagraph('# Terms\n\nThese terms apply to every order.') === 'These terms apply to every order.',
  firstParagraph('# Terms\n\nThese terms apply to every order.'));
ok('is truncated with an ellipsis', firstParagraph(`# T\n\n${'x'.repeat(300)}`).endsWith('…'));
ok('respects the length cap', firstParagraph(`# T\n\n${'x'.repeat(300)}`).length <= 160);
ok('an empty document gives an empty description', firstParagraph('') === '');
ok('a heading-only document gives an empty description', firstParagraph('# Only a heading') === '');

console.log(failures ? `\n${failures} failure(s).\n` : '\nAll markdown checks passed.\n');
process.exit(failures ? 1 : 0);

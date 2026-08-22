import 'server-only';
import 'regenerator-runtime/runtime';

import { createHash } from 'crypto';
import path from 'path';
import { readFile } from 'fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { PDFDocument, PDFPage, PDFFont, rgb, type RGB } from 'pdf-lib';
import { prisma } from './prisma';
import { putPrivateObject } from './storage';

const fontPath = (name: string) => path.join(process.cwd(), 'src', 'assets', 'fonts', name);
const LATIN_REGULAR = fontPath('NotoSans-Regular.ttf');
const LATIN_BOLD = fontPath('NotoSans-Bold.ttf');
const BENGALI = fontPath('NotoSansBengali-Regular.ttf');
// The brand faces. Syne carries the wordmark and headings exactly as it does
// on the site; Archivo carries labels and micro-caps. Body copy stays on Noto
// Sans, which has the widest glyph coverage — a licensee's name can contain
// accents that a display face may not include, and a missing glyph in a legal
// document is worse than a slightly less branded paragraph.
const SYNE = fontPath('Syne-ExtraBold.ttf');
const ARCHIVO = fontPath('Archivo-Regular.ttf');
const ARCHIVO_BOLD = fontPath('Archivo-Bold.ttf');

export type LicencePdfData = {
  number: string;
  orderNumber: string;
  licenseeName: string;
  licenseeEmail: string;
  licenseeArtist?: string | null;
  licenseeCountry?: string | null;
  beatTitle: string;
  tierName: string;
  purchasedAt: Date;
  priceBdt: number;
  isExclusive: boolean;
  transfersOwnership: boolean;
  filesLabel: string;
  performanceRights: string;
  creditRequired: boolean;
  termsEnglish: string;
  termsBangla: string;

  /** Null means unlimited throughout — the same convention as LicenceTier. */
  streamLimit?: number | null;
  saleLimit?: number | null;
  videoLimit?: number | null;
  radioStations?: number | null;
  monetisation?: boolean;
  /** White on black by default; set for a version that prints on paper. */
  theme?: 'dark' | 'print';
};

/** How a limit reads on the page. Null is unlimited, 0 is genuinely none. */
const limitText = (n: number | null | undefined, one: string, many: string) => {
  if (n === null || n === undefined) return `Unlimited ${many}`;
  if (n === 0) return `No ${many}`;
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
};

const W = 595.28;
const H = 841.89;
const M = 54;

/* The page is black, as the site is.
 *
 * The trade-off is real and worth naming: a black contract costs a cartridge
 * to print and photocopies badly. It is served and read on a screen — from the
 * download link, attached to an email, opened on a phone — and on a screen it
 * looks like the brand rather than like a bank statement. If a printable copy
 * is ever needed, PRINT_THEME below is the same document on white; nothing
 * about the layout assumes one or the other.
 *
 * Every colour is a token from globals.css so the document and the site cannot
 * drift apart. */
type Theme = {
  paper: RGB; text: RGB; muted: RGB; faint: RGB;
  line: RGB; card: RGB; cardLine: RGB; red: RGB; redSoft: RGB;
};

const DARK: Theme = {
  paper: rgb(0.031, 0.031, 0.039),   // #08080A
  text: rgb(0.949, 0.949, 0.965),    // #F2F2F6
  muted: rgb(0.62, 0.63, 0.68),
  faint: rgb(0.42, 0.43, 0.48),
  line: rgb(0.16, 0.165, 0.19),
  card: rgb(0.063, 0.063, 0.075),
  cardLine: rgb(0.20, 0.205, 0.235),
  red: rgb(1, 0.176, 0.29),          // --red-bright #FF2D4A, legible on black
  redSoft: rgb(0.878, 0.106, 0.212), // --red #E01B36
};

const PRINT_THEME: Theme = {
  paper: rgb(1, 1, 1),
  text: rgb(0.016, 0.016, 0.02),
  muted: rgb(0.38, 0.4, 0.46),
  faint: rgb(0.52, 0.54, 0.58),
  line: rgb(0.86, 0.87, 0.9),
  card: rgb(0.975, 0.976, 0.982),
  cardLine: rgb(0.86, 0.87, 0.9),
  red: rgb(0.878, 0.106, 0.212),
  redSoft: rgb(0.878, 0.106, 0.212),
};

/**
 * Letter-spaced text. pdf-lib has no tracking option, so each glyph is placed
 * individually — the wide micro-caps are a signature of this brand's interface
 * type and the document looks generic without them.
 */
function tracked(
  page: PDFPage,
  text: string,
  o: { x: number; y: number; size: number; font: PDFFont; color: RGB; spacing: number },
) {
  let x = o.x;
  for (const ch of text) {
    page.drawText(ch, { x, y: o.y, size: o.size, font: o.font, color: o.color });
    x += o.font.widthOfTextAtSize(ch, o.size) + o.spacing;
  }
}

/** Width the tracked() helper will actually occupy, for right-alignment. */
function trackedWidth(text: string, font: PDFFont, size: number, spacing: number) {
  return [...text].reduce((w, ch) => w + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) { out.push(''); continue; }
    const words = paragraph.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
      else { out.push(current); current = word; }
    }
    if (current) out.push(current);
  }
  return out;
}

/**
 * The Bangla terms, rendered through HarfBuzz-backed canvas.
 *
 * pdf-lib's text layer does not shape Indic scripts reliably — conjuncts and
 * vowel marks land in the wrong place — so this draws real shaped text and
 * embeds it as a crisp 2x image.
 *
 * It returns one image PER PAGE rather than a single tall one. The previous
 * version drew the whole block at a fixed origin, so terms longer than about
 * thirty-five lines ran off the bottom of the sheet and simply vanished. The
 * current terms fit, but a lawyer review makes terms longer, not shorter, and
 * silently losing the Bangla half of a bilingual contract is exactly the
 * failure this document exists to prevent.
 */
async function renderBanglaTerms(body: string, maxRowsPerPage: number, ink: string, accent: string) {
  const family = 'SnareByt Noto Bengali';
  GlobalFonts.registerFromPath(BENGALI, family);
  const scale = 2;
  const width = Math.round((W - M * 2) * scale);

  // Measure first, on a throwaway canvas.
  const measure = createCanvas(width, 10).getContext('2d');
  measure.font = `20px "${family}"`;
  const rows: string[] = [];
  for (const paragraph of body.split(/\r?\n/)) {
    if (!paragraph.trim()) { rows.push(''); continue; }
    const words = paragraph.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (measure.measureText(next).width <= width - 58 || !current) current = next;
      else { rows.push(current); current = word; }
    }
    if (current) rows.push(current);
  }

  const chunks: { png: Buffer; width: number; height: number }[] = [];
  for (let i = 0; i < Math.max(1, rows.length); i += maxRowsPerPage) {
    const slice = rows.slice(i, i + maxRowsPerPage);
    const isFirst = i === 0;
    const top = isFirst ? 76 : 20;
    const height = top + slice.length * 35;
    const canvas = createCanvas(width, height);
    const draw = canvas.getContext('2d');
    if (isFirst) {
      draw.font = `700 31px "${family}"`;
      draw.fillStyle = ink;
      draw.fillText('বাংলায় শর্তাবলি', 0, 33);
    }
    draw.font = `20px "${family}"`;
    slice.forEach((row, n) => {
      if (!row) return;
      const y = top + n * 35;
      draw.fillStyle = accent;
      draw.beginPath(); draw.arc(6, y - 7, 4, 0, Math.PI * 2); draw.fill();
      // The body rows, in the theme's ink. These were hard-coded near-black,
      // which on a near-black page rendered the entire Bangla half of a
      // bilingual contract as invisible text — present in the file, unreadable
      // on the screen.
      draw.fillStyle = ink;
      draw.fillText(row, 28, y);
    });
    chunks.push({ png: canvas.toBuffer('image/png'), width, height });
  }
  return chunks;
}

type Fonts = { regular: PDFFont; bold: PDFFont; syne: PDFFont; micro: PDFFont; microBold: PDFFont };

/**
 * A black masthead on every page.
 *
 * The site's rule is that black carries the design and red only punctuates it,
 * so the brand lives in a solid band at the top rather than in a tinted page.
 * The sheet below stays white because this is a contract people print, file
 * and sometimes photocopy.
 */
/**
 * The wordmark, drawn rather than embedded.
 *
 * The same construction as the SVG on the site: SNAREBYT set as one locked
 * unit in Syne, followed by the three red waveform bars — 292/298/304 at
 * heights 10/20/5 in a 306-wide viewBox, scaled here. Vector, so it stays
 * sharp at any zoom and adds no image asset to a document that has to render
 * identically for years.
 *
 * The chrome gradient the site uses is not reproducible in a PDF content
 * stream without embedding a raster, and a slightly blurry logo on a contract
 * looks cheaper than a clean solid one. The mark is drawn in the paper's ink
 * instead, which is what the gradient resolves to at this size anyway.
 */
function wordmark(page: PDFPage, f: Fonts, t: Theme, o: { x: number; y: number; size: number }) {
  const letters = 'SNAREBYT';
  const spacing = o.size * 0.026;
  tracked(page, letters, {
    x: o.x, y: o.y, size: o.size, font: f.syne, color: t.text, spacing,
  });

  // The tick sits just past the final T, proportioned from the type size so
  // the lockup holds together at any scale.
  const after = o.x + trackedWidth(letters, f.syne, o.size, spacing) + o.size * 0.16;
  const unit = o.size / 46;
  const bars: Array<[number, number, number]> = [
    [0, 10, 6],   // x offset, height, y offset — from the SVG
    [6, 20, 1],
    [12, 5, 9],
  ];
  for (const [dx, h, dy] of bars) {
    page.drawRectangle({
      x: after + dx * unit,
      y: o.y + (21 - dy - h) * unit,
      width: 3 * unit,
      height: h * unit,
      color: t.red,
    });
  }
}

function header(page: PDFPage, f: Fonts, data: LicencePdfData, t: Theme, pageNo: number, pageCount?: number) {
  const bandH = 74;
  // The band is a shade off the page, not a block of the opposite colour. The
  // previous version filled it with the TEXT colour, which on a dark document
  // put a white stripe across the top of every page and hid the logo inside
  // it — the masthead was drawn in the same colour as its own background.
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: t.card });
  page.drawLine({
    start: { x: 0, y: H - bandH }, end: { x: W, y: H - bandH },
    thickness: 0.6, color: t.line,
  });
  // The red rule, the one piece of the identity that punctuates rather than
  // carries — same role it has at the top of the site.
  page.drawRectangle({ x: 0, y: H - 2.4, width: W, height: 2.4, color: t.red });

  wordmark(page, f, t, { x: M, y: H - 44, size: 17 });

  tracked(page, data.isExclusive ? 'EXCLUSIVE RIGHTS AGREEMENT' : 'BEAT LICENCE AGREEMENT',
    { x: M, y: H - 60, size: 6.2, font: f.microBold, color: t.red, spacing: 1.7 });

  const ref = pageCount ? `${data.number}   PAGE ${pageNo} OF ${pageCount}` : data.number;
  tracked(page, ref, {
    x: W - M - trackedWidth(ref, f.micro, 6.6, 0.9), y: H - 44,
    size: 6.6, font: f.micro, color: t.muted, spacing: 0.9,
  });
  tracked(page, 'SNAREBYT.COM', {
    x: W - M - trackedWidth('SNAREBYT.COM', f.micro, 6.2, 1.2), y: H - 60,
    size: 6.2, font: f.micro, color: t.faint, spacing: 1.2,
  });
}

function footer(page: PDFPage, f: Fonts, data: LicencePdfData, t: Theme, fingerprint: string) {
  page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.5, color: t.line });
  tracked(page, `ORDER ${data.orderNumber}`,
    { x: M, y: 31, size: 6.2, font: f.microBold, color: t.muted, spacing: 1.1 });
  tracked(page, `FINGERPRINT ${fingerprint}`,
    { x: M, y: 22, size: 6.2, font: f.micro, color: t.faint, spacing: 0.8 });
  const issued = 'ISSUED ELECTRONICALLY BY SNAREBYT';
  tracked(page, issued, {
    x: W - M - trackedWidth(issued, f.micro, 6.2, 1.1), y: 31,
    size: 6.2, font: f.micro, color: t.muted, spacing: 1.1,
  });
}

/** Render the immutable licence snapshot. No database or network access here. */
export async function renderLicencePdf(data: LicencePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${data.number} - ${data.beatTitle}`);
  pdf.setAuthor('SnareByt');
  pdf.setSubject(data.isExclusive ? 'Exclusive beat rights agreement' : 'Non-exclusive beat licence agreement');
  pdf.setCreator('SnareByt licence automation');
  pdf.setCreationDate(data.purchasedAt);
  pdf.setModificationDate(data.purchasedAt);

  const [latinBytes, boldBytes, syneBytes, archivoBytes, archivoBoldBytes] = await Promise.all([
    readFile(LATIN_REGULAR), readFile(LATIN_BOLD),
    readFile(SYNE), readFile(ARCHIVO), readFile(ARCHIVO_BOLD),
  ]);
  const regular = await pdf.embedFont(latinBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const f: Fonts = {
    regular, bold,
    syne: await pdf.embedFont(syneBytes, { subset: true }),
    micro: await pdf.embedFont(archivoBytes, { subset: true }),
    microBold: await pdf.embedFont(archivoBoldBytes, { subset: true }),
  };
  const fingerprint = createHash('sha256')
    .update([data.number, data.orderNumber, data.licenseeEmail, data.beatTitle,
      data.tierName, data.purchasedAt.toISOString(), data.termsEnglish, data.termsBangla].join('|'))
    .digest('hex').slice(0, 20).toUpperCase();

  const t: Theme = data.theme === 'print' ? PRINT_THEME : DARK;

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = pdf.addPage([W, H]);
    // The ground, painted first. A PDF page has no background colour property —
    // it is white unless something is drawn over it, so on a dark document this
    // rectangle IS the page.
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.paper });
    pages.push(page);
    return page;
  };
  let page = addPage();
  let y = H - 128;

  // The document's own reference, set as the first thing on the page. On a
  // contract the number is what gets quoted in an email, typed into a claim
  // form and searched for later — it earns the top of the sheet more than a
  // restatement of the title already in the masthead.
  tracked(page, 'LICENCE NUMBER',
    { x: M, y: y + 6, size: 6.2, font: f.microBold, color: t.red, spacing: 1.4 });
  y -= 16;
  tracked(page, data.number,
    { x: M, y, size: 15, font: f.microBold, color: t.text, spacing: 1.1 });
  y -= 30;

  page.drawText(data.isExclusive ? 'Exclusive ownership transfer' : 'Non-exclusive commercial licence', {
    x: M, y, size: 18, font: f.syne, color: t.text,
  });
  y -= 12;
  // A short red rule under the title, the way the site marks a section.
  page.drawRectangle({ x: M, y, width: 46, height: 2, color: t.red });
  y -= 19;
  const intro = data.isExclusive
    ? 'This document records the exclusive rights purchased for the beat below. The beat is removed from sale when payment is verified.'
    : 'This document records the non-exclusive licence purchased for the beat below. The producer retains ownership and may license the beat to others.';
  for (const row of wrap(intro, regular, 9.5, W - M * 2)) {
    page.drawText(row, { x: M, y, size: 9.5, font: regular, color: t.muted }); y -= 14;
  }
  y -= 10;

  const facts: Array<[string, string]> = [
    ['LICENSEE', data.licenseeName],
    ...(data.licenseeArtist ? [['RELEASING AS', data.licenseeArtist] as [string, string]] : []),
    ['EMAIL', data.licenseeEmail],
    ...(data.licenseeCountry ? [['COUNTRY', data.licenseeCountry] as [string, string]] : []),
    ['BEAT', data.beatTitle], ['LICENCE', data.tierName],
    ['ORDER', data.orderNumber], ['PAID', `BDT ${data.priceBdt.toLocaleString('en-US')}`],
    ['ISSUED', data.purchasedAt.toISOString().slice(0, 10)],
    ['FILES', data.filesLabel], ['PERFORMANCE', data.performanceRights],
    // Was collected from the tier and then dropped. Whether the buyer must
    // credit the producer is one of the terms most likely to be argued about,
    // so it belongs on the front page in words, not buried in the prose.
    ['CREDIT', data.creditRequired
      ? 'Producer credit required — "Prod. SnareByt"'
      : 'No producer credit required'],
  ];
  for (const [label, value] of facts) {
    tracked(page, label, { x: M, y, size: 6.4, font: f.microBold, color: t.red, spacing: 1.3 });
    const valueLines = wrap(value, regular, 9, 360);
    valueLines.forEach((v, i) => page.drawText(v, { x: 175, y: y - i * 12, size: 9, font: regular, color: t.text }));
    y -= Math.max(24, valueLines.length * 12 + 8);
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.45, color: t.line });
  }

  y -= 5;
  page.drawRectangle({ x: M, y: y - 66, width: W - M * 2, height: 72, color: t.card, borderColor: t.cardLine, borderWidth: 0.7 });
  tracked(page, data.isExclusive ? 'RIGHTS STATUS' : 'IMPORTANT',
    { x: M + 16, y: y - 15, size: 6.6, font: f.microBold, color: t.red, spacing: 1.4 });
  const status = data.isExclusive
    ? `Exclusive sale. Ownership transfer: ${data.transfersOwnership ? 'YES, as limited by the terms below.' : 'NO.'}`
    : 'This is a lease, not an exclusive sale. The beat remains available to other licensees.';
  wrap(status, regular, 9, W - M * 2 - 32).forEach((v, i) =>
    page.drawText(v, { x: M + 16, y: y - 34 - i * 13, size: 9, font: regular, color: t.text }));

  const drawSection = (title: string, body: string, font: PDFFont) => {
    page = addPage(); y = H - 126;
    page.drawText(title, { x: M, y, size: 16, font: f.syne, color: t.text });
    y -= 11;
    page.drawRectangle({ x: M, y, width: 40, height: 1.8, color: t.red });
    y -= 21;
    const rows = wrap(body, font, 10, W - M * 2 - 18);
    for (const row of rows) {
      if (y < 78) { page = addPage(); y = H - 118; }
      if (!row) { y -= 8; continue; }
      page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: t.red });
      page.drawText(row, { x: M + 16, y, size: 10, font, color: t.text });
      y -= 17;
    }
  };
  /* ---------------- what this licence allows, in figures ----------------
     The prose terms say it too, but a number in a table is what somebody
     checks before they release. Built from the tier's own limits so the
     document and the store can never state different ceilings. */
  page = addPage(); y = H - 126;
  page.drawText('Limits and rules', { x: M, y, size: 16, font: f.syne, color: t.text });
  y -= 11;
  page.drawRectangle({ x: M, y, width: 40, height: 1.8, color: t.red });
  y -= 20;
  wrap('Everything this licence permits, with the ceiling that applies to each. A limit reached is a limit reached — come back for a higher tier rather than exceeding it.',
    regular, 9, W - M * 2).forEach((row) => {
    page.drawText(row, { x: M, y, size: 9, font: regular, color: t.muted }); y -= 13;
  });
  y -= 16;

  const allowances: Array<[string, string]> = [
    ['STREAMS', limitText(data.streamLimit, 'stream', 'streams')],
    ['PAID SALES / DOWNLOADS', limitText(data.saleLimit, 'copy', 'copies')],
    ['MUSIC VIDEOS', limitText(data.videoLimit, 'video', 'videos')],
    ['RADIO / BROADCAST', limitText(data.radioStations, 'station', 'stations')],
    ['LIVE PERFORMANCE', data.performanceRights],
    ['MONETISATION', data.monetisation === false
      ? 'Not permitted under this licence'
      : 'Permitted on all platforms, including YouTube and streaming services'],
    ['PRODUCER CREDIT', data.creditRequired
      ? 'Required — "Prod. SnareByt" in the title or description'
      : 'Not required'],
    ['DISTRIBUTION', 'One song, released under the licensee named on this document'],
  ];

  for (const [label, value] of allowances) {
    const rows = wrap(value, regular, 9.5, W - M - 232);
    page.drawRectangle({
      x: M, y: y - (rows.length - 1) * 12 - 7, width: W - M * 2,
      height: rows.length * 12 + 16, color: t.card,
    });
    tracked(page, label, { x: M + 12, y, size: 6.4, font: f.microBold, color: t.red, spacing: 1.2 });
    rows.forEach((v, i) =>
      page.drawText(v, { x: 226, y: y - i * 12, size: 9.5, font: regular, color: t.text }));
    y -= rows.length * 12 + 22;
  }

  y -= 4;
  const notPermitted = [
    'Reselling, re-licensing or giving away the beat as a beat, in any form.',
    'Registering the beat, or any part of it, with YouTube Content ID or any other content-identification system as your own work.',
    'Claiming authorship of the underlying composition.',
    'Using the beat in anything unlawful, or that promotes hatred or violence.',
    ...(data.isExclusive ? [] : ['Exceeding any figure above. The licence covers up to the limit, not beyond it.']),
  ];
  tracked(page, 'NOT PERMITTED UNDER ANY TIER',
    { x: M, y, size: 6.6, font: f.microBold, color: t.red, spacing: 1.4 });
  y -= 18;
  for (const row of notPermitted) {
    if (y < 92) { page = addPage(); y = H - 118; }
    const rows = wrap(row, regular, 9.5, W - M * 2 - 18);
    rows.forEach((v, i) =>
      page.drawText(v, { x: M + 16, y: y - i * 13, size: 9.5, font: regular, color: t.text }));
    page.drawText('—', { x: M, y, size: 9.5, font: regular, color: t.faint });
    y -= rows.length * 13 + 8;
  }

  /* ---------------- proof of licence, for a platform ----------------
     The reason this document is worth issuing at all. When a release is
     claimed on YouTube or flagged by a DSP, the artist needs one page they can
     attach that says who owns the beat, who was licensed, and how to check.
     Written to be read by a rights administrator who has never heard of this
     site — hence the plain restatement of the parties and the verification
     route, which is nothing a claim reviewer should have to hunt for. */
  page = addPage(); y = H - 126;
  page.drawText('Proof of licence', { x: M, y, size: 16, font: f.syne, color: t.text });
  y -= 11;
  page.drawRectangle({ x: M, y, width: 40, height: 1.8, color: t.red });
  y -= 20;
  tracked(page, 'FOR COPYRIGHT CLAIMS ON YOUTUBE, SPOTIFY AND OTHER PLATFORMS',
    { x: M, y, size: 6.4, font: f.microBold, color: t.red, spacing: 1.3 });
  y -= 26;

  const proof = [
    `SnareByt (Samir Islam), Dhaka, Bangladesh, is the sole owner of the musical composition and sound recording of the instrumental "${data.beatTitle}".`,
    `SnareByt has granted ${data.licenseeArtist ? `${data.licenseeName}, releasing as ${data.licenseeArtist},` : data.licenseeName} a ${data.isExclusive ? 'an exclusive' : 'valid non-exclusive'} licence to use that instrumental in one commercial release, under licence number ${data.number}, issued ${data.purchasedAt.toISOString().slice(0, 10)}.`,
    data.monetisation === false
      ? 'This licence does not include monetisation rights.'
      : 'That licence expressly includes the right to distribute and monetise the resulting song on YouTube, Spotify, Apple Music and other digital service providers, within the limits set out in this document.',
    'If a claim has been raised against a release covered by this licence, this document is the licensee’s authorisation to use the work. SnareByt will confirm it on request.',
    `To verify: email snarebyt@gmail.com quoting licence ${data.number} and order ${data.orderNumber}. The document fingerprint below must match our record.`,
  ];

  for (const row of proof) {
    if (y < 150) { page = addPage(); y = H - 118; }
    const rows = wrap(row, regular, 9.5, W - M * 2 - 18);
    rows.forEach((v, i) =>
      page.drawText(v, { x: M + 16, y: y - i * 14, size: 9.5, font: regular, color: t.text }));
    page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: t.red });
    y -= rows.length * 14 + 12;
  }

  y -= 6;
  page.drawRectangle({
    x: M, y: y - 58, width: W - M * 2, height: 62,
    color: t.card, borderColor: t.cardLine, borderWidth: 0.7,
  });
  tracked(page, 'WHAT THIS DOCUMENT IS NOT',
    { x: M + 16, y: y - 16, size: 6.4, font: f.microBold, color: t.red, spacing: 1.3 });
  y -= 78;

  /* The authenticity block.
   *
   * A claim reviewer scanning a PDF is looking for one thing: is this a real
   * document from a real rights holder, or something somebody typed. So the
   * licensor is named in full, with a contact and the fingerprint, inside a
   * ruled panel that reads as a seal rather than as more prose. */
  const sealH = 96;
  page.drawRectangle({
    x: M, y: y - sealH + 14, width: W - M * 2, height: sealH,
    color: t.card, borderColor: t.red, borderWidth: 1.1,
  });
  page.drawRectangle({ x: M, y: y + 12, width: W - M * 2, height: 2, color: t.red });

  wordmark(page, f, t, { x: M + 18, y: y - 14, size: 13 });
  tracked(page, 'LICENSOR AND RIGHTS HOLDER',
    { x: M + 18, y: y - 28, size: 5.8, font: f.microBold, color: t.red, spacing: 1.4 });

  const sealRows: Array<[string, string]> = [
    ['Samir Islam, trading as SnareByt', 'Dhaka, Bangladesh'],
    ['snarebyt@gmail.com', 'snarebyt.com'],
  ];
  sealRows.forEach(([left, right], i) => {
    page.drawText(left, { x: M + 18, y: y - 46 - i * 13, size: 8.6, font: regular, color: t.text });
    page.drawText(right, {
      x: W - M - 18 - regular.widthOfTextAtSize(right, 8.6),
      y: y - 46 - i * 13, size: 8.6, font: regular, color: t.muted,
    });
  });
  tracked(page, `DOCUMENT FINGERPRINT ${fingerprint}`,
    { x: M + 18, y: y - sealH + 26, size: 5.8, font: f.micro, color: t.faint, spacing: 0.9 });
  wrap(data.isExclusive
    ? 'It does not transfer the copyright in the composition unless a separate signed exclusive contract says so. It is proof of the rights granted, not a transfer of authorship.'
    : 'It is not a transfer of ownership and not an exclusive right. Other artists may hold their own licence to the same instrumental, and a claim from one of them is not a dispute with you.',
    regular, 8.8, W - M * 2 - 32).forEach((v, i) =>
    page.drawText(v, { x: M + 16, y: y - 33 - i * 12, size: 8.8, font: regular, color: t.muted }));

  drawSection('Terms in English', data.termsEnglish, regular);

  // pdf-lib's text layer does not perform Indic shaping reliably. Render the
  // Bangla block through HarfBuzz-backed canvas, then embed it as a crisp 2x
  // image so conjuncts and vowel marks remain readable in every PDF viewer.
  // 35pt per row at 2x is 17.5pt on the page; the usable band is header to
  // footer, so this is how many rows genuinely fit before the sheet runs out.
  const usable = H - 118 - 60;
  // Canvas draws its own pixels, so it has to be told the theme too — the
  // default near-black text would be invisible on a near-black page, which is
  // the whole Bangla half of a bilingual contract silently disappearing.
  const banglaChunks = await renderBanglaTerms(
    data.termsBangla,
    Math.floor((usable - 38) / 17.5),
    data.theme === 'print' ? '#040405' : '#F2F2F6',
    data.theme === 'print' ? '#E01B36' : '#FF2D4A',
  );
  for (const chunk of banglaChunks) {
    page = addPage();
    const img = await pdf.embedPng(chunk.png);
    page.drawImage(img, {
      x: M, y: H - 118 - chunk.height / 2,
      width: chunk.width / 2, height: chunk.height / 2,
    });
  }

  page = addPage(); y = H - 126;
  page.drawText('Electronic execution record', { x: M, y, size: 16, font: f.syne, color: t.text });
  y -= 11;
  page.drawRectangle({ x: M, y, width: 40, height: 1.8, color: t.red });
  y -= 22;
  const execution = [
    'The customer accepted the licence terms during checkout before the order was submitted.',
    'The payment gateway confirmed the exact order amount to SnareByt server-to-server before this document was issued.',
    'The English and Bangla terms above are an immutable snapshot of the licence at the time of purchase.',
    `Document fingerprint: ${fingerprint}`,
  ];
  execution.forEach((row) => {
    wrap(row, regular, 9.5, W - M * 2 - 18).forEach((v, i) =>
      page.drawText(v, { x: M + 16, y: y - i * 14, size: 9.5, font: regular, color: t.text }));
    page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: t.red });
    y -= Math.max(31, wrap(row, regular, 9.5, W - M * 2 - 18).length * 14 + 11);
  });
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: 260, y }, thickness: 0.8, color: t.text });
  tracked(page, 'SNAREBYT / LICENSOR',
    { x: M, y: y - 17, size: 6.4, font: f.microBold, color: t.muted, spacing: 1.3 });
  page.drawLine({ start: { x: 320, y }, end: { x: W - M, y }, thickness: 0.8, color: t.text });
  tracked(page, data.licenseeName.toUpperCase().slice(0, 30),
    { x: 320, y: y - 17, size: 6.4, font: f.microBold, color: t.muted, spacing: 1.3 });
  page.drawText('Electronically issued and accepted', { x: M, y: y - 48, size: 8.5, font: regular, color: t.muted });

  // Drawn last, because "PAGE 2 OF 5" cannot be written before the fifth page
  // exists — and a legal document that does not say how many pages it has is
  // a document nobody can tell is complete.
  pages.forEach((p, i) => {
    header(p, f, data, t, i + 1, pages.length);
    footer(p, f, data, t, fingerprint);
  });
  return pdf.save({ useObjectStreams: false });
}

/** Generate, hash, upload, and mark one licence document as ready. */
export async function generateLicenceDocument(licenceId: string) {
  const licence = await prisma.licenceDocument.findUnique({
    where: { id: licenceId },
    include: {
      order: { select: { number: true, status: true } },
      orderItem: { include: { licenceTier: true } },
    },
  });
  if (!licence || !licence.orderItem.licenceTier) throw new Error('Licence record is incomplete.');
  if (licence.order.status !== 'PAID') throw new Error('A licence PDF can only be issued for a paid order.');
  const tier = licence.orderItem.licenceTier;
  // Split at the FIRST separator only. Splitting on every occurrence and
  // destructuring two values would silently drop everything after a second
  // "---" — and the part that gets dropped is the Bangla half of a contract
  // whose whole point is being bilingual.
  const SEPARATOR = '\n\n---\n\n';
  const at = licence.termsSnapshot.indexOf(SEPARATOR);
  const termsEnglish = at === -1 ? licence.termsSnapshot : licence.termsSnapshot.slice(0, at);
  const termsBangla = at === -1 ? '' : licence.termsSnapshot.slice(at + SEPARATOR.length);
  const bytes = await renderLicencePdf({
    number: licence.number, orderNumber: licence.order.number,
    licenseeName: licence.licenseeName, licenseeEmail: licence.licenseeEmail,
    licenseeArtist: licence.licenseeArtist, licenseeCountry: licence.licenseeCountry,
    beatTitle: licence.beatTitle, tierName: licence.tierName,
    purchasedAt: licence.purchasedAt, priceBdt: licence.orderItem.priceBdt,
    isExclusive: tier.isExclusive, transfersOwnership: tier.transfersOwnership,
    filesLabel: tier.filesLabel, performanceRights: tier.performanceRights,
    creditRequired: tier.creditRequired, termsEnglish, termsBangla,
    // The figures the Limits page prints. Read from the tier rather than
    // restated here, so the document and the store can never disagree about
    // what somebody bought.
    streamLimit: tier.streamLimit, saleLimit: tier.saleLimit,
    videoLimit: tier.videoLimit, radioStations: tier.radioStations,
    monetisation: tier.monetisation,
  });
  const signatureHash = createHash('sha256').update(bytes).digest('hex');
  await putPrivateObject({
    key: licence.pdfObjectKey, body: bytes, contentType: 'application/pdf',
    metadata: { licence: licence.number, sha256: signatureHash },
  });
  await prisma.licenceDocument.update({ where: { id: licence.id }, data: { signatureHash } });
  return { signatureHash, bytes: bytes.length, objectKey: licence.pdfObjectKey };
}

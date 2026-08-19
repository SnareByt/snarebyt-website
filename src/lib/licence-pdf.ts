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
};

const W = 595.28;
const H = 841.89;
const M = 54;
// Straight from globals.css: --red #E01B36, --ink #040405. The body stays on
// white because this is a contract people print and file — a black page is a
// ruined cartridge and an unreadable photocopy. The brand lives in the
// masthead, the rules and the accents, which is how a luxury house prints.
const red = rgb(0.878, 0.106, 0.212);
const ink = rgb(0.016, 0.016, 0.02);
const muted = rgb(0.38, 0.4, 0.46);
const line = rgb(0.86, 0.87, 0.9);
const paper = rgb(1, 1, 1);

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
async function renderBanglaTerms(body: string, maxRowsPerPage: number) {
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
      draw.fillStyle = '#040405';
      draw.fillText('বাংলায় শর্তাবলি', 0, 33);
    }
    draw.font = `20px "${family}"`;
    slice.forEach((row, n) => {
      if (!row) return;
      const y = top + n * 35;
      draw.fillStyle = '#E01B36';
      draw.beginPath(); draw.arc(6, y - 7, 4, 0, Math.PI * 2); draw.fill();
      draw.fillStyle = '#040405';
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
function header(page: PDFPage, f: Fonts, data: LicencePdfData, pageNo: number, pageCount?: number) {
  const bandH = 74;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: ink });
  // The red waveform tick from the wordmark, reduced to its essential mark.
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: 2.4, color: red });

  tracked(page, 'SNAREBYT',
    { x: M, y: H - 44, size: 19, font: f.syne, color: paper, spacing: 0.5 });
  tracked(page, data.isExclusive ? 'EXCLUSIVE RIGHTS AGREEMENT' : 'BEAT LICENCE AGREEMENT',
    { x: M, y: H - 60, size: 6.4, font: f.microBold, color: red, spacing: 1.7 });

  const ref = pageCount ? `${data.number}   PAGE ${pageNo} OF ${pageCount}` : data.number;
  tracked(page, ref, {
    x: W - M - trackedWidth(ref, f.micro, 6.6, 0.9), y: H - 44,
    size: 6.6, font: f.micro, color: rgb(0.65, 0.66, 0.7), spacing: 0.9,
  });
}

function footer(page: PDFPage, f: Fonts, data: LicencePdfData, fingerprint: string) {
  page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.5, color: line });
  tracked(page, `ORDER ${data.orderNumber}`,
    { x: M, y: 31, size: 6.2, font: f.microBold, color: muted, spacing: 1.1 });
  tracked(page, `FINGERPRINT ${fingerprint}`,
    { x: M, y: 22, size: 6.2, font: f.micro, color: rgb(0.55, 0.57, 0.62), spacing: 0.8 });
  const issued = 'ISSUED ELECTRONICALLY BY SNAREBYT';
  tracked(page, issued, {
    x: W - M - trackedWidth(issued, f.micro, 6.2, 1.1), y: 31,
    size: 6.2, font: f.micro, color: muted, spacing: 1.1,
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

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = pdf.addPage([W, H]);
    pages.push(page);
    return page;
  };
  let page = addPage();
  let y = H - 128;

  page.drawText(data.isExclusive ? 'Exclusive ownership transfer' : 'Non-exclusive commercial licence', {
    x: M, y, size: 18, font: f.syne, color: ink,
  });
  y -= 29;
  const intro = data.isExclusive
    ? 'This document records the exclusive rights purchased for the beat below. The beat is removed from sale when payment is verified.'
    : 'This document records the non-exclusive licence purchased for the beat below. The producer retains ownership and may license the beat to others.';
  for (const row of wrap(intro, regular, 9.5, W - M * 2)) {
    page.drawText(row, { x: M, y, size: 9.5, font: regular, color: muted }); y -= 14;
  }
  y -= 10;

  const facts: Array<[string, string]> = [
    ['LICENSEE', `${data.licenseeName}  /  ${data.licenseeEmail}`],
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
    tracked(page, label, { x: M, y, size: 6.4, font: f.microBold, color: red, spacing: 1.3 });
    const valueLines = wrap(value, regular, 9, 360);
    valueLines.forEach((v, i) => page.drawText(v, { x: 175, y: y - i * 12, size: 9, font: regular, color: ink }));
    y -= Math.max(24, valueLines.length * 12 + 8);
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.45, color: line });
  }

  y -= 5;
  page.drawRectangle({ x: M, y: y - 66, width: W - M * 2, height: 72, color: rgb(0.975, 0.976, 0.982), borderColor: line, borderWidth: 0.7 });
  tracked(page, data.isExclusive ? 'RIGHTS STATUS' : 'IMPORTANT',
    { x: M + 16, y: y - 15, size: 6.6, font: f.microBold, color: red, spacing: 1.4 });
  const status = data.isExclusive
    ? `Exclusive sale. Ownership transfer: ${data.transfersOwnership ? 'YES, as limited by the terms below.' : 'NO.'}`
    : 'This is a lease, not an exclusive sale. The beat remains available to other licensees.';
  wrap(status, regular, 9, W - M * 2 - 32).forEach((v, i) =>
    page.drawText(v, { x: M + 16, y: y - 34 - i * 13, size: 9, font: regular, color: ink }));

  const drawSection = (title: string, body: string, font: PDFFont) => {
    page = addPage(); y = H - 126;
    page.drawText(title, { x: M, y, size: 16, font: f.syne, color: ink }); y -= 31;
    const rows = wrap(body, font, 10, W - M * 2 - 18);
    for (const row of rows) {
      if (y < 78) { page = addPage(); y = H - 118; }
      if (!row) { y -= 8; continue; }
      page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: red });
      page.drawText(row, { x: M + 16, y, size: 10, font, color: ink });
      y -= 17;
    }
  };
  drawSection('Terms in English', data.termsEnglish, regular);

  // pdf-lib's text layer does not perform Indic shaping reliably. Render the
  // Bangla block through HarfBuzz-backed canvas, then embed it as a crisp 2x
  // image so conjuncts and vowel marks remain readable in every PDF viewer.
  // 35pt per row at 2x is 17.5pt on the page; the usable band is header to
  // footer, so this is how many rows genuinely fit before the sheet runs out.
  const usable = H - 118 - 60;
  const banglaChunks = await renderBanglaTerms(data.termsBangla, Math.floor((usable - 38) / 17.5));
  for (const chunk of banglaChunks) {
    page = addPage();
    const img = await pdf.embedPng(chunk.png);
    page.drawImage(img, {
      x: M, y: H - 118 - chunk.height / 2,
      width: chunk.width / 2, height: chunk.height / 2,
    });
  }

  page = addPage(); y = H - 126;
  page.drawText('Electronic execution record', { x: M, y, size: 16, font: f.syne, color: ink }); y -= 32;
  const execution = [
    'The customer accepted the licence terms during checkout before the order was submitted.',
    'The payment gateway confirmed the exact order amount to SnareByt server-to-server before this document was issued.',
    'The English and Bangla terms above are an immutable snapshot of the licence at the time of purchase.',
    `Document fingerprint: ${fingerprint}`,
  ];
  execution.forEach((row) => {
    wrap(row, regular, 9.5, W - M * 2 - 18).forEach((v, i) =>
      page.drawText(v, { x: M + 16, y: y - i * 14, size: 9.5, font: regular, color: ink }));
    page.drawCircle({ x: M + 3, y: y + 3, size: 2.2, color: red });
    y -= Math.max(31, wrap(row, regular, 9.5, W - M * 2 - 18).length * 14 + 11);
  });
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: 260, y }, thickness: 0.8, color: ink });
  tracked(page, 'SNAREBYT / LICENSOR',
    { x: M, y: y - 17, size: 6.4, font: f.microBold, color: muted, spacing: 1.3 });
  page.drawLine({ start: { x: 320, y }, end: { x: W - M, y }, thickness: 0.8, color: ink });
  tracked(page, data.licenseeName.toUpperCase().slice(0, 30),
    { x: 320, y: y - 17, size: 6.4, font: f.microBold, color: muted, spacing: 1.3 });
  page.drawText('Electronically issued and accepted', { x: M, y: y - 48, size: 8.5, font: regular, color: muted });

  // Drawn last, because "PAGE 2 OF 5" cannot be written before the fifth page
  // exists — and a legal document that does not say how many pages it has is
  // a document nobody can tell is complete.
  pages.forEach((p, i) => {
    header(p, f, data, i + 1, pages.length);
    footer(p, f, data, fingerprint);
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
    beatTitle: licence.beatTitle, tierName: licence.tierName,
    purchasedAt: licence.purchasedAt, priceBdt: licence.orderItem.priceBdt,
    isExclusive: tier.isExclusive, transfersOwnership: tier.transfersOwnership,
    filesLabel: tier.filesLabel, performanceRights: tier.performanceRights,
    creditRequired: tier.creditRequired, termsEnglish, termsBangla,
  });
  const signatureHash = createHash('sha256').update(bytes).digest('hex');
  await putPrivateObject({
    key: licence.pdfObjectKey, body: bytes, contentType: 'application/pdf',
    metadata: { licence: licence.number, sha256: signatureHash },
  });
  await prisma.licenceDocument.update({ where: { id: licence.id }, data: { signatureHash } });
  return { signatureHash, bytes: bytes.length, objectKey: licence.pdfObjectKey };
}

import 'server-only';
import 'regenerator-runtime/runtime';

import { createHash } from 'crypto';
import path from 'path';
import { readFile } from 'fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { prisma } from './prisma';
import { putPrivateObject } from './storage';

const fontPath = (name: string) => path.join(process.cwd(), 'src', 'assets', 'fonts', name);
const LATIN_REGULAR = fontPath('NotoSans-Regular.ttf');
const LATIN_BOLD = fontPath('NotoSans-Bold.ttf');
const BENGALI = fontPath('NotoSansBengali-Regular.ttf');

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
const red = rgb(0.94, 0.075, 0.12);
const ink = rgb(0.055, 0.06, 0.075);
const muted = rgb(0.38, 0.4, 0.46);
const line = rgb(0.86, 0.87, 0.9);

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

async function renderBanglaTerms(body: string) {
  const family = 'SnareByt Noto Bengali';
  GlobalFonts.registerFromPath(BENGALI, family);
  const scale = 2;
  const width = Math.round((W - M * 2) * scale);
  const canvas = createCanvas(width, 900);
  const ctx = canvas.getContext('2d');
  ctx.font = `20px "${family}"`;

  const rows: string[] = [];
  for (const paragraph of body.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= width - 58 || !current) current = next;
      else { rows.push(current); current = word; }
    }
    if (current) rows.push(current);
  }
  const height = 76 + rows.length * 35;
  canvas.height = height;
  const draw = canvas.getContext('2d');
  draw.font = `700 31px "${family}"`;
  draw.fillStyle = '#0e0f13';
  draw.fillText('বাংলায় শর্তাবলি', 0, 33);
  draw.font = `20px "${family}"`;
  rows.forEach((row, i) => {
    const y = 76 + i * 35;
    draw.fillStyle = '#ef1320';
    draw.beginPath(); draw.arc(6, y - 7, 4, 0, Math.PI * 2); draw.fill();
    draw.fillStyle = '#0e0f13';
    draw.fillText(row, 28, y);
  });
  return { png: canvas.toBuffer('image/png'), width, height };
}

function header(page: PDFPage, bold: PDFFont, regular: PDFFont, data: LicencePdfData, pageNo: number) {
  page.drawRectangle({ x: 0, y: H - 9, width: W, height: 9, color: red });
  page.drawText('SNAREBYT', { x: M, y: H - 58, size: 21, font: bold, color: ink });
  page.drawText(data.isExclusive ? 'EXCLUSIVE RIGHTS AGREEMENT' : 'BEAT LICENCE AGREEMENT', {
    x: M, y: H - 82, size: 8.5, font: bold, color: red,
  });
  page.drawText(`${data.number}  /  PAGE ${pageNo}`, {
    x: W - M - 150, y: H - 60, size: 7.5, font: regular, color: muted,
  });
  page.drawLine({ start: { x: M, y: H - 98 }, end: { x: W - M, y: H - 98 }, thickness: 0.7, color: line });
}

function footer(page: PDFPage, regular: PDFFont, data: LicencePdfData, fingerprint: string) {
  page.drawLine({ start: { x: M, y: 48 }, end: { x: W - M, y: 48 }, thickness: 0.6, color: line });
  page.drawText(`Order ${data.orderNumber}  |  Terms fingerprint ${fingerprint}`, {
    x: M, y: 30, size: 6.8, font: regular, color: muted,
  });
  page.drawText('Issued electronically by SnareByt', { x: W - M - 139, y: 30, size: 6.8, font: regular, color: muted });
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

  const [latinBytes, boldBytes] = await Promise.all([
    readFile(LATIN_REGULAR), readFile(LATIN_BOLD),
  ]);
  const regular = await pdf.embedFont(latinBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const fingerprint = createHash('sha256')
    .update([data.number, data.orderNumber, data.licenseeEmail, data.beatTitle,
      data.tierName, data.purchasedAt.toISOString(), data.termsEnglish, data.termsBangla].join('|'))
    .digest('hex').slice(0, 20).toUpperCase();

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = pdf.addPage([W, H]);
    pages.push(page);
    header(page, bold, regular, data, pages.length);
    return page;
  };
  let page = addPage();
  let y = H - 133;

  page.drawText(data.isExclusive ? 'Exclusive ownership transfer' : 'Non-exclusive commercial licence', {
    x: M, y, size: 19, font: bold, color: ink,
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
  ];
  for (const [label, value] of facts) {
    page.drawText(label, { x: M, y, size: 7, font: bold, color: red });
    const valueLines = wrap(value, regular, 9, 360);
    valueLines.forEach((v, i) => page.drawText(v, { x: 175, y: y - i * 12, size: 9, font: regular, color: ink }));
    y -= Math.max(24, valueLines.length * 12 + 8);
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.45, color: line });
  }

  y -= 5;
  page.drawRectangle({ x: M, y: y - 66, width: W - M * 2, height: 72, color: rgb(0.975, 0.976, 0.982), borderColor: line, borderWidth: 0.7 });
  page.drawText(data.isExclusive ? 'RIGHTS STATUS' : 'IMPORTANT', { x: M + 16, y: y - 15, size: 7.5, font: bold, color: red });
  const status = data.isExclusive
    ? `Exclusive sale. Ownership transfer: ${data.transfersOwnership ? 'YES, as limited by the terms below.' : 'NO.'}`
    : 'This is a lease, not an exclusive sale. The beat remains available to other licensees.';
  wrap(status, regular, 9, W - M * 2 - 32).forEach((v, i) =>
    page.drawText(v, { x: M + 16, y: y - 34 - i * 13, size: 9, font: regular, color: ink }));

  const drawSection = (title: string, body: string, font: PDFFont) => {
    page = addPage(); y = H - 132;
    page.drawText(title, { x: M, y, size: 17, font: bold, color: ink }); y -= 31;
    const rows = wrap(body, font, 10, W - M * 2 - 18);
    for (const row of rows) {
      if (y < 78) { page = addPage(); y = H - 128; }
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
  page = addPage();
  const bangla = await renderBanglaTerms(data.termsBangla);
  const banglaImage = await pdf.embedPng(bangla.png);
  page.drawImage(banglaImage, {
    x: M, y: H - 128 - bangla.height / 2,
    width: bangla.width / 2, height: bangla.height / 2,
  });

  page = addPage(); y = H - 132;
  page.drawText('Electronic execution record', { x: M, y, size: 17, font: bold, color: ink }); y -= 32;
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
  page.drawText('SNAREBYT / LICENSOR', { x: M, y: y - 17, size: 7.5, font: bold, color: muted });
  page.drawLine({ start: { x: 320, y }, end: { x: W - M, y }, thickness: 0.8, color: ink });
  page.drawText(data.licenseeName.toUpperCase().slice(0, 34), { x: 320, y: y - 17, size: 7.5, font: bold, color: muted });
  page.drawText('Electronically issued and accepted', { x: M, y: y - 48, size: 8.5, font: regular, color: muted });

  pages.forEach((p) => footer(p, regular, data, fingerprint));
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
  const [termsEnglish = '', termsBangla = ''] = licence.termsSnapshot.split(/\n\n---\n\n/);
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

/**
 * Builds every site icon from one 512px master.
 *
 * Run after replacing src/assets/brand/sb-mark-512.png:
 *   npm run icons
 *
 * The small sizes are cropped ~12% tighter than the large ones. That is an
 * optical correction, not a mistake: the monogram sits inset inside its
 * circle, and at 16px the surrounding black swallows it so the tab reads as a
 * dark smudge. Cropping trades a rim nobody can see at that size for a mark
 * they can. The large icons keep the full artwork, rim included.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'fs/promises';

const MASTER = 'src/assets/brand/sb-mark-512.png';
const TIGHT_CROP_PCT = 12;

(async () => {
  const src = await loadImage(MASTER);
  if (src.width !== src.height) console.warn(`! master is ${src.width}×${src.height}, not square`);

  const render = (size: number, cropPct: number) => {
    const inset = Math.round(src.width * cropPct / 100);
    const side = src.width - inset * 2;
    const c = createCanvas(size, size);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, inset, inset, side, side, 0, 0, size, size);
    return c.toBuffer('image/png');
  };

  await writeFile('src/app/icon.png', render(512, 0));
  await writeFile('src/app/apple-icon.png', render(180, 0));

  // A multi-size .ico so each surface picks its own bitmap rather than
  // rescaling one badly.
  const entries: [number, Buffer][] = [
    [16, render(16, TIGHT_CROP_PCT)],
    [32, render(32, TIGHT_CROP_PCT)],
    [48, render(48, 0)],
  ];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dirs = entries.map(([size, png]) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size, 0); d.writeUInt8(size, 1);
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
    offset += png.length;
    return d;
  });
  await writeFile('src/app/favicon.ico', Buffer.concat([header, ...dirs, ...entries.map(([, p]) => p)]));

  console.log(`icons rebuilt from ${MASTER}: favicon.ico (16/32/48), icon.png (512), apple-icon.png (180)`);
})();

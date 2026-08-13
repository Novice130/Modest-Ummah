// One-off: generates /public/images/logo.png, /public/og-image.png,
// /public/apple-icon.svg. Crescent design, pure Node (zlib PNG encoder).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const NAVY = [20, 40, 80]; // #142850
const CREAM = [250, 248, 245]; // #faf8f5
const SAGE = [181, 193, 160]; // #b5c1a0
const SAGE_DARK = [140, 155, 115];

// Crescent: outer circle minus offset inner circle. Returns alpha mask 0/1.
function crescent(px, py, cx, cy, rOuter, rInner, offX, offY) {
  const dx = px - cx;
  const dy = py - cy;
  const dx2 = px - (cx + offX);
  const dy2 = py - (cy + offY);
  return dx * dx + dy * dy <= rOuter * rOuter && dx2 * dx2 + dy2 * dy2 > rInner * rInner;
}

function render(width, height, bg, circle, withGradient = false) {
  const rgba = Buffer.alloc(width * height * 4);
  const c = width / 2;
  const cy = height / 2;
  const rOuter = Math.min(width, height) * 0.28;
  const rInner = rOuter * 0.78;
  const offX = rOuter * 0.42;
  const offY = -rOuter * 0.12;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let col;
      if (bg === null) {
        if (crescent(x, y, c, cy, rOuter, rInner, offX, offY)) col = CREAM;
        else { rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0; continue; }
      } else {
        const t = withGradient ? (x / width + y / height) / 2 : 1;
        const base = bg.map((v, k) => Math.round(v + (SAGE_DARK[k] - v) * t));
        col = crescent(x, y, c, cy, rOuter, rInner, offX, offY) ? CREAM : base;
      }
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

// Logo: 512x512 transparent bg, cream crescent.
writeFileSync(new URL('../public/images/logo.png', import.meta.url), render(512, 512, null, null));

// OG image: 1200x630.
writeFileSync(new URL('../public/og-image.png', import.meta.url), render(1200, 630, SAGE, null, true));

console.log('Generated public/images/logo.png and public/og-image.png');

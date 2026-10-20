// Draws the extension icons as PNGs, with no dependencies: a rounded dark square
// and a broom sweeping a few specks away. Supersampled 4x for smooth edges, then
// encoded with Node's built-in zlib. Run it with `node scripts/make-icons.mjs`.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SS = 4; // supersampling factor

// White-on-black, following x.com's own palette: black background, light text
// (#e7e9ea) and the secondary gray (#71767b) for depth.
const BG = [0, 0, 0]; // x.com black
const ACCENT = [113, 118, 123]; // #71767b, x.com's secondary gray
const WHITE = [231, 233, 234]; // #e7e9ea, x.com's primary text color

function blend(dst, i, [r, g, b], a) {
  dst[i] = Math.round(dst[i] * (1 - a) + r * a);
  dst[i + 1] = Math.round(dst[i + 1] * (1 - a) + g * a);
  dst[i + 2] = Math.round(dst[i + 2] * (1 - a) + b * a);
  dst[i + 3] = 255;
}

// Signed distance helpers, all in the supersampled coordinate space.
function roundedRectCover(x, y, w, h, r) {
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) - r;
}
function segmentDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function draw(size) {
  const S = size * SS;
  const px = new Uint8ClampedArray(S * S * 4);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Rounded square background.
      if (roundedRectCover(x, y, S, S, S * 0.22) <= 0) blend(px, i, BG, 1);
      else continue;

      const u = x / S, v = y / S;

      // Broom handle: a thick accent stroke from upper-right to lower-left.
      const hw = S * 0.055;
      const hd = segmentDist(x, y, S * 0.72, S * 0.24, S * 0.44, S * 0.56);
      if (hd < hw) blend(px, i, ACCENT, Math.min(1, (hw - hd) / (SS * 0.9)));

      // Broom head: a trapezoid of bristles at the lower-left.
      const bristleTop = v > 0.52 && v < 0.6 && u > 0.26 && u < 0.52;
      const spread = (v - 0.56) * 0.9;
      const bristles =
        v >= 0.6 && v < 0.78 && u > 0.23 - spread && u < 0.55 + spread;
      if (bristleTop) blend(px, i, WHITE, 1);
      if (bristles) {
        // Vertical gaps between bristles.
        const band = Math.floor(((u - (0.23 - spread)) / ((0.55 + spread) - (0.23 - spread))) * 6);
        blend(px, i, band % 2 === 0 ? WHITE : ACCENT, 1);
      }

      // Three specks being swept to the right.
      for (const [cx, cy, cr] of [[0.68, 0.64, 0.03], [0.78, 0.7, 0.024], [0.72, 0.78, 0.02]]) {
        if (Math.hypot(u - cx, v - cy) < cr) blend(px, i, ACCENT, 1);
      }
    }
  }

  // Downsample the supersampled buffer to the target size (box filter).
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      const n = SS * SS, o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

mkdirSync(join(root, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, draw(size));
  writeFileSync(join(root, "icons", `icon-${size}.png`), png);
  console.log(`icons/icon-${size}.png (${png.length} bytes)`);
}

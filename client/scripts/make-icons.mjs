import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/icons");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const margin = Math.round(size * 0.16);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const paper = x < margin || y < margin || x >= size - margin || y >= size - margin;
      const i = row + 1 + x * 4;
      raw[i] = paper ? 243 : 14;
      raw[i + 1] = paper ? 239 : 106;
      raw[i + 2] = paper ? 228 : 74;
      raw[i + 3] = 255;
    }
  }
  const mark = (x0, y0, w, h, color) => {
    const x1 = Math.round(x0 * size);
    const y1 = Math.round(y0 * size);
    const x2 = Math.round((x0 + w) * size);
    const y2 = Math.round((y0 + h) * size);
    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) {
        const i = y * (size * 4 + 1) + 1 + x * 4;
        raw[i] = color[0];
        raw[i + 1] = color[1];
        raw[i + 2] = color[2];
      }
    }
  };
  const ink = [14, 106, 74];
  const paper = [243, 239, 228];
  for (const [x, y] of [
    [0.28, 0.28],
    [0.56, 0.28],
    [0.28, 0.56],
  ]) {
    mark(x, y, 0.16, 0.16, paper);
    mark(x + 0.04, y + 0.04, 0.08, 0.08, ink);
  }
  mark(0.56, 0.56, 0.06, 0.06, paper);
  mark(0.66, 0.56, 0.06, 0.06, paper);
  mark(0.56, 0.66, 0.06, 0.06, paper);
  mark(0.66, 0.66, 0.06, 0.06, paper);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), png(192));
fs.writeFileSync(path.join(outDir, "icon-512.png"), png(512));
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), png(180));
console.log("Iconos escritos en", outDir);

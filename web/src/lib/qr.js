/**
 * A QR code encoder in 200 lines (22 Sep 2026), for the two-step sign-in
 * setup: the otpauth:// URI as a square an authenticator app scans. Byte
 * mode, error level M, versions 1-40, mask chosen by the standard penalty.
 * The algorithm is Project Nayuki's QR-Code-generator (MIT), reduced to what
 * we need; the matrices were checked bit for bit against segno for a spread
 * of inputs, versions and masks before this shipped.
 *
 * Why not a package: the secret must never leave the browser (no image
 * service), the web has no QR dependency, and this is the one place a QR is
 * drawn. `encode(text)` returns { size, modules } where modules[y][x] is true
 * for a dark square; `QrSvg` in components/account renders it.
 */

// Error correction M: codewords per block and block counts per version (index = version).
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const ECL_FORMAT_BITS = 0; // M

const rawModules = (ver) => {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
};
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
const countBits = (ver) => (ver < 10 ? 8 : 16);

/* GF(256) with the QR polynomial 0x11D. */
const gfMul = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};
const rsDivisor = (degree) => {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
};
const rsRemainder = (data, divisor) => {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let j = 0; j < divisor.length; j += 1) result[j] ^= gfMul(divisor[j], factor);
  }
  return result;
};

const bytesOf = (text) => Array.from(new TextEncoder().encode(text));

const pickVersion = (len) => {
  for (let ver = 1; ver <= 40; ver += 1) {
    if (dataCodewords(ver) * 8 >= 4 + countBits(ver) + 8 * len) return ver;
  }
  throw new Error('Too long for a QR code');
};

const buildCodewords = (bytes, ver) => {
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1); };
  push(4, 4);
  push(bytes.length, countBits(ver));
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // Split into blocks, add ECC, interleave.
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (rawCw % numBlocks);
  const shortLen = Math.floor(rawCw / numBlocks);
  const blocks = [];
  const div = rsDivisor(eccLen);
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const datLen = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    for (let j = 0; j < blocks.length; j += 1) {
      if (i !== shortLen - eccLen || j >= numShort) out.push(blocks[j][i]);
    }
  }
  return out;
};

const alignmentPositions = (ver) => {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const num = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < num; pos -= step) result.splice(1, 0, pos);
  return result;
};

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function encode(text, { mask: forcedMask = -1 } = {}) {
  const bytes = bytesOf(text);
  const ver = pickVersion(bytes.length);
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  // Function patterns: timing, finders, alignment.
  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx; const y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignmentPositions(ver);
  for (let i = 0; i < ap.length; i += 1) for (let j = 0; j < ap.length; j += 1) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const data = (ECL_FORMAT_BITS << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, bit); set(b, a, bit);
    }
  }

  // Data, zig-zagging up and down from the right edge.
  const cw = buildCodewords(bytes, ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) for (let j = 0; j < 2; j += 1) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!isFunction[y][x] && i < cw.length * 8) {
        modules[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i += 1;
      }
    }
  }

  const applyMask = (m) => {
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      if (!isFunction[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x];
    }
  };
  const penalty = () => {
    let score = 0;
    const runs = (get) => {
      for (let a = 0; a < size; a += 1) {
        let color = false; let run = 0; const hist = [0, 0, 0, 0, 0, 0, 0];
        const add = (len) => { if (hist[0] === 0) len += size; hist.pop(); hist.unshift(len); };
        const count = () => {
          const n = hist[1];
          const core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
          return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) + (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
        };
        for (let b = 0; b < size; b += 1) {
          const c = get(a, b);
          if (c === color) {
            run += 1;
            if (run === 5) score += 3; else if (run > 5) score += 1;
          } else {
            add(run);
            if (!color) score += count() * 40;
            color = c; run = 1;
          }
        }
        if (color) { add(run); run = 0; }
        add(run + size);
        score += count() * 40;
      }
    };
    runs((y, x) => modules[y][x]);
    runs((x, y) => modules[y][x]);
    for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
    const dark = modules.flat().filter(Boolean).length;
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  };

  let mask = forcedMask;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m += 1) {
      applyMask(m); drawFormat(m);
      const p = penalty();
      if (p < best) { best = p; mask = m; }
      applyMask(m);
    }
  }
  applyMask(mask);
  drawFormat(mask);
  return { size, version: ver, mask, modules };
}

/** One SVG path string (the dark squares) for `<path d=…/>` on a viewBox of size×size. */
export const toPath = ({ size, modules }) => {
  let d = '';
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (modules[y][x]) d += `M${x} ${y}h1v1h-1z`;
  return d;
};

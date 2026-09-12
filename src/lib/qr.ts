/*
 * QR Code generator (native, in-app).
 *
 * Adapted from the MIT-licensed QR Code generator library by Project Nayuki
 * (https://www.nayuki.io/page/qr-code-generator-library). Vendored into this
 * application as owned app code: no npm dependency, no network calls, works
 * fully offline. Supports QR Model 2, versions 1-40, all 4 ECC levels.
 */

export type QrEcc = "low" | "medium" | "quartile" | "high";

type bit = number;
type byte = number;
type int = number;

interface Ecc {
  ordinal: int;
  formatBits: int;
}

const ECC: Record<QrEcc, Ecc> = {
  low: { ordinal: 0, formatBits: 1 },
  medium: { ordinal: 1, formatBits: 0 },
  quartile: { ordinal: 2, formatBits: 3 },
  high: { ordinal: 3, formatBits: 2 },
};

interface Mode {
  modeBits: int;
  numBitsCharCount: [int, int, int];
}

const MODES: Record<string, Mode> = {
  NUMERIC: { modeBits: 0x1, numBitsCharCount: [10, 12, 14] },
  ALPHANUMERIC: { modeBits: 0x2, numBitsCharCount: [9, 11, 13] },
  BYTE: { modeBits: 0x4, numBitsCharCount: [8, 16, 16] },
  KANJI: { modeBits: 0x8, numBitsCharCount: [8, 10, 12] },
  ECI: { modeBits: 0x7, numBitsCharCount: [0, 0, 0] },
};

interface QrSegment {
  mode: Mode;
  numChars: int;
  bitData: Array<bit>;
}

// Appends the given number of low-order bits of the given value to the buffer.
function appendBits(val: int, len: int, bb: Array<bit>): void {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError("Value out of range");
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getBit(x: int, i: int): boolean {
  return ((x >>> i) & 1) !== 0;
}

function assert(cond: boolean): void {
  if (!cond) throw new Error("Assertion error");
}

// ─── Segment factories ──────────────────────────────────────────────────────

function makeBytes(data: Readonly<Array<byte>>): QrSegment {
  const bb: Array<bit> = [];
  for (const b of data) appendBits(b, 8, bb);
  return { mode: MODES.BYTE, numChars: data.length, bitData: bb };
}

function makeNumeric(digits: string): QrSegment {
  if (!isNumeric(digits)) throw new RangeError("String contains non-numeric characters");
  const bb: Array<bit> = [];
  for (let i = 0; i < digits.length; ) {
    const n: int = Math.min(digits.length - i, 3);
    appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
    i += n;
  }
  return { mode: MODES.NUMERIC, numChars: digits.length, bitData: bb };
}

const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function makeAlphanumeric(text: string): QrSegment {
  if (!isAlphanumeric(text)) throw new RangeError("String contains unencodable characters in alphanumeric mode");
  const bb: Array<bit> = [];
  let i: int;
  for (i = 0; i + 2 <= text.length; i += 2) {
    let temp: int = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
    temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
    appendBits(temp, 11, bb);
  }
  if (i < text.length) appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
  return { mode: MODES.ALPHANUMERIC, numChars: text.length, bitData: bb };
}

function toUtf8ByteArray(str: string): Array<byte> {
  str = encodeURI(str);
  const result: Array<byte> = [];
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) !== "%") result.push(str.charCodeAt(i));
    else {
      result.push(parseInt(str.substring(i + 1, i + 3), 16));
      i += 2;
    }
  }
  return result;
}

function makeSegments(text: string): Array<QrSegment> {
  if (text === "") return [];
  if (isNumeric(text)) return [makeNumeric(text)];
  if (isAlphanumeric(text)) return [makeAlphanumeric(text)];
  return [makeBytes(toUtf8ByteArray(text))];
}

function isNumeric(text: string): boolean {
  return /^[0-9]*$/.test(text);
}

function isAlphanumeric(text: string): boolean {
  return /^[A-Z0-9 $%*+.\/:-]*$/.test(text);
}

function getTotalBits(segs: Readonly<Array<QrSegment>>, version: int): number {
  let result: number = 0;
  for (const seg of segs) {
    const ccbits: int = seg.mode.numBitsCharCount[Math.floor((version + 7) / 17)];
    if (seg.numChars >= (1 << ccbits)) return Infinity;
    result += 4 + ccbits + seg.bitData.length;
  }
  return result;
}

// ─── Specification tables ───────────────────────────────────────────────────

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const ECC_CODEWORDS_PER_BLOCK: Array<Array<int>> = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
];

const NUM_ERROR_CORRECTION_BLOCKS: Array<Array<int>> = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // High
];

function getNumRawDataModules(ver: int): int {
  if (ver < 1 || ver > 40) throw new RangeError("Version number out of range");
  let result: int = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign: int = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  assert(208 <= result && result <= 29648);
  return result;
}

function getNumDataCodewords(ver: int, ecl: Ecc): int {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
  );
}

// ─── Reed-Solomon ECC over GF(2^8 / 0x11D) ──────────────────────────────────

function reedSolomonComputeDivisor(degree: int): Array<byte> {
  if (degree < 1 || degree > 255) throw new RangeError("Degree out of range");
  const result: Array<byte> = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: Readonly<Array<byte>>, divisor: Readonly<Array<byte>>): Array<byte> {
  const result: Array<byte> = divisor.map(() => 0);
  for (const b of data) {
    const factor: byte = (b ^ result.shift()!) as byte;
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= reedSolomonMultiply(coef, factor)));
  }
  return result;
}

function reedSolomonMultiply(x: byte, y: byte): byte {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError("Byte out of range");
  let z: int = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  assert(z >>> 8 === 0);
  return z as byte;
}

// ─── Core encoder ───────────────────────────────────────────────────────────

// Returns a square grid of modules: true = dark. Minimum version is chosen
// automatically; the ECC level may be boosted if the data still fits.
export function encodeQr(text: string, eclLevel: QrEcc = "medium"): boolean[][] {
  let ecl: Ecc = ECC[eclLevel];
  const segs = makeSegments(text);

  // Find the minimal version that fits the data
  let version: int = 1;
  let dataUsedBits: int = 0;
  for (; ; version++) {
    const dataCapacityBits: int = getNumDataCodewords(version, ecl) * 8;
    const usedBits: number = getTotalBits(segs, version);
    if (usedBits <= dataCapacityBits) {
      dataUsedBits = usedBits;
      break;
    }
    if (version >= 40) throw new RangeError("Data too long");
  }
  // Increase the error correction level while the data still fits
  for (const newEcl of [ECC.medium, ECC.quartile, ECC.high]) {
    if (dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) {
      ecl = newEcl;
      break;
    }
  }

  // Concatenate all segments into a bit buffer
  const bb: Array<bit> = [];
  for (const seg of segs) {
    appendBits(seg.mode.modeBits, 4, bb);
    appendBits(seg.numChars, seg.mode.numBitsCharCount[Math.floor((version + 7) / 17)], bb);
    for (const b of seg.bitData) bb.push(b);
  }
  assert(bb.length === dataUsedBits);

  // Terminator, byte alignment, and pad bytes
  const dataCapacityBits: int = getNumDataCodewords(version, ecl) * 8;
  assert(bb.length <= dataCapacityBits);
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  assert(bb.length % 8 === 0);
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) appendBits(padByte, 8, bb);

  // Pack bits into codewords (big endian)
  const dataCodewords: Array<byte> = [];
  while (dataCodewords.length * 8 < bb.length) dataCodewords.push(0);
  bb.forEach((b: bit, i: int) => (dataCodewords[i >>> 3] |= b << (7 - (i & 7))));

  return buildMatrix(version, ecl, dataCodewords, -1);
}

function buildMatrix(version: int, ecl: Ecc, dataCodewords: Readonly<Array<byte>>, msk: int): boolean[][] {
  const size = version * 4 + 17;
  const modules: boolean[][] = [];
  const isFunction: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    modules.push(new Array<boolean>(size).fill(false));
    isFunction.push(new Array<boolean>(size).fill(false));
  }

  const setFunctionModule = (x: int, y: int, isDark: boolean): void => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  const drawFormatBits = (mask: int): void => {
    const data: int = (ecl.formatBits << 3) | mask;
    let rem: int = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits: int = ((data << 10) | rem) ^ 0x5412;
    assert(bits >>> 15 === 0);
    // First copy
    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(bits, i));
    setFunctionModule(8, 7, getBit(bits, 6));
    setFunctionModule(8, 8, getBit(bits, 7));
    setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(bits, i));
    // Second copy
    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(bits, i));
    setFunctionModule(8, size - 8, true); // Always dark
  };

  const drawVersion = (): void => {
    if (version < 7) return;
    let rem: int = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits: int = (version << 12) | rem;
    assert(bits >>> 18 === 0);
    for (let i = 0; i < 18; i++) {
      const color: boolean = getBit(bits, i);
      const a: int = size - 11 + (i % 3);
      const b: int = Math.floor(i / 3);
      setFunctionModule(a, b, color);
      setFunctionModule(b, a, color);
    }
  };

  const drawFinderPattern = (x: int, y: int): void => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist: int = Math.max(Math.abs(dx), Math.abs(dy));
        const xx: int = x + dx;
        const yy: int = y + dy;
        if (0 <= xx && xx < size && 0 <= yy && yy < size) setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };

  const drawAlignmentPattern = (x: int, y: int): void => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  };

  const getAlignmentPatternPositions = (): Array<int> => {
    if (version === 1) return [];
    const numAlign: int = Math.floor(version / 7) + 2;
    const step: int = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const result: Array<int> = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  // Draw all function patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }
  drawFinderPattern(3, 3);
  drawFinderPattern(size - 4, 3);
  drawFinderPattern(3, size - 4);
  const alignPatPos: Array<int> = getAlignmentPatternPositions();
  const numAlign: int = alignPatPos.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0))
        drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
    }
  }
  drawFormatBits(0); // Dummy mask; overwritten later
  drawVersion();

  // Add ECC and interleave into blocks
  if (dataCodewords.length !== getNumDataCodewords(version, ecl)) throw new RangeError("Invalid argument");
  const numBlocks: int = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version];
  const blockEccLen: int = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version];
  const rawCodewords: int = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks: int = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen: int = Math.floor(rawCodewords / numBlocks);
  const blocks: Array<Array<byte>> = [];
  const rsDiv: Array<byte> = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat: Array<byte> = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const eccBytes: Array<byte> = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(eccBytes));
  }
  const allCodewords: Array<byte> = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) allCodewords.push(block[i]);
    });
  }
  assert(allCodewords.length === rawCodewords);

  // Draw codewords in the zigzag scan
  let i: int = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x: int = right - j;
        const upward: boolean = ((right + 1) & 2) === 0;
        const y: int = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
  assert(i === allCodewords.length * 8);

  const applyMask = (mask: int): void => {
    if (mask < 0 || mask > 7) throw new RangeError("Mask value out of range");
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new Error("Unreachable");
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  const finderPenaltyCountPatterns = (runHistory: Readonly<Array<int>>): int => {
    const n: int = runHistory[1];
    const core: boolean = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (
      (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
      (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
    );
  };

  const finderPenaltyAddHistory = (currentRunLength: int, runHistory: Array<int>): void => {
    if (runHistory[0] === 0) currentRunLength += size; // Add light border to initial run
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  };

  const finderPenaltyTerminateAndCount = (currentRunColor: boolean, currentRunLength: int, runHistory: Array<int>): int => {
    if (currentRunColor) {
      finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += size;
    finderPenaltyAddHistory(currentRunLength, runHistory);
    return finderPenaltyCountPatterns(runHistory);
  };

  const getPenaltyScore = (): int => {
    let result: int = 0;
    // Rows
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory: Array<int> = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runX = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }
    // Columns
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory: Array<int> = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = modules[y][x];
          runY = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }
    // 2x2 blocks of same color
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color: boolean = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1])
          result += PENALTY_N2;
      }
    }
    // Balance of dark modules
    let dark: int = 0;
    for (const row of modules) dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
    const total: int = size * size;
    const k: int = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    assert(0 <= k && k <= 9);
    result += k * PENALTY_N4;
    return result;
  };

  // Choose the best mask automatically
  if (msk === -1) {
    let minPenalty: int = 1000000000;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormatBits(m);
      const penalty: int = getPenaltyScore();
      if (penalty < minPenalty) {
        msk = m;
        minPenalty = penalty;
      }
      applyMask(m); // Undo
    }
  }
  assert(0 <= msk && msk <= 7);
  applyMask(msk);
  drawFormatBits(msk);
  return modules;
}

// ─── SVG rendering helpers ──────────────────────────────────────────────────

// Renders the QR as a compact SVG path (1 module = 1 unit).
export function qrToSvgPath(text: string, ecl: QrEcc = "medium"): { size: number; path: string } {
  const grid = encodeQr(text, ecl);
  const n = grid.length;
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size: n, path };
}

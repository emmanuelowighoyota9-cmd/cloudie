/*
 * Native Code 128 (subset B) barcode generator.
 *
 * Renders a scannable Code 128 barcode as inline SVG entirely in-app —
 * no external barcode service, no network calls. Implements the standard
 * 107-symbol width table and the mod-103 check digit.
 */

// Each entry is the bar/space width pattern (b,s,b,s,b,s) summing to 11 modules.
// Index = code value 0-106. Entry 106 (stop) has 7 widths / 13 modules.
const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131",
  "211412", // 103 Start A
  "211214", // 104 Start B
  "211232", // 105 Start C
  "2331112", // 106 Stop (13 modules, includes termination bar)
];

const START_B = 104;
const QUIET_MODULES = 10; // Quiet zone: 10 modules on each side

/** Code 128B value for an ASCII character (32-126). */
function charValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) throw new RangeError(`Code 128B cannot encode character: ${JSON.stringify(ch)}`);
  return code - 32;
}

/** Returns the module runs (alternating bar/space, starting with bar) for the full symbol. */
function symbolRuns(data: string): Array<{ width: number; isBar: boolean }> {
  // Start + data + check digit + stop
  let checksum = START_B;
  const values: number[] = [START_B];
  for (let i = 0; i < data.length; i++) {
    const value = charValue(data[i]);
    values.push(value);
    checksum += value * (i + 1);
  }
  values.push(checksum % 103);
  values.push(106); // Stop

  const runs: Array<{ width: number; isBar: boolean }> = [];
  for (const value of values) {
    const pattern = PATTERNS[value];
    if (!pattern) throw new Error(`Invalid Code 128 pattern index: ${value}`);
    for (let i = 0; i < pattern.length; i++) {
      const width = Number(pattern[i]);
      if (!width) throw new Error(`Invalid Code 128 pattern: ${pattern}`);
      runs.push({ width, isBar: i % 2 === 0 });
    }
  }
  return runs;
}

/**
 * Renders a Code 128-B barcode for `data` as SVG rects.
 * Returns viewBox dimensions plus the bar rects (bars only; spaces are background).
 */
export function code128Svg(
  data: string,
  options?: { moduleWidth?: number; height?: number },
): { width: number; height: number; bars: Array<{ x: number; width: number }> } {
  const moduleWidth = options?.moduleWidth ?? 2;
  const height = options?.height ?? 80;
  const runs = symbolRuns(data);

  let totalModules = 0;
  for (const run of runs) totalModules += run.width;

  const bars: Array<{ x: number; width: number }> = [];
  let x = QUIET_MODULES; // leading quiet zone
  for (const run of runs) {
    if (run.isBar) bars.push({ x, width: run.width });
    x += run.width;
  }

  const totalWidthModules = totalModules + QUIET_MODULES * 2;
  return {
    width: totalWidthModules * moduleWidth,
    height,
    bars: bars.map((b) => ({
      x: b.x * moduleWidth,
      width: b.width * moduleWidth,
    })),
  };
}

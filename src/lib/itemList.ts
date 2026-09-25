/**
 * Item list / CSV reader.
 *
 * Turns pasted rows into structured line items so a brief can fill every row a
 * template renders. It accepts three shapes, in this order of confidence:
 *
 *   1. a delimited table, with or without a header row
 *        Item,Qty,Amount
 *        Oak veneer panels,24,1920.00
 *   2. a bulleted or numbered list
 *        - Oak veneer panels 24 1920.00
 *        1) Brushed brass handles x 60 @ 24.00
 *   3. inline rows in prose — handled by the brief parser, not here
 *
 * Deliberately dependency-free and deterministic: no DOM, no network, so it
 * behaves identically in the browser and on the server.
 */

export interface ParsedItemRow {
  description: string;
  qty: string;
  amount: string;
}

const HEADER_WORDS = new Set([
  "item", "items", "description", "product", "products", "qty", "quantity", "unit", "units",
  "price", "amount", "total", "cost", "ref", "reference", "sku", "code", "name", "hours",
  "hrs", "rate", "details", "line", "no",
]);

/** Strip surrounding quotes and whitespace from a single cell. */
function cleanCell(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

function isNumericCell(value: string): boolean {
  return /^-?[0-9]+(?:\.[0-9]+)?$/.test(value.replace(/[,\s]/g, ""));
}

function normaliseQty(value: string): string {
  return value.replace(/[^0-9.]/g, "").slice(0, 12);
}

/** Amounts become plain numbers: "$1,920.00" → "1920.00". */
function normaliseAmount(value: string): string {
  return value.replace(/[^0-9.]/g, "").slice(0, 20);
}

/**
 * Money, with thousands separators only in proper groups: "1,920.00" yes,
 * "24,1920.00" no — otherwise a comma-separated "qty,amount" pair would be
 * swallowed whole as a single number.
 */
const AMOUNT_PATTERN = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\\.[0-9]{2}";

/** Minimal CSV cell split with quoted-field support. */
function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells.map(cleanCell).filter((cell) => cell.length > 0);
}

/** A delimiter shared by at least two lines is a pasted table, not prose. */
function detectDelimiter(lines: string[]): string | null {
  let best: { delimiter: string; rows: number } = { delimiter: "", rows: 0 };
  for (const delimiter of [",", ";", "\t", "|"]) {
    const counts = lines
      .map((line) => line.split(delimiter).length - 1)
      .filter((count) => count > 0);
    if (counts.length < 2) continue;
    // The most common column count wins. A stray line with a different number
    // of separators — a prose sentence that happens to contain a comma — must
    // not veto an otherwise clean table.
    const tally = new Map<number, number>();
    for (const count of counts) tally.set(count, (tally.get(count) ?? 0) + 1);
    let rows = 0;
    for (const frequency of tally.values()) if (frequency > rows) rows = frequency;
    if (rows >= 2 && rows > best.rows) best = { delimiter, rows };
  }
  return best.delimiter || null;
}

/** One row from a table's cells: the longest text cell is the description. */
function rowFromCells(cells: string[]): ParsedItemRow | null {
  const values = cells.map(cleanCell).filter((cell) => cell.length > 0);
  if (values.length < 2) return null;
  const texts = values.filter((cell) => !isNumericCell(cell));
  const numbers = values.filter(isNumericCell);
  if (texts.length === 0 || numbers.length === 0) return null;
  // A header row ("Item,Qty,Amount") carries no numbers, so it never gets here.
  if (texts.every((cell) => HEADER_WORDS.has(cell.toLowerCase()))) return null;
  const description = texts.slice().sort((a, b) => b.length - a.length)[0];
  let qty = "";
  let amount = "";
  if (numbers.length >= 2) {
    qty = numbers[0];
    amount = numbers[numbers.length - 1];
  } else if (/[.,][0-9]{2}$/.test(numbers[0])) {
    amount = numbers[0];
  } else {
    qty = numbers[0];
  }
  return { description, qty: normaliseQty(qty), amount: amount ? normaliseAmount(amount) : "" };
}

function finishRow(rawDescription: string, qty: string, amount: string | undefined): ParsedItemRow | null {
  const description = rawDescription
    .replace(/^[-–—:|,\s]+/, "")
    .replace(/[-–—:|,\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (description.length < 2 || isNumericCell(description)) return null;
  return {
    description,
    qty: normaliseQty(qty),
    amount: amount ? normaliseAmount(amount) : "",
  };
}

/**
 * One line of a bulleted or free-form list:
 * "3 x Widgets 12.50", "Widgets x 3 @ 12.50", "Widgets 3 12.50", "Widgets 12.50".
 */
function rowFromLine(raw: string): ParsedItemRow | null {
  const line = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim();
  if (line.length < 3) return null;

  const CURRENCY = "(?:USD|EUR|GBP|NGN|CAD|AUD|KES|GHS|ZAR|INR)?";

  // 1. "3 x Oak veneer panels 1920.00" (amount optional)
  let match = new RegExp(
    `^(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(.+?)\\s*(?:@|at|for)?\\s*${CURRENCY}\\s*[$€£₦]?\\s*(${AMOUNT_PATTERN})?$`,
    "i",
  ).exec(line);
  if (match) return finishRow(match[2], match[1], match[3]);

  // 2. "Oak veneer panels x 3 @ 1920.00" (the multiplier is spaced out)
  match = new RegExp(
    `^(.+?)\\s+[x×]\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:@|at|for)?\\s*${CURRENCY}\\s*[$€£₦]?\\s*(${AMOUNT_PATTERN})?$`,
    "i",
  ).exec(line);
  if (match) return finishRow(match[1], match[2], match[3]);

  // 3. "Oak veneer panels 24 1920.00" — the qty must stand on its own, so
  //    "…192.00" is never read as qty 19 + amount 2.00.
  match = new RegExp(
    `^(.+?)\\s+(\\d+(?:[.,]\\d+)?)(?![\\d.,])\\s*(?:[x×@]\\s*)?(${AMOUNT_PATTERN})$`,
  ).exec(line);
  if (match) return finishRow(match[1], match[2], match[3]);

  // 4. "Oak veneer panels 1920.00"
  match = new RegExp(
    `^(.+?)\\s*${CURRENCY}\\s*[$€£₦]?\\s*(${AMOUNT_PATTERN})$`,
    "i",
  ).exec(line);
  if (match) return finishRow(match[1], "", match[2]);

  return null;
}

/**
 * A list line stays short. A paragraph that happens to end in money is prose,
 * not a row — the brief parser reads the inline rows out of it instead.
 */
function looksLikeRow(line: string): boolean {
  if (/^\s*(?:[-*•·]|\d+[.)])\s+/.test(line)) return true;
  return line.split(/\s+/).length <= 10;
}

/** How much structure the rows carry; used to pick between two readings. */
function completeness(rows: ParsedItemRow[]): number {
  return rows.reduce(
    (score, row) => score + (row.qty ? 1 : 0) + (row.amount ? 1 : 0) + (row.description.length >= 4 ? 1 : 0),
    0,
  );
}

function dedupeRows(rows: ParsedItemRow[]): ParsedItemRow[] {
  const seen = new Set<string>();
  const out: ParsedItemRow[] = [];
  for (const row of rows) {
    const key = row.description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Read a pasted list or CSV into rows. Returns [] when the text is prose. */
export function parseItemList(text: string): ParsedItemRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  // Both readings are attempted and the more structured one wins. "1,920.00"
  // in a bulleted line must not be read as the columns "1" and "920.00".
  const delimiter = detectDelimiter(lines);
  const tableRows: ParsedItemRow[] = [];
  const listRows: ParsedItemRow[] = [];
  for (const line of lines) {
    if (delimiter) {
      const row = rowFromCells(splitCells(line, delimiter));
      if (row) tableRows.push(row);
    }
    if (looksLikeRow(line)) {
      const row = rowFromLine(line);
      if (row) listRows.push(row);
    }
  }

  const table = dedupeRows(tableRows);
  const list = dedupeRows(listRows);
  if (table.length > 0 && completeness(table) >= completeness(list)) return table;
  return list.length > 0 ? list : table;
}

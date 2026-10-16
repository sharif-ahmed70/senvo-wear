/**
 * Money helpers for the stock intake page. Amounts are integer poisha
 * (1 taka = 100 poisha); taka strings are parsed digit by digit so no
 * floating-point value ever reaches a payload.
 */

const banglaDigits = "০১২৩৪৫৬৭৮৯";

/** Converts Bangla digits (০-৯) to ASCII so either keyboard works. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/gu, (digit) =>
    String(banglaDigits.indexOf(digit)),
  );
}

/**
 * Parses a taka amount such as "1,250.5" or "১২৫০" into poisha.
 * Throws for empty, negative, malformed or out-of-range input.
 */
export function takaToPoisha(taka: string): number {
  const parsed = parseTaka(taka);
  if (parsed === null) {
    throw new Error("Invalid amount");
  }
  return parsed;
}

/** Same as takaToPoisha but returns null instead of throwing. */
export function parseTaka(taka: string): number | null {
  if (typeof taka !== "string") return null;
  const clean = toAsciiDigits(taka.trim().replace(/,/gu, ""));
  if (!/^\d+(\.\d{1,2})?$/u.test(clean)) return null;
  const [whole = "0", fraction = ""] = clean.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/** Parses a whole piece count; Bangla digits allowed. Null when invalid. */
export function parseQuantity(value: string): number | null {
  const clean = toAsciiDigits(value.trim());
  if (!/^\d+$/u.test(clean)) return null;
  const quantity = Number(clean);
  return Number.isSafeInteger(quantity) ? quantity : null;
}

/** Profit per piece in poisha: sell − cost − transport (display only). */
export function calculateProfit(
  sellingPriceTaka: string,
  unitCostTaka: string,
  transportCostTaka = "0",
): number {
  return profitPerPieceMinor(
    takaToPoisha(sellingPriceTaka),
    takaToPoisha(unitCostTaka),
    takaToPoisha(transportCostTaka.trim() === "" ? "0" : transportCostTaka),
  );
}

export function profitPerPieceMinor(
  sellingPriceMinor: number,
  unitCostMinor: number,
  transportPerPieceMinor: number,
): number {
  return sellingPriceMinor - unitCostMinor - transportPerPieceMinor;
}

/** Even transport share per piece, rounded down to whole poisha. */
export function transportPerPieceMinor(
  transportMinor: number,
  pieces: number,
): number {
  if (pieces <= 0 || transportMinor <= 0) return 0;
  return Math.floor(transportMinor / pieces);
}

const groupFormatter = new Intl.NumberFormat("en-IN");

/** Formats poisha as "৳1,250" or "৳1,250.50" (lakh grouping). */
export function formatTaka(minor: number | bigint | string): string {
  let value: bigint;
  try {
    value = BigInt(minor);
  } catch {
    return "৳—";
  }
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = groupFormatter.format(absolute / 100n);
  const fraction = absolute % 100n;
  const text = fraction
    ? `${whole}.${fraction.toString().padStart(2, "0")}`
    : whole;
  return `${negative ? "−" : ""}৳${text}`;
}

/** Poisha to an editable taka string: 125000 → "1250", 125050 → "1250.50". */
export function takaInputFromMinor(minor: number): string {
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;
  return fraction
    ? `${whole}.${String(fraction).padStart(2, "0")}`
    : `${whole}`;
}

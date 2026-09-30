import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import { normalizeSlug } from "../../catalog/domain/value-objects.js";

const maxUnitCostMinor = 2_147_483_647;
const maxDistributionWork = 50_000_000;
const maxShareReductions = 64;

export type TransportDistributionLine = {
  quantity: number;
  unitCostMinor: number;
};

/**
 * Spreads a transport cost over every received piece and folds it into the
 * per-line unit cost, in integer minor units.
 *
 * Every piece first receives floor(transport / totalPieces). The remainder is
 * then assigned in whole-line increments (a line of quantity q absorbs q minor
 * units per +1 on its unit cost), preferring the largest lines, so that
 * SUM(quantity * unitCost) === goods + transport exactly. When the remainder
 * cannot be composed from the line quantities, the even share is lowered
 * step by step so a larger remainder can be composed instead.
 *
 * A purchase line carries a single unit cost, so an exact split is impossible
 * when the remainder cannot be composed from the line quantities (for example
 * one line of 12 pieces with a remainder of 8). That case is rejected instead
 * of silently rounding money.
 */
export function distributeTransportCost(
  lines: readonly TransportDistributionLine[],
  transportCostMinor: number,
): number[] {
  if (!Number.isSafeInteger(transportCostMinor) || transportCostMinor < 0) {
    throw new ValidationApplicationError(
      "Transport cost must be a non-negative integer in minor units.",
    );
  }
  if (lines.length === 0) {
    throw new ValidationApplicationError(
      "Stock intake requires at least one line.",
    );
  }
  const totalPieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (transportCostMinor === 0) {
    return lines.map((line) => line.unitCostMinor);
  }

  const quantities = lines.map((line) => line.quantity);
  const evenShare = Math.floor(transportCostMinor / totalPieces);
  const evenRemainder = transportCostMinor - evenShare * totalPieces;
  let perPiece = evenShare;
  let extraUnits: number[] | null = null;
  // Lowering the even share hands a larger remainder to the solver, which can
  // make an exact split possible (quantities 2 and 3 with transport 6).
  for (
    let lowered = 0;
    lowered <= Math.min(evenShare, maxShareReductions) && !extraUnits;
    lowered += 1
  ) {
    perPiece = evenShare - lowered;
    extraUnits = composeRemainder(
      quantities,
      evenRemainder + lowered * totalPieces,
    );
  }
  if (!extraUnits) {
    throw new BusinessRuleError(
      `Transport cost cannot be split exactly into whole minor-unit costs for these quantities. Use ${transportCostMinor - evenRemainder} minor units or another amount that divides evenly.`,
    );
  }

  const extra = extraUnits;
  const unitCosts = lines.map(
    (line, index) => line.unitCostMinor + perPiece + (extra[index] ?? 0),
  );
  if (unitCosts.some((unitCost) => unitCost > maxUnitCostMinor)) {
    throw new ValidationApplicationError(
      "Unit cost including transport exceeds the supported maximum.",
    );
  }
  return unitCosts;
}

function composeRemainder(
  quantities: readonly number[],
  remainder: number,
): number[] | null {
  const extra = quantities.map(() => 0);
  if (remainder === 0) {
    return extra;
  }
  if (remainder * quantities.length > maxDistributionWork) {
    return null;
  }

  // Unbounded coin-change reachability; larger lines are tried first so the
  // remainder lands on as many pieces as possible.
  const order = quantities
    .map((quantity, index) => ({ index, quantity }))
    .sort((left, right) => right.quantity - left.quantity);
  const via = new Int32Array(remainder + 1).fill(-1);
  const reachable = new Uint8Array(remainder + 1);
  reachable[0] = 1;
  for (const { index, quantity } of order) {
    for (let sum = quantity; sum <= remainder; sum += 1) {
      if (!reachable[sum] && reachable[sum - quantity]) {
        reachable[sum] = 1;
        via[sum] = index;
      }
    }
  }
  if (!reachable[remainder]) {
    return null;
  }
  let cursor = remainder;
  while (cursor > 0) {
    const index = via[cursor] ?? -1;
    const quantity = quantities[index];
    if (index < 0 || quantity === undefined) {
      return null;
    }
    extra[index] = (extra[index] ?? 0) + 1;
    cursor -= quantity;
  }
  return extra;
}

/**
 * CODE128 value format shared with the Admin barcode generation workflow.
 */
export function generateCode128BarcodeValue(): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 12)
    .toUpperCase();
  return `SV-${time}-${random}`;
}

export function normalizeIntakeName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function comparableIntakeName(value: string): string {
  return normalizeIntakeName(value).toLocaleUpperCase("en-US");
}

/**
 * Derives an uppercase A-Z/0-9/hyphen code from a display name. Names without
 * Latin letters or digits (for example Bangla names) fall back to `fallback`.
 */
export function deriveCatalogCode(
  name: string,
  fallback: string,
  maxLength = 16,
): string {
  const derived = normalizeIntakeName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maxLength)
    .replace(/-+$/u, "");
  return derived || fallback;
}

export function deriveProductCodePrefix(typeName: string): string {
  const letters = normalizeIntakeName(typeName)
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "");
  return letters.slice(0, 3) || "PRD";
}

export function formatSequenceCode(prefix: string, sequence: number): string {
  return `${prefix}-${sequence.toString().padStart(4, "0")}`;
}

export function nextSequenceNumber(
  prefix: string,
  existingCodes: readonly string[],
): number {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "u");
  let highest = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code.toUpperCase());
    const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
    if (Number.isSafeInteger(value) && value > highest) {
      highest = value;
    }
  }
  return highest + 1;
}

export function withNumericSuffix(
  base: string,
  attempt: number,
  maxLength: number,
): string {
  if (attempt <= 1) {
    return base.slice(0, maxLength);
  }
  const suffix = `-${attempt}`;
  return `${base.slice(0, maxLength - suffix.length).replace(/-+$/u, "")}${suffix}`;
}

/**
 * Builds a URL slug from a display name; falls back when the name has no
 * Latin letters or digits.
 */
export function slugFromIntakeName(value: string, fallback: string): string {
  const base = normalizeIntakeName(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100)
    .replace(/-+$/u, "");
  return normalizeSlug(base.length >= 2 ? base : fallback);
}

export async function createStockIntakeRequestSignature(
  normalizedInput: unknown,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(normalizedInput)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import { normalizeSlug } from "../../catalog/domain/value-objects.js";

const maxUnitCostMinor = 2_147_483_647;
const maxDistributionWork = 50_000_000;
const maxShareReductions = 64;

export type TransportDistributionLine = {
  quantity: number;
  unitCostMinor: number;
};

export type TransportDistribution = {
  /** Transport actually folded into unit costs; never above the request. */
  appliedMinor: number;
  unitCosts: number[];
};

/**
 * Spreads a transport cost over every received piece and folds it into the
 * per-line unit cost, in integer minor units, so that
 * SUM(quantity * unitCost) === goods + appliedMinor exactly.
 *
 * Every piece receives an even share; the rest is assigned in whole-line
 * increments (a line of quantity q absorbs q minor units per +1 on its unit
 * cost), preferring the largest lines. Lowering the even share can make more
 * totals composable (quantities 2 and 3 with transport 6).
 *
 * A purchase line carries a single unit cost, so some totals cannot be split
 * exactly (one line of 12 pieces cannot absorb 5,000). In that case the
 * nearest composable amount below the request is applied; it is never higher
 * than the request, and the even-share total floor(T / pieces) * pieces is
 * always composable.
 */
export function distributeTransportCost(
  lines: readonly TransportDistributionLine[],
  transportCostMinor: number,
): TransportDistribution {
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
  if (transportCostMinor === 0) {
    return {
      appliedMinor: 0,
      unitCosts: lines.map((line) => line.unitCostMinor),
    };
  }

  const quantities = lines.map((line) => line.quantity);
  const totalPieces = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const evenShare = Math.floor(transportCostMinor / totalPieces);
  const evenRemainder = transportCostMinor - evenShare * totalPieces;

  let maxLowered = Math.min(evenShare, maxShareReductions);
  while (
    maxLowered > 0 &&
    (evenRemainder + maxLowered * totalPieces) * quantities.length >
      maxDistributionWork
  ) {
    maxLowered -= 1;
  }
  const limit =
    (evenRemainder + maxLowered * totalPieces) * quantities.length >
    maxDistributionWork
      ? 0
      : evenRemainder + maxLowered * totalPieces;
  if (limit === 0) maxLowered = 0;
  const table = buildReachability(quantities, limit);

  // Largest applied total first; within a total, the most even share first.
  for (
    let applied = transportCostMinor;
    applied >= transportCostMinor - evenRemainder;
    applied -= 1
  ) {
    for (let lowered = 0; lowered <= maxLowered; lowered += 1) {
      const share = evenShare - lowered;
      const remainder = applied - share * totalPieces;
      if (remainder < 0 || remainder > limit || !table.reachable[remainder]) {
        continue;
      }
      const extra = reconstruct(quantities, table.via, remainder);
      const unitCosts = lines.map(
        (line, index) => line.unitCostMinor + share + (extra[index] ?? 0),
      );
      if (unitCosts.some((unitCost) => unitCost > maxUnitCostMinor)) {
        throw new ValidationApplicationError(
          "Unit cost including transport exceeds the supported maximum.",
        );
      }
      return { appliedMinor: applied, unitCosts };
    }
  }
  // Unreachable: remainder 0 at the even share is always composable.
  throw new BusinessRuleError("Transport cost could not be distributed.");
}

function buildReachability(quantities: readonly number[], limit: number) {
  // Unbounded coin-change reachability; larger lines are tried first so the
  // remainder lands on as many pieces as possible.
  const order = quantities
    .map((quantity, index) => ({ index, quantity }))
    .sort((left, right) => right.quantity - left.quantity);
  const via = new Int32Array(limit + 1).fill(-1);
  const reachable = new Uint8Array(limit + 1);
  reachable[0] = 1;
  for (const { index, quantity } of order) {
    for (let sum = quantity; sum <= limit; sum += 1) {
      if (!reachable[sum] && reachable[sum - quantity]) {
        reachable[sum] = 1;
        via[sum] = index;
      }
    }
  }
  return { reachable, via };
}

function reconstruct(
  quantities: readonly number[],
  via: Int32Array,
  remainder: number,
): number[] {
  const extra = quantities.map(() => 0);
  let cursor = remainder;
  while (cursor > 0) {
    const index = via[cursor] ?? -1;
    const quantity = quantities[index];
    if (index < 0 || quantity === undefined) {
      throw new BusinessRuleError("Transport cost could not be distributed.");
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

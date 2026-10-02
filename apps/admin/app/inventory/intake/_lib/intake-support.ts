import type { CategoryContract, ColorContract } from "@senvo/contracts";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiError } from "../../../_lib/api-client";
import { normalizeName } from "./intake-draft";

export const OWNER_ONLY_MESSAGE = "এই কাজের অনুমতি শুধু Owner-এর আছে।";

/** Permissions the backend checks before recording a stock intake. */
export const STOCK_INTAKE_PERMISSIONS: readonly AdminPermissionKey[] = [
  "CATALOG:CREATE",
  "CATALOG:UPDATE",
  "INVENTORY:CREATE",
  "INVENTORY:UPDATE",
  "PROCUREMENT:CREATE",
];

export function canRecordStockIntake(
  permissions: readonly AdminPermissionKey[] | null,
): boolean {
  // Unknown permissions (no session context yet): the server still decides.
  if (permissions === null) return true;
  return STOCK_INTAKE_PERMISSIONS.every((key) => permissions.includes(key));
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 0;
}

/** Plain Bangla message for a failed API call. */
export function intakeErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 403) return OWNER_ONLY_MESSAGE;
    if (error.status === 401) {
      return "Login-এর মেয়াদ শেষ। আবার Login করে চেষ্টা করুন।";
    }
    if (error.status === 0) {
      return "Server-এ পৌঁছানো যায়নি। Internet দেখে আবার Save চাপুন — একই মাল দুবার উঠবে না।";
    }
    if (error.status === 409 && /idempotency/iu.test(error.message)) {
      return "আগের চেষ্টাটা হয়তো Save হয়ে গেছে, কিন্তু তারপর তথ্য বদলানো হয়েছে। Inventory-তে দেখে নিন, তারপর নতুন করে তুলুন।";
    }
    const fields = error.fieldErrors
      ? Object.values(error.fieldErrors).flat().filter(Boolean)
      : [];
    const detail = fields.length ? ` (${fields.slice(0, 3).join("; ")})` : "";
    return `Save হয়নি: ${error.message}${detail} · Request ${error.requestId}`;
  }
  return error instanceof Error && error.message
    ? `Save হয়নি: ${error.message}`
    : "Save হয়নি। আবার চেষ্টা করুন।";
}

/** Plain Bangla message for a failed read (search, list, lookup). */
export function readErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 403) return OWNER_ONLY_MESSAGE;
    if (error.status === 401) {
      return "Login-এর মেয়াদ শেষ। আবার Login করুন।";
    }
    if (error.status === 0) {
      return "Server-এ পৌঁছানো যায়নি। Internet দেখে আবার চেষ্টা করুন।";
    }
    return `${error.message} · Request ${error.requestId}`;
  }
  return error instanceof Error && error.message
    ? error.message
    : "তথ্য আনা যায়নি। আবার চেষ্টা করুন।";
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_AUDIENCES = ["Men", "Women", "Kids"] as const;

/** Top-level active categories, with Men/Women/Kids always offered. */
export function audienceOptions(
  categories: readonly CategoryContract[],
): string[] {
  const names = categories
    .filter((category) => category.parentId === null)
    .filter((category) => category.status === "ACTIVE")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category) => category.name);
  return uniqueNames([...DEFAULT_AUDIENCES, ...names]);
}

/** Active child categories of the chosen audience. */
export function typeOptions(
  categories: readonly CategoryContract[],
  audience: string,
): string[] {
  const parent = categories.find(
    (category) =>
      category.parentId === null &&
      normalizeName(category.name) === normalizeName(audience),
  );
  if (!parent) return [];
  return uniqueNames(
    categories
      .filter((category) => category.parentId === parent.id)
      .filter((category) => category.status === "ACTIVE")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((category) => category.name),
  );
}

export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name.trim());
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Color swatches                                                      */
/* ------------------------------------------------------------------ */

const commonColorHex: Record<string, string> = {
  ash: "#B2BEB5",
  beige: "#E8DCC4",
  black: "#1B1B1B",
  blue: "#2F5DA8",
  brown: "#7B4B2A",
  cream: "#F3E9D2",
  green: "#2F7D4A",
  grey: "#8C8C8C",
  gray: "#8C8C8C",
  maroon: "#721522",
  mint: "#A8E6CF",
  navy: "#1F2A44",
  olive: "#6B6B2E",
  orange: "#E07B24",
  pink: "#E8A0B4",
  purple: "#6A3D9A",
  red: "#C62828",
  sky: "#87CEEB",
  white: "#FFFFFF",
  yellow: "#F2C94C",
  কালো: "#1B1B1B",
  সাদা: "#FFFFFF",
  লাল: "#C62828",
  নীল: "#2F5DA8",
  সবুজ: "#2F7D4A",
  মেরুন: "#721522",
};

/** Swatch colour for a typed colour name; null when unknown. */
export function swatchFor(
  name: string,
  colors: readonly ColorContract[],
): string | null {
  const key = normalizeName(name);
  if (!key) return null;
  const known = colors.find((color) => normalizeName(color.name) === key);
  if (known?.hexValue) return known.hexValue;
  const word = key.split(" ").find((part) => commonColorHex[part]);
  return word ? (commonColorHex[word] ?? null) : null;
}

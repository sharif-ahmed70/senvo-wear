import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type {
  BranchStatus,
  BranchType,
  PosCounterStatus,
  StockLocationStatus,
  StockLocationType,
} from "./models.js";

const displayNameMaxLength = 160;
const addressMaxLength = 240;
const cityMaxLength = 120;
const contactMaxLength = 254;
const codePattern = /^[A-Z0-9-]+$/;
const countryCodePattern = /^[A-Z]{2}$/;
const timezonePattern = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+0-9() .-]+$/;

export const branchStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const branchTypes = [
  "SHOWROOM",
  "WAREHOUSE",
  "OFFICE",
  "FULFILMENT",
  "HYBRID",
] as const;
export const stockLocationStatuses = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;
export const stockLocationTypes = [
  "WAREHOUSE",
  "SHOWROOM",
  "QC_HOLD",
  "DAMAGE_HOLD",
  "RETURN_HOLD",
  "TRANSIT",
  "OTHER",
] as const;
export const posCounterStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export function normalizeDisplayName(value: string, field = "name"): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new ValidationApplicationError(`${field} must not be blank.`);
  }
  if (normalized.length > displayNameMaxLength) {
    throw new ValidationApplicationError(
      `${field} must be ${displayNameMaxLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function normalizeOperationCode(value: string, field = "code"): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new ValidationApplicationError(`${field} must not be blank.`);
  }
  if (/\s/.test(normalized)) {
    throw new ValidationApplicationError(`${field} must not contain spaces.`);
  }
  if (normalized.length < 1 || normalized.length > 64) {
    throw new ValidationApplicationError(
      `${field} must be between 1 and 64 characters.`,
    );
  }
  if (!codePattern.test(normalized)) {
    throw new ValidationApplicationError(
      `${field} may contain only A-Z, 0-9, and hyphen.`,
    );
  }
  return normalized;
}

export function normalizeCountryCode(value = "BD"): string {
  const normalized = value.trim().toUpperCase();
  if (!countryCodePattern.test(normalized)) {
    throw new ValidationApplicationError(
      "countryCode must be an ISO-style two-letter code.",
    );
  }
  return normalized;
}

export function normalizeTimezone(value = "Asia/Dhaka"): string {
  const normalized = value.trim();
  if (!normalized || !timezonePattern.test(normalized)) {
    throw new ValidationApplicationError(
      "timezone must be a non-empty IANA timezone string.",
    );
  }
  return normalized;
}

export function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength = addressMaxLength,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new ValidationApplicationError(
      `${field} must be ${maxLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function normalizeOptionalCityLike(
  value: string | null | undefined,
  field: string,
): string | null {
  return normalizeOptionalText(value, field, cityMaxLength);
}

export function normalizeOptionalEmail(value?: string | null): string | null {
  const normalized = normalizeOptionalText(value, "email", contactMaxLength);
  if (normalized && !emailPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "email must be a valid email address.",
    );
  }
  return normalized;
}

export function normalizeOptionalPhone(value?: string | null): string | null {
  const normalized = normalizeOptionalText(value, "phone", 40);
  if (normalized && !phonePattern.test(normalized)) {
    throw new ValidationApplicationError(
      "phone may contain only digits, spaces, +, -, ., and parentheses.",
    );
  }
  return normalized;
}

export function normalizeBranchStatus(
  value: BranchStatus = "ACTIVE",
): BranchStatus {
  return assertEnumValue(value, branchStatuses, "branch status");
}

export function normalizeBranchType(
  value: BranchType = "SHOWROOM",
): BranchType {
  return assertEnumValue(value, branchTypes, "branch type");
}

export function normalizeStockLocationStatus(
  value: StockLocationStatus = "ACTIVE",
): StockLocationStatus {
  return assertEnumValue(value, stockLocationStatuses, "stock location status");
}

export function normalizeStockLocationType(
  value: StockLocationType = "WAREHOUSE",
): StockLocationType {
  return assertEnumValue(value, stockLocationTypes, "stock location type");
}

export function normalizePosCounterStatus(
  value: PosCounterStatus = "ACTIVE",
): PosCounterStatus {
  return assertEnumValue(value, posCounterStatuses, "POS counter status");
}

export function defaultStockLocationSellable(type: StockLocationType): boolean {
  return type === "SHOWROOM";
}

export function normalizeStockLocationSellable(
  type: StockLocationType,
  isSellable?: boolean,
): boolean {
  if (
    isSellable === true &&
    ["DAMAGE_HOLD", "QC_HOLD", "RETURN_HOLD", "TRANSIT"].includes(type)
  ) {
    throw new BusinessRuleError(
      `${type} stock locations cannot be sellable by default policy.`,
    );
  }
  return isSellable ?? defaultStockLocationSellable(type);
}

export function assertSameOrganization(
  expectedOrganizationId: string,
  actualOrganizationId: string,
  field: string,
): void {
  if (expectedOrganizationId !== actualOrganizationId) {
    throw new BusinessRuleError(
      `${field} must belong to the same organization.`,
    );
  }
}

function assertEnumValue<T extends string>(
  value: T,
  allowedValues: readonly T[],
  field: string,
): T {
  if (!allowedValues.includes(value)) {
    throw new ValidationApplicationError(`${field} is invalid.`);
  }
  return value;
}

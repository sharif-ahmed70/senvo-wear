import {
  BusinessRuleError,
  ConflictError,
  ValidationApplicationError,
} from "../../errors.js";

const displayNameMaxLength = 160;
const descriptionMaxLength = 2000;
const codePattern = /^[A-Z0-9-]+$/;
const skuPattern = /^[A-Z0-9-]+$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexPattern = /^#[0-9A-F]{6}$/;

export type CatalogStatus = "ACTIVE" | "INACTIVE";
export type OrganizationStatus = "ACTIVE" | "INACTIVE";
export type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ProductVariantStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

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

export function normalizeOptionalDescription(
  value?: string | null,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  if (normalized.length > descriptionMaxLength) {
    throw new ValidationApplicationError(
      `description must be ${descriptionMaxLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function normalizeCode(value: string, field = "code"): string {
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

export function normalizeSku(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new ValidationApplicationError("sku must not be blank.");
  }
  if (/\s/.test(normalized)) {
    throw new ValidationApplicationError("sku must not contain spaces.");
  }
  if (normalized.length < 3 || normalized.length > 80) {
    throw new ValidationApplicationError(
      "sku must be between 3 and 80 characters.",
    );
  }
  if (!skuPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "sku may contain only A-Z, 0-9, and hyphen.",
    );
  }
  return normalized;
}

export function normalizeSlug(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new ValidationApplicationError("slug must not be blank.");
  }
  if (normalized.length < 2 || normalized.length > 120) {
    throw new ValidationApplicationError(
      "slug must be between 2 and 120 characters.",
    );
  }
  if (!slugPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "slug must be lowercase, URL-safe, and hyphen-separated.",
    );
  }
  return normalized;
}

export function slugFromDisplayName(value: string): string {
  const base = normalizeDisplayName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalizeSlug(base);
}

export function normalizeHexValue(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!hexPattern.test(normalized)) {
    throw new ValidationApplicationError(
      "hexValue must use #RRGGBB format when provided.",
    );
  }
  return normalized;
}

export function normalizeComparableName(value: string): string {
  return normalizeDisplayName(value).toLocaleUpperCase("en-US");
}

export function assertNonNegativeSortOrder(sortOrder: number): number {
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new ValidationApplicationError(
      "sortOrder must be a non-negative integer.",
    );
  }
  return sortOrder;
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

export function assertCategoryParentIsNotSelf(
  categoryId: string | undefined,
  parentId: string | null | undefined,
): void {
  if (categoryId && parentId && categoryId === parentId) {
    throw new BusinessRuleError("Category cannot be its own parent.");
  }
}

export function assertCategoryParentDoesNotCreateCycle(
  categoryId: string,
  ancestorIdsFromParent: readonly string[],
): void {
  if (ancestorIdsFromParent.includes(categoryId)) {
    throw new BusinessRuleError(
      "Category parent would create a hierarchy cycle.",
    );
  }
}

export function assertVariantCombinationAvailable(exists: boolean): void {
  if (exists) {
    throw new ConflictError(
      "Product variant color-size combination already exists.",
    );
  }
}

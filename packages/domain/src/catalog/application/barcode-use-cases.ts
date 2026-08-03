import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type { BarcodeStatus, BarcodeType } from "../domain/models.js";
import type { BarcodeRepository } from "../repositories/catalog-repositories.js";

export async function createVariantBarcode(
  repository: BarcodeRepository,
  input: {
    organizationId: string;
    productVariantId: string;
    type: BarcodeType;
    value: string;
  },
) {
  const value = normalizeBarcodeValue(input.value, input.type);
  if (
    !(await repository.variantExists(
      input.organizationId,
      input.productVariantId,
    ))
  ) {
    throw new NotFoundError("Product variant was not found.");
  }
  if (await repository.existsByValue(value)) {
    throw new ConflictError("Barcode already exists.");
  }
  if (
    await repository.findActiveByVariant(
      input.organizationId,
      input.productVariantId,
    )
  ) {
    throw new ConflictError("Product variant already has an active barcode.");
  }
  return repository.create({
    organizationId: input.organizationId,
    productVariantId: input.productVariantId,
    status: "ACTIVE",
    type: input.type,
    value,
  });
}

export async function listVariantBarcodes(
  repository: BarcodeRepository,
  input: { organizationId: string; productVariantId: string },
) {
  if (
    !(await repository.variantExists(
      input.organizationId,
      input.productVariantId,
    ))
  ) {
    throw new NotFoundError("Product variant was not found.");
  }
  return repository.listByVariant(input.organizationId, input.productVariantId);
}

export async function updateBarcodeStatus(
  repository: BarcodeRepository,
  input: { barcodeId: string; organizationId: string; status: BarcodeStatus },
) {
  const barcode = await repository.findById(
    input.barcodeId,
    input.organizationId,
  );
  if (!barcode) throw new NotFoundError("Barcode was not found.");
  if (input.status === "ACTIVE" && barcode.status !== "ACTIVE") {
    const active = await repository.findActiveByVariant(
      input.organizationId,
      barcode.productVariantId,
    );
    if (active && active.id !== barcode.id) {
      throw new ConflictError("Product variant already has an active barcode.");
    }
  }
  const updated = await repository.updateStatus({
    id: barcode.id,
    organizationId: input.organizationId,
    status: input.status,
  });
  if (!updated) throw new NotFoundError("Barcode was not found.");
  return updated;
}

export async function lookupVariantByBarcode(
  repository: BarcodeRepository,
  input: { organizationId: string; value: string },
) {
  const result = await repository.lookupActive(
    input.organizationId,
    normalizeBarcodeLookupValue(input.value),
  );
  if (!result) throw new NotFoundError("Active barcode was not found.");
  return result;
}

export function normalizeBarcodeLookupValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 80 || /\s/u.test(normalized)) {
    throw new ValidationApplicationError("Barcode is invalid.");
  }
  return normalized;
}

export function normalizeBarcodeValue(
  value: string,
  type: BarcodeType,
): string {
  const normalized = normalizeBarcodeLookupValue(value);
  if (type === "EAN13") {
    validateNumericBarcode(normalized, 13, "EAN-13");
  } else if (type === "UPC") {
    validateNumericBarcode(normalized, 12, "UPC");
  } else if (type === "CODE128") {
    if (!/^[\x21-\x7E]{1,80}$/u.test(normalized)) {
      throw new ValidationApplicationError("CODE128 barcode is invalid.");
    }
  } else if (!/^[A-Z0-9._-]{3,64}$/u.test(normalized)) {
    throw new ValidationApplicationError("Internal barcode is invalid.");
  }
  return normalized;
}

function validateNumericBarcode(value: string, length: number, label: string) {
  if (!new RegExp(`^\\d{${length}}$`, "u").test(value)) {
    throw new ValidationApplicationError(
      `${label} barcode must contain ${length} digits.`,
    );
  }
  const digits = [...value].map(Number);
  const checkDigit = digits.pop();
  const sum = digits.reduce((total, digit, index) => {
    const weight = (digits.length - index) % 2 === 0 ? 1 : 3;
    return total + digit * weight;
  }, 0);
  if ((10 - (sum % 10)) % 10 !== checkDigit) {
    throw new BusinessRuleError(`${label} barcode check digit is invalid.`);
  }
}

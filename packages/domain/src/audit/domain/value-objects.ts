import { ValidationApplicationError } from "../../errors.js";
import type {
  AuditAction,
  AuditJsonValue,
  AuditMetadata,
  AuditResource,
} from "./models.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sensitiveMetadataKeyPattern =
  /(?:authorization|cookie|credential|password|secret|token)/iu;

export const auditActions = [
  "INVENTORY_MOVEMENT_POSTED",
  "POS_CHECKOUT_COMPLETED",
  "POS_PAYMENT_RECORDED",
  "POS_OUTSTANDING_PAYMENT_COLLECTED",
  "ONLINE_PAYMENT_CONFIRMED",
  "ONLINE_PAYMENT_REFUND_CONFIRMED",
  "ONLINE_PAYMENT_RECONCILED",
  "POS_REFUND_ISSUED",
  "POS_SALE_RETURN_RECORDED",
  "SALES_RECEIPT_ISSUED",
  "SALES_ORDER_CREATED",
  "STOREFRONT_ORDER_PLACED",
  "STOREFRONT_RESERVATION_EXPIRED",
  "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
] as const satisfies readonly AuditAction[];

export const auditResources = [
  "INVENTORY_MOVEMENT",
  "PAYMENT",
  "PAYMENT_COLLECTION",
  "PAYMENT_REFUND",
  "ONLINE_PAYMENT_ATTEMPT",
  "PROVIDER_REFUND",
  "POS_CHECKOUT",
  "POS_RETURN",
  "SALES_ORDER",
  "SALES_RECEIPT",
] as const satisfies readonly AuditResource[];

export function assertAuditId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

export function normalizeAuditAction(value: AuditAction): AuditAction {
  if (!auditActions.includes(value)) {
    throw new ValidationApplicationError("audit action is invalid.");
  }
  return value;
}

export function normalizeAuditResource(value: AuditResource): AuditResource {
  if (!auditResources.includes(value)) {
    throw new ValidationApplicationError("audit resource is invalid.");
  }
  return value;
}

export function normalizeAuditMetadata(
  value: AuditMetadata | undefined,
): AuditMetadata {
  const metadata = value ?? {};
  validateMetadataValue(metadata, 0);
  return metadata;
}

function validateMetadataValue(value: AuditJsonValue, depth: number): void {
  if (depth > 8) {
    throw new ValidationApplicationError(
      "audit metadata is too deeply nested.",
    );
  }
  if (Array.isArray(value)) {
    for (const item of value as readonly AuditJsonValue[]) {
      validateMetadataValue(item, depth + 1);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, nestedValue] of Object.entries(
    value as Readonly<Record<string, AuditJsonValue>>,
  )) {
    if (sensitiveMetadataKeyPattern.test(key)) {
      throw new ValidationApplicationError(
        "audit metadata cannot contain sensitive fields.",
      );
    }
    validateMetadataValue(nestedValue, depth + 1);
  }
}

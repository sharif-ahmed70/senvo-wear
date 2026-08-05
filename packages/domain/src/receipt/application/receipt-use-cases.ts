import { NotFoundError, ValidationApplicationError } from "../../errors.js";
import type { SalesReceipt } from "../domain/models.js";
import type { ReceiptRepository } from "../repositories/receipt-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function getSalesReceipt(
  repository: ReceiptRepository,
  input: { checkoutId: string; organizationId: string },
): Promise<SalesReceipt> {
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const organizationId = assertId(input.organizationId, "organizationId");
  const receipt = await repository.findByCheckoutId(checkoutId, organizationId);
  if (!receipt) throw new NotFoundError("Receipt was not found.");
  return receipt;
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

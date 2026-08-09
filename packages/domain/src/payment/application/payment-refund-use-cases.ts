import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type { PaymentMethod } from "../domain/models.js";
import type {
  PaymentRefund,
  PaymentRefundAccount,
  PaymentRefundReceipt,
} from "../domain/refund-models.js";
import type {
  PaymentRefundReceiptRepository,
  PaymentRefundRepository,
} from "../repositories/payment-refund-repository.js";
import {
  calculateCheckoutSettlement,
  calculatePaymentRefund,
  createPaymentRefundRequestSignature,
  normalizePaymentRefundInstructions,
} from "./payment-rules.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function getPaymentRefundAccount(
  repository: PaymentRefundRepository,
  input: { checkoutId: string; organizationId: string },
): Promise<PaymentRefundAccount> {
  const account = await repository.findAccountByCheckoutId(
    assertId(input.checkoutId, "checkoutId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!account) throw new NotFoundError("Checkout was not found.");
  return account;
}

export async function getPaymentRefundReceipt(
  repository: PaymentRefundReceiptRepository,
  input: { organizationId: string; refundId: string },
): Promise<PaymentRefundReceipt> {
  const receipt = await repository.findByRefundId(
    assertId(input.refundId, "refundId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!receipt) throw new NotFoundError("Refund receipt was not found.");
  return receipt;
}

export async function recordCheckoutRefund(
  repositories: {
    receipts: PaymentRefundReceiptRepository;
    refunds: PaymentRefundRepository;
  },
  input: {
    acceptedByUserId: string;
    checkoutId: string;
    idempotencyKey: string;
    issuedAt: Date;
    organizationId: string;
    receiptId: string;
    refundId: string;
    refunds: readonly {
      amountMinor: number;
      method: PaymentMethod;
      reference?: string | null;
    }[];
  },
): Promise<{
  account: PaymentRefundAccount;
  refund: PaymentRefund;
  replayed: boolean;
  refundDueBeforeMinor: number;
}> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const acceptedByUserId = assertId(input.acceptedByUserId, "acceptedByUserId");
  const refundId = assertId(input.refundId, "refundId");
  const receiptId = assertId(input.receiptId, "receiptId");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const refunds = normalizePaymentRefundInstructions(input.refunds);
  const requestSignature = createPaymentRefundRequestSignature(refunds);
  const preparation = await repositories.refunds.prepare(
    checkoutId,
    organizationId,
    acceptedByUserId,
  );
  if (!preparation) throw new NotFoundError("Checkout was not found.");
  if (!preparation.initialPayment)
    throw new BusinessRuleError(
      "Refund recording is unavailable for a legacy checkout.",
    );
  const replay = preparation.refunds.find(
    (item) => item.idempotencyKey === idempotencyKey,
  );
  if (replay) {
    if (replay.requestSignature !== requestSignature)
      throw new ConflictError(
        "Refund idempotency key was reused with different instructions.",
      );
    return {
      account: accountFromPreparation(preparation),
      refund: replay,
      replayed: true,
      refundDueBeforeMinor: 0,
    };
  }
  const grossReceivedMinor =
    preparation.initialPayment.paidMinor +
    preparation.collections.reduce((sum, item) => sum + item.amountMinor, 0);
  const cumulativeRefundedMinor = preparation.refunds.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const before = calculateCheckoutSettlement(
    preparation.initialPayment.payableMinor,
    grossReceivedMinor,
    preparation.returnCreditMinor,
    cumulativeRefundedMinor,
  );
  const amountMinor = calculatePaymentRefund(before.refundableMinor, refunds);
  const after = calculateCheckoutSettlement(
    preparation.initialPayment.payableMinor,
    grossReceivedMinor,
    preparation.returnCreditMinor,
    cumulativeRefundedMinor + amountMinor,
  );
  const suffix = refundId.replaceAll("-", "").toUpperCase();
  const receiptNumber = `REF-${suffix}`;
  const refund = await repositories.refunds.create({
    acceptedByUserId,
    amountMinor,
    checkoutId,
    createdAt: input.issuedAt,
    id: refundId,
    idempotencyKey,
    issuedAt: input.issuedAt,
    lines: refunds,
    organizationId,
    receiptId,
    receiptNumber,
    requestSignature,
    salesOrderId: preparation.salesOrderId,
  });
  await repositories.receipts.createPaymentRefundReceipt({
    acceptedByName: preparation.acceptedByName,
    adjustedPayableMinor: after.adjustedPayableMinor,
    amountMinor,
    checkoutId,
    cumulativeRefundedMinor: after.cumulativeRefundedMinor,
    grossReceivedMinor: after.grossReceivedMinor,
    id: receiptId,
    issuedAt: input.issuedAt,
    lines: refund.lines.map((line) => ({
      amountMinor: line.amountMinor,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    netReceivedMinor: after.netReceivedMinor,
    orderNumber: preparation.orderNumber,
    organizationAddressLine1: preparation.organizationAddressLine1,
    organizationAddressLine2: preparation.organizationAddressLine2,
    organizationCity: preparation.organizationCity,
    organizationDistrict: preparation.organizationDistrict,
    organizationEmail: preparation.organizationEmail,
    organizationId,
    organizationName: preparation.organizationName,
    organizationPhone: preparation.organizationPhone,
    organizationPostalCode: preparation.organizationPostalCode,
    originalPayableMinor: preparation.initialPayment.payableMinor,
    originalReceiptNumber: preparation.originalReceiptNumber,
    outstandingMinor: after.outstandingMinor,
    receiptNumber,
    refundableMinor: after.refundableMinor,
    refundId,
    returnCreditMinor: preparation.returnCreditMinor,
    salesOrderId: preparation.salesOrderId,
    settlementStatus: after.status,
  });
  const account = await repositories.refunds.findAccountByCheckoutId(
    checkoutId,
    organizationId,
  );
  if (!account) throw new Error("Refund account disappeared after recording.");
  return {
    account,
    refund,
    replayed: false,
    refundDueBeforeMinor: before.refundableMinor,
  };
}

function accountFromPreparation(
  preparation: NonNullable<
    Awaited<ReturnType<PaymentRefundRepository["prepare"]>>
  >,
): PaymentRefundAccount {
  if (!preparation.initialPayment)
    return {
      adjustedPayableMinor: null,
      checkoutId: preparation.checkoutId,
      cumulativeRefundedMinor: null,
      grossReceivedMinor: null,
      legacyPaymentRecorded: false,
      netReceivedMinor: null,
      orderNumber: preparation.orderNumber,
      organizationId: preparation.organizationId,
      originalPayableMinor: preparation.totalMinor,
      outstandingMinor: null,
      refundableMinor: null,
      refunds: preparation.refunds,
      returnCreditMinor: preparation.returnCreditMinor,
      settlementStatus: "UNRECORDED",
    };
  const gross =
    preparation.initialPayment.paidMinor +
    preparation.collections.reduce((sum, item) => sum + item.amountMinor, 0);
  const refunded = preparation.refunds.reduce(
    (sum, item) => sum + item.amountMinor,
    0,
  );
  const settlement = calculateCheckoutSettlement(
    preparation.initialPayment.payableMinor,
    gross,
    preparation.returnCreditMinor,
    refunded,
  );
  return {
    adjustedPayableMinor: settlement.adjustedPayableMinor,
    checkoutId: preparation.checkoutId,
    cumulativeRefundedMinor: settlement.cumulativeRefundedMinor,
    grossReceivedMinor: settlement.grossReceivedMinor,
    legacyPaymentRecorded: true,
    netReceivedMinor: settlement.netReceivedMinor,
    orderNumber: preparation.orderNumber,
    organizationId: preparation.organizationId,
    originalPayableMinor: preparation.initialPayment.payableMinor,
    outstandingMinor: settlement.outstandingMinor,
    refundableMinor: settlement.refundableMinor,
    refunds: preparation.refunds,
    returnCreditMinor: preparation.returnCreditMinor,
    settlementStatus: settlement.status,
  };
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value))
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  return value;
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/u.test(key))
    throw new ValidationApplicationError("idempotencyKey is invalid.");
  return key;
}

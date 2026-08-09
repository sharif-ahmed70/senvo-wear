import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type { ReceiptRepository } from "../../receipt/repositories/receipt-repository.js";
import {
  calculateCumulativePaymentBalance,
  calculateCheckoutSettlement,
  calculatePaymentCollection,
  createPaymentCollectionRequestSignature,
  normalizePaymentInstructions,
} from "./payment-rules.js";
import type {
  PaymentAccount,
  PaymentCollection,
  PaymentMethod,
} from "../domain/models.js";
import type { PaymentRepository } from "../repositories/payment-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function getPaymentAccount(
  repository: PaymentRepository,
  input: { checkoutId: string; organizationId: string },
): Promise<PaymentAccount> {
  const account = await repository.findAccountByCheckoutId(
    assertId(input.checkoutId, "checkoutId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!account) throw new NotFoundError("Checkout was not found.");
  return account;
}

export async function collectOutstandingPayment(
  repositories: {
    payments: PaymentRepository;
    receipts: ReceiptRepository;
  },
  input: {
    acceptedByUserId: string;
    checkoutId: string;
    collectedAt: Date;
    collectionId: string;
    idempotencyKey: string;
    organizationId: string;
    payments: readonly {
      amountMinor: number;
      method: PaymentMethod;
      reference?: string | null;
    }[];
    receiptId: string;
  },
): Promise<{
  account: PaymentAccount;
  collection: PaymentCollection;
  replayed: boolean;
}> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const acceptedByUserId = assertId(input.acceptedByUserId, "acceptedByUserId");
  const collectionId = assertId(input.collectionId, "collectionId");
  const receiptId = assertId(input.receiptId, "receiptId");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const payments = normalizePaymentInstructions(input.payments, false);
  const requestSignature = createPaymentCollectionRequestSignature(payments);
  const preparation = await repositories.payments.prepareCollection(
    checkoutId,
    organizationId,
    acceptedByUserId,
  );
  if (!preparation) throw new NotFoundError("Checkout was not found.");
  if (!preparation.initialPayment) {
    throw new BusinessRuleError(
      "Payment collection is unavailable for a legacy checkout.",
    );
  }
  const replay = preparation.collections.find(
    (collection) => collection.idempotencyKey === idempotencyKey,
  );
  if (replay) {
    if (replay.requestSignature !== requestSignature) {
      throw new ConflictError(
        "Payment collection idempotency key was reused with different instructions.",
      );
    }
    return {
      account: accountFromPreparation(preparation),
      collection: replay,
      replayed: true,
    };
  }
  const current = calculateCumulativePaymentBalance(
    preparation.initialPayment.payableMinor,
    preparation.initialPayment.paidMinor,
    preparation.collections.map((collection) => collection.amountMinor),
  );
  const settlement = calculateCheckoutSettlement(
    preparation.initialPayment.payableMinor,
    current.paidMinor,
    preparation.returnCreditMinor,
  );
  if (settlement.outstandingMinor === 0) {
    throw new BusinessRuleError("This checkout has no outstanding balance.");
  }
  const balance = calculatePaymentCollection(
    settlement.adjustedPayableMinor,
    current.paidMinor,
    payments,
  );
  const suffix = collectionId.replaceAll("-", "").toUpperCase();
  const receiptNumber = `PAY-${suffix}`;
  const collection = await repositories.payments.createCollection({
    acceptedByName: preparation.acceptedByName,
    acceptedByUserId,
    amountMinor: balance.amountMinor,
    balanceAfterMinor: balance.outstandingMinor,
    balanceBeforeMinor: balance.balanceBeforeMinor,
    checkoutId,
    createdAt: input.collectedAt,
    currencyCode: "BDT",
    id: collectionId,
    idempotencyKey,
    lines: payments,
    organizationId,
    paymentBatchId: preparation.initialPayment.id,
    receiptId,
    receiptNumber,
    requestSignature,
    salesOrderId: preparation.salesOrderId,
  });
  await repositories.receipts.createPaymentCollectionReceipt({
    acceptedByName: preparation.acceptedByName,
    amountMinor: balance.amountMinor,
    checkoutId,
    collectedAt: input.collectedAt,
    collectionId,
    cumulativePaidMinor: balance.paidMinor,
    currencyCode: "BDT",
    id: receiptId,
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
    outstandingMinor: balance.outstandingMinor,
    paymentStatus: balance.status,
    payments: collection.lines.map((line) => ({
      amountMinor: line.amountMinor,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    receiptNumber,
    salesOrderId: preparation.salesOrderId,
    totalMinor: settlement.adjustedPayableMinor,
  });
  const account = await repositories.payments.findAccountByCheckoutId(
    checkoutId,
    organizationId,
  );
  if (!account)
    throw new Error("Payment account disappeared after collection.");
  return { account, collection, replayed: false };
}

function accountFromPreparation(
  preparation: Awaited<ReturnType<PaymentRepository["prepareCollection"]>> & {},
): PaymentAccount {
  const initial = preparation.initialPayment;
  if (!initial) {
    return {
      adjustedPayableMinor: null,
      checkoutId: preparation.checkoutId,
      collections: [],
      cumulativePaidMinor: null,
      currencyCode: "BDT",
      initialPaidMinor: null,
      initialPayments: [],
      legacyPaymentRecorded: false,
      orderNumber: preparation.orderNumber,
      originalPayableMinor: preparation.totalMinor,
      organizationId: preparation.organizationId,
      outstandingMinor: null,
      refundableMinor: null,
      returnCreditMinor: preparation.returnCreditMinor,
      settlementStatus: "UNRECORDED",
      status: "UNRECORDED",
      totalMinor: preparation.totalMinor,
    };
  }
  const balance = calculateCumulativePaymentBalance(
    initial.payableMinor,
    initial.paidMinor,
    preparation.collections.map((collection) => collection.amountMinor),
  );
  const settlement = calculateCheckoutSettlement(
    initial.payableMinor,
    balance.paidMinor,
    preparation.returnCreditMinor,
  );
  return {
    adjustedPayableMinor: settlement.adjustedPayableMinor,
    checkoutId: preparation.checkoutId,
    collections: preparation.collections,
    cumulativePaidMinor: balance.paidMinor,
    currencyCode: "BDT",
    initialPaidMinor: initial.paidMinor,
    initialPayments: initial.lines,
    legacyPaymentRecorded: true,
    orderNumber: preparation.orderNumber,
    originalPayableMinor: initial.payableMinor,
    organizationId: preparation.organizationId,
    outstandingMinor: settlement.outstandingMinor,
    refundableMinor: settlement.refundableMinor,
    returnCreditMinor: settlement.returnCreditMinor,
    settlementStatus: settlement.status,
    status: settlement.status,
    totalMinor: initial.payableMinor,
  };
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/u.test(key)) {
    throw new ValidationApplicationError("idempotencyKey is invalid.");
  }
  return key;
}

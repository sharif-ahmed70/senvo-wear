import { describe, expect, it } from "vitest";
import { BusinessRuleError, ConflictError } from "../../errors.js";
import type {
  PaymentRefundAccount,
  PaymentRefundPreparation,
  PaymentRefundReceipt,
} from "../domain/refund-models.js";
import type {
  CreatePaymentRefundRecord,
  PaymentRefundReceiptRepository,
  PaymentRefundRepository,
} from "../repositories/payment-refund-repository.js";
import { calculateCheckoutSettlement } from "./payment-rules.js";
import { recordCheckoutRefund } from "./payment-refund-use-cases.js";

const ids = {
  batch: "10000000-0000-4000-8000-000000000001",
  checkout: "10000000-0000-4000-8000-000000000002",
  line: "10000000-0000-4000-8000-000000000003",
  organization: "10000000-0000-4000-8000-000000000004",
  order: "10000000-0000-4000-8000-000000000005",
  receipt: "10000000-0000-4000-8000-000000000006",
  refund: "10000000-0000-4000-8000-000000000007",
  session: "10000000-0000-4000-8000-000000000008",
  user: "10000000-0000-4000-8000-000000000009",
};
const now = new Date("2026-08-10T10:00:00.000Z");

describe("payment refund use cases", () => {
  it("records a split partial refund and immutable receipt", async () => {
    const refunds = new FakeRefunds(preparation());
    const receipts = new FakeRefundReceipts();
    const result = await recordCheckoutRefund(
      { receipts, refunds },
      input([
        { amountMinor: 1_000, method: "CASH" },
        { amountMinor: 500, method: "CARD", reference: " CARD-42 " },
      ]),
    );

    expect(result).toMatchObject({
      account: {
        cumulativeRefundedMinor: 1_500,
        grossReceivedMinor: 10_000,
        netReceivedMinor: 8_500,
        refundableMinor: 1_500,
        settlementStatus: "REFUND_DUE",
      },
      refund: { amountMinor: 1_500 },
      refundDueBeforeMinor: 3_000,
      replayed: false,
    });
    expect(result.refund.lines[1]).toMatchObject({ reference: "CARD-42" });
    expect(receipts.created).toMatchObject({
      amountMinor: 1_500,
      cumulativeRefundedMinor: 1_500,
      netReceivedMinor: 8_500,
      refundableMinor: 1_500,
    });
  });

  it("settles the exact remaining refund due", async () => {
    const prep = preparation();
    prep.refunds.push(refundRecord(1_000, "earlier-refund-001"));
    const result = await recordCheckoutRefund(
      { receipts: new FakeRefundReceipts(), refunds: new FakeRefunds(prep) },
      input([{ amountMinor: 2_000, method: "CASH" }]),
    );
    expect(result.account).toMatchObject({
      cumulativeRefundedMinor: 3_000,
      netReceivedMinor: 7_000,
      refundableMinor: 0,
      settlementStatus: "PAID",
    });
  });

  it("rejects zero due and over-refund without writing", async () => {
    const noDue = preparation();
    noDue.returnCreditMinor = 0;
    const noDueRepository = new FakeRefunds(noDue);
    await expect(
      recordCheckoutRefund(
        { receipts: new FakeRefundReceipts(), refunds: noDueRepository },
        input([{ amountMinor: 1, method: "CASH" }]),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(noDueRepository.writes).toBe(0);

    const overRepository = new FakeRefunds(preparation());
    await expect(
      recordCheckoutRefund(
        { receipts: new FakeRefundReceipts(), refunds: overRepository },
        input([{ amountMinor: 3_001, method: "CASH" }]),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(overRepository.writes).toBe(0);
  });

  it("replays the same key and payload without duplicate writes", async () => {
    const refunds = new FakeRefunds(preparation());
    const receipts = new FakeRefundReceipts();
    await recordCheckoutRefund(
      { receipts, refunds },
      input([{ amountMinor: 500, method: "CASH" }]),
    );
    const replay = await recordCheckoutRefund(
      { receipts, refunds },
      input([{ amountMinor: 500, method: "CASH" }]),
    );
    expect(replay.replayed).toBe(true);
    expect(refunds.writes).toBe(1);
    expect(receipts.writes).toBe(1);
  });

  it("rejects same-key different-payload idempotency conflicts", async () => {
    const prep = preparation();
    prep.refunds.push(refundRecord(500, "refund-attempt-001"));
    const refunds = new FakeRefunds(prep);
    await expect(
      recordCheckoutRefund(
        { receipts: new FakeRefundReceipts(), refunds },
        input([{ amountMinor: 600, method: "CASH" }]),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(refunds.writes).toBe(0);
  });

  it("rejects legacy checkouts without recorded payment details", async () => {
    const prep = preparation();
    prep.initialPayment = null;
    const refunds = new FakeRefunds(prep);
    await expect(
      recordCheckoutRefund(
        { receipts: new FakeRefundReceipts(), refunds },
        input([{ amountMinor: 500, method: "CASH" }]),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(refunds.writes).toBe(0);
  });
});

function input(
  refunds: Array<{
    amountMinor: number;
    method: "CASH" | "CARD";
    reference?: string;
  }>,
) {
  return {
    acceptedByUserId: ids.user,
    checkoutId: ids.checkout,
    idempotencyKey: "refund-attempt-001",
    issuedAt: now,
    organizationId: ids.organization,
    receiptId: ids.receipt,
    refundId: ids.refund,
    refunds,
  };
}

function preparation(): PaymentRefundPreparation {
  return {
    acceptedByName: "Cashier",
    checkoutId: ids.checkout,
    collections: [],
    initialPayment: {
      checkoutId: ids.checkout,
      counterId: ids.checkout,
      createdAt: now,
      currencyCode: "BDT",
      id: ids.batch,
      idempotencyKey: "checkout-payment-001",
      lines: [],
      organizationId: ids.organization,
      outstandingMinor: 0,
      paidMinor: 10_000,
      payableMinor: 10_000,
      requestSignature: "initial",
      salesOrderId: ids.order,
      salesSessionId: ids.session,
      staffId: ids.user,
      status: "PAID",
    },
    orderNumber: "POS-001",
    organizationAddressLine1: null,
    organizationAddressLine2: null,
    organizationCity: null,
    organizationDistrict: null,
    organizationEmail: null,
    organizationId: ids.organization,
    organizationName: "SENVO",
    organizationPhone: null,
    organizationPostalCode: null,
    originalReceiptNumber: "POS-RECEIPT-001",
    refunds: [],
    returnCreditMinor: 3_000,
    salesOrderId: ids.order,
    totalMinor: 10_000,
  };
}

function refundRecord(amountMinor: number, idempotencyKey: string) {
  return {
    acceptedByName: "Cashier",
    acceptedByUserId: ids.user,
    amountMinor,
    checkoutId: ids.checkout,
    createdAt: now,
    id: ids.refund,
    idempotencyKey,
    issuedAt: now,
    lines: [
      {
        amountMinor,
        createdAt: now,
        id: ids.line,
        lineNumber: 1,
        method: "CASH" as const,
        organizationId: ids.organization,
        reference: null,
        refundId: ids.refund,
      },
    ],
    organizationId: ids.organization,
    receiptId: ids.receipt,
    receiptNumber: "REF-001",
    requestSignature: `CASH:${amountMinor}:`,
    salesOrderId: ids.order,
  };
}

class FakeRefunds implements PaymentRefundRepository {
  writes = 0;
  constructor(private readonly prep: PaymentRefundPreparation) {}
  create(record: CreatePaymentRefundRecord) {
    this.writes += 1;
    const value = {
      ...refundRecord(record.amountMinor, record.idempotencyKey),
      id: record.id,
      lines: record.lines.map((line, index) => ({
        ...line,
        createdAt: record.createdAt,
        id: ids.line,
        lineNumber: index + 1,
        organizationId: record.organizationId,
        refundId: record.id,
      })),
      receiptId: record.receiptId,
      receiptNumber: record.receiptNumber,
      requestSignature: record.requestSignature,
    };
    this.prep.refunds.push(value);
    return Promise.resolve(value);
  }
  findAccountByCheckoutId(): Promise<PaymentRefundAccount> {
    const refunded = this.prep.refunds.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );
    const settlement = calculateCheckoutSettlement(
      10_000,
      10_000,
      this.prep.returnCreditMinor,
      refunded,
    );
    return Promise.resolve({
      adjustedPayableMinor: settlement.adjustedPayableMinor,
      checkoutId: ids.checkout,
      cumulativeRefundedMinor: settlement.cumulativeRefundedMinor,
      grossReceivedMinor: settlement.grossReceivedMinor,
      legacyPaymentRecorded: true,
      netReceivedMinor: settlement.netReceivedMinor,
      orderNumber: "POS-001",
      organizationId: ids.organization,
      originalPayableMinor: 10_000,
      outstandingMinor: settlement.outstandingMinor,
      refundableMinor: settlement.refundableMinor,
      refunds: this.prep.refunds,
      returnCreditMinor: this.prep.returnCreditMinor,
      settlementStatus: settlement.status,
    });
  }
  prepare() {
    return Promise.resolve(this.prep);
  }
}

class FakeRefundReceipts implements PaymentRefundReceiptRepository {
  created?: PaymentRefundReceipt;
  writes = 0;
  createPaymentRefundReceipt(record: PaymentRefundReceipt) {
    this.created = record;
    this.writes += 1;
    return Promise.resolve(record);
  }
  findByRefundId() {
    return Promise.resolve(this.created ?? null);
  }
}

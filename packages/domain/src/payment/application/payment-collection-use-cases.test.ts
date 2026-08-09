import { BusinessRuleError, ConflictError } from "../../errors.js";
import type {
  PaymentAccount,
  PaymentCollection,
  PaymentCollectionPreparation,
} from "../domain/models.js";
import type { PaymentRepository } from "../repositories/payment-repository.js";
import type { ReceiptRepository } from "../../receipt/repositories/receipt-repository.js";
import { describe, expect, it } from "vitest";
import { collectOutstandingPayment } from "./payment-collection-use-cases.js";

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  checkout: "10000000-0000-4000-8000-000000000002",
  order: "10000000-0000-4000-8000-000000000003",
  batch: "10000000-0000-4000-8000-000000000004",
  user: "10000000-0000-4000-8000-000000000005",
  collection: "10000000-0000-4000-8000-000000000006",
  receipt: "10000000-0000-4000-8000-000000000007",
};
const now = new Date("2026-08-09T10:00:00.000Z");

describe("outstanding payment collection", () => {
  it("records a partial collection and immutable receipt snapshot", async () => {
    const payments = new FakePayments(preparation());
    const receipts = new FakeReceipts();
    const result = await collectOutstandingPayment(
      { payments, receipts },
      input(2_000),
    );
    expect(result).toMatchObject({
      replayed: false,
      account: { cumulativePaidMinor: 5_000, outstandingMinor: 5_000 },
      collection: {
        amountMinor: 2_000,
        balanceBeforeMinor: 7_000,
        balanceAfterMinor: 5_000,
      },
    });
    expect(receipts.created).toMatchObject({
      acceptedByName: "Cashier",
      cumulativePaidMinor: 5_000,
      outstandingMinor: 5_000,
      totalMinor: 10_000,
    });
  });

  it("replays the same idempotency request without another write", async () => {
    const prep = preparation();
    const existing = collection(2_000);
    prep.collections.push(existing);
    const payments = new FakePayments(prep);
    const receipts = new FakeReceipts();
    const result = await collectOutstandingPayment(
      { payments, receipts },
      input(2_000),
    );
    expect(result.replayed).toBe(true);
    expect(payments.writes).toBe(0);
    expect(receipts.created).toBeUndefined();
  });

  it("rejects an idempotency key reused with another amount", async () => {
    const prep = preparation();
    prep.collections.push(collection(2_000));
    await expect(
      collectOutstandingPayment(
        { payments: new FakePayments(prep), receipts: new FakeReceipts() },
        input(1_000),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows another partial collection with a different key", async () => {
    const prep = preparation();
    prep.collections.push(collection(2_000));
    const payments = new FakePayments(prep);
    const result = await collectOutstandingPayment(
      { payments, receipts: new FakeReceipts() },
      input(1_000, "payment-collection-002"),
    );
    expect(result).toMatchObject({
      replayed: false,
      account: { cumulativePaidMinor: 6_000, outstandingMinor: 4_000 },
    });
    expect(payments.writes).toBe(1);
  });

  it("replays an existing collection after the account became paid", async () => {
    const prep = preparation();
    prep.collections.push(collection(7_000));
    const result = await collectOutstandingPayment(
      { payments: new FakePayments(prep), receipts: new FakeReceipts() },
      input(7_000),
    );
    expect(result).toMatchObject({
      replayed: true,
      account: { outstandingMinor: 0, status: "PAID" },
    });
  });

  it("rejects legacy checkout collection without canonical opening payment", async () => {
    const prep = preparation();
    prep.initialPayment = null;
    await expect(
      collectOutstandingPayment(
        { payments: new FakePayments(prep), receipts: new FakeReceipts() },
        input(1_000),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("cannot collect above the return-adjusted amount due", async () => {
    const adjusted = preparation();
    adjusted.returnCreditMinor = 2_000;
    await expect(
      collectOutstandingPayment(
        { payments: new FakePayments(adjusted), receipts: new FakeReceipts() },
        input(5_001),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const valid = preparation();
    valid.returnCreditMinor = 2_000;
    const receipts = new FakeReceipts();
    await collectOutstandingPayment(
      { payments: new FakePayments(valid), receipts },
      input(5_000),
    );
    expect(receipts.created).toMatchObject({
      cumulativePaidMinor: 8_000,
      outstandingMinor: 0,
      totalMinor: 8_000,
    });
  });
});

function input(amountMinor: number, idempotencyKey = "payment-collection-001") {
  return {
    acceptedByUserId: ids.user,
    checkoutId: ids.checkout,
    collectedAt: now,
    collectionId: ids.collection,
    idempotencyKey,
    organizationId: ids.organization,
    payments: [{ amountMinor, method: "CASH" as const }],
    receiptId: ids.receipt,
  };
}
function preparation(): PaymentCollectionPreparation {
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
      lines: [
        {
          amountMinor: 3_000,
          createdAt: now,
          id: ids.receipt,
          lineNumber: 1,
          method: "CASH",
          organizationId: ids.organization,
          paymentBatchId: ids.batch,
          reference: null,
        },
      ],
      organizationId: ids.organization,
      outstandingMinor: 7_000,
      paidMinor: 3_000,
      payableMinor: 10_000,
      requestSignature: "initial",
      salesOrderId: ids.order,
      salesSessionId: ids.checkout,
      staffId: ids.user,
      status: "PARTIALLY_PAID",
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
    returnCreditMinor: 0,
    salesOrderId: ids.order,
    totalMinor: 10_000,
  };
}
function collection(amountMinor: number): PaymentCollection {
  return {
    acceptedByName: "Cashier",
    acceptedByUserId: ids.user,
    amountMinor,
    balanceAfterMinor: 7_000 - amountMinor,
    balanceBeforeMinor: 7_000,
    checkoutId: ids.checkout,
    createdAt: now,
    currencyCode: "BDT",
    id: ids.collection,
    idempotencyKey: "payment-collection-001",
    lines: [
      {
        amountMinor,
        collectionId: ids.collection,
        createdAt: now,
        id: ids.receipt,
        lineNumber: 1,
        method: "CASH",
        organizationId: ids.organization,
        reference: null,
      },
    ],
    organizationId: ids.organization,
    receiptId: ids.receipt,
    receiptNumber: "PAY-001",
    requestSignature: JSON.stringify({
      payments: [{ amountMinor, method: "CASH", reference: null }],
    }),
    salesOrderId: ids.order,
  };
}
class FakePayments implements PaymentRepository {
  writes = 0;
  constructor(private readonly prep: PaymentCollectionPreparation) {}
  create(): Promise<never> {
    return Promise.reject(new Error("Not used."));
  }
  prepareCollection() {
    return Promise.resolve(this.prep);
  }
  createCollection(
    record: Parameters<PaymentRepository["createCollection"]>[0],
  ) {
    this.writes += 1;
    const value = collection(record.amountMinor);
    this.prep.collections.push(value);
    return Promise.resolve(value);
  }
  findAccountByCheckoutId(): Promise<PaymentAccount> {
    const collected = this.prep.collections.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );
    const outstandingMinor = 7_000 - collected;
    return Promise.resolve({
      adjustedPayableMinor: 10_000,
      checkoutId: ids.checkout,
      collections: this.prep.collections,
      cumulativePaidMinor: 3_000 + collected,
      currencyCode: "BDT",
      initialPaidMinor: 3_000,
      initialPayments: [
        { amountMinor: 3_000, method: "CASH", reference: null },
      ],
      legacyPaymentRecorded: true,
      orderNumber: "POS-001",
      originalPayableMinor: 10_000,
      organizationId: ids.organization,
      outstandingMinor,
      refundableMinor: 0,
      returnCreditMinor: 0,
      settlementStatus: outstandingMinor === 0 ? "PAID" : "PARTIALLY_PAID",
      status: outstandingMinor === 0 ? "PAID" : "PARTIALLY_PAID",
      totalMinor: 10_000,
    });
  }
}
class FakeReceipts implements ReceiptRepository {
  created?: Parameters<ReceiptRepository["createPaymentCollectionReceipt"]>[0];
  create(): Promise<never> {
    return Promise.reject(new Error("Not used."));
  }
  findByCheckoutId() {
    return Promise.resolve(null);
  }
  findPaymentCollectionReceiptById() {
    return Promise.resolve(null);
  }
  createPaymentCollectionReceipt(
    record: Parameters<ReceiptRepository["createPaymentCollectionReceipt"]>[0],
  ) {
    this.created = record;
    return Promise.resolve({ ...record, payments: [...record.payments] });
  }
}

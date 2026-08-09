import { describe, expect, it } from "vitest";
import type {
  CreatePosSaleReturnRecord,
  InventoryMovement,
  PosReturnAccount,
  PosReturnPreparation,
  PosReturnReceiptRepository,
  PosReturnRepository,
} from "../../index.js";
import { BusinessRuleError, ConflictError } from "../../errors.js";
import {
  calculateAllocatedReturnCredit,
  recordPosSaleReturn,
} from "./return-use-cases.js";

const ids = {
  checkout: "10000000-0000-4000-8000-000000000001",
  destination: "10000000-0000-4000-8000-000000000002",
  line: "10000000-0000-4000-8000-000000000003",
  lineTwo: "10000000-0000-4000-8000-000000000011",
  movement: "10000000-0000-4000-8000-000000000004",
  order: "10000000-0000-4000-8000-000000000005",
  organization: "10000000-0000-4000-8000-000000000006",
  receipt: "10000000-0000-4000-8000-000000000007",
  saleReturn: "10000000-0000-4000-8000-000000000008",
  user: "10000000-0000-4000-8000-000000000009",
  variant: "10000000-0000-4000-8000-000000000010",
  variantTwo: "10000000-0000-4000-8000-000000000012",
};
const now = new Date("2026-08-10T08:00:00.000Z");

describe("POS sale returns", () => {
  it("allocates every minor unit exactly across repeated partial returns", () => {
    const credits = [
      calculateAllocatedReturnCredit(100, 3, 0, 1),
      calculateAllocatedReturnCredit(100, 3, 1, 1),
      calculateAllocatedReturnCredit(100, 3, 2, 1),
    ];
    expect(credits).toEqual([33, 33, 34]);
    expect(credits.reduce((total, credit) => total + credit, 0)).toBe(100);
  });

  it("supports a multi-line return with server-derived credits", async () => {
    const prep = preparation();
    prep.order.lines.push({
      colorSnapshot: "White",
      id: ids.lineTwo,
      lineTotalMinor: 2_500,
      productNameSnapshot: "Polo",
      productVariantId: ids.variantTwo,
      quantity: 2,
      sizeSnapshot: "L",
      skuSnapshot: "POLO-WHT-L",
      unitPriceMinor: 1_250,
    });
    prep.order.totalMinor = 12_500;
    prep.initialPayment = { paidMinor: 12_500, payableMinor: 12_500 };
    const result = await recordPosSaleReturn(
      {
        inventory: inventory(),
        receipts: new FakeReturnReceipts(),
        returns: new FakeReturns(prep),
      },
      {
        ...input(),
        lines: [
          { quantity: 1, salesOrderLineId: ids.line },
          { quantity: 2, salesOrderLineId: ids.lineTwo },
        ],
      },
    );
    expect(result.saleReturn.lines).toHaveLength(2);
    expect(result.saleReturn.totalCreditMinor).toBe(5_833);
  });

  it("records inventory intake, return credit, and receipt atomically through injected repositories", async () => {
    const returns = new FakeReturns(preparation());
    const receipts = new FakeReturnReceipts();
    const result = await recordPosSaleReturn(
      { inventory: inventory(), receipts, returns },
      input(),
    );
    expect(result.replayed).toBe(false);
    expect(result.saleReturn.totalCreditMinor).toBe(3_333);
    expect(result.account.returnCreditMinor).toBe(3_333);
    expect(receipts.created?.adjustedPayableMinor).toBe(6_667);
    expect(receipts.created?.checkoutId).toBe(ids.checkout);
  });

  it("rejects quantities beyond the remaining sold quantity", async () => {
    const prep = preparation();
    prep.returns = [saleReturn(2, 6_666, "prior-return")];
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(prep),
        },
        { ...input(), lines: [{ quantity: 2, salesOrderLineId: ids.line }] },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it.each([0, -1])("rejects a return quantity of %s", async (quantity) => {
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(preparation()),
        },
        {
          ...input(),
          lines: [{ quantity, salesOrderLineId: ids.line }],
        },
      ),
    ).rejects.toThrow("return quantity is invalid");
  });

  it("rejects unknown and exhausted sale lines", async () => {
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(preparation()),
        },
        {
          ...input(),
          lines: [{ quantity: 1, salesOrderLineId: ids.lineTwo }],
        },
      ),
    ).rejects.toThrow("does not belong to this sale");
    const exhausted = preparation();
    exhausted.returns = [saleReturn(3, 10_000, "prior-return")];
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(exhausted),
        },
        input(),
      ),
    ).rejects.toThrow("already fully returned");
  });

  it("rejects legacy checkouts and sellable return destinations", async () => {
    const legacy = preparation();
    legacy.initialPayment = null;
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(legacy),
        },
        input(),
      ),
    ).rejects.toThrow("legacy payment checkout");
    const sellable = preparation();
    if (sellable.destination) sellable.destination.isSellable = true;
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(sellable),
        },
        input(),
      ),
    ).rejects.toThrow("Return hold");
    const inactive = preparation();
    if (inactive.destination) inactive.destination.status = "INACTIVE";
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(inactive),
        },
        input(),
      ),
    ).rejects.toThrow("Return hold");
  });

  it("rejects invalid reasons and unsafe money inputs", async () => {
    await expect(
      recordPosSaleReturn(
        {
          inventory: inventory(),
          receipts: new FakeReturnReceipts(),
          returns: new FakeReturns(preparation()),
        },
        { ...input(), reasonCode: "NOT_A_REASON" as never },
      ),
    ).rejects.toThrow("Return reason is invalid");
    expect(
      calculateAllocatedReturnCredit(
        2_147_483_647,
        2_147_483_647,
        2_147_483_646,
        1,
      ),
    ).toBe(1);
    expect(() =>
      calculateAllocatedReturnCredit(Number.MAX_SAFE_INTEGER, 1, 0, 1),
    ).toThrow("line total is invalid");
  });

  it("replays the same request and rejects an idempotency conflict", async () => {
    const prep = preparation();
    const signature = JSON.stringify({
      destinationLocationId: ids.destination,
      lines: [{ quantity: 1, salesOrderLineId: ids.line }],
      reasonCode: "SIZE_OR_FIT",
      reasonNote: null,
    });
    prep.returns = [saleReturn(1, 3_333, "return-request-001", signature)];
    const returns = new FakeReturns(prep);
    const replay = await recordPosSaleReturn(
      { inventory: inventory(), receipts: new FakeReturnReceipts(), returns },
      input(),
    );
    expect(replay.replayed).toBe(true);
    await expect(
      recordPosSaleReturn(
        { inventory: inventory(), receipts: new FakeReturnReceipts(), returns },
        { ...input(), reasonCode: "DEFECTIVE" },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

function input() {
  return {
    acceptedByUserId: ids.user,
    checkoutId: ids.checkout,
    destinationLocationId: ids.destination,
    idempotencyKey: "return-request-001",
    lines: [{ quantity: 1, salesOrderLineId: ids.line }],
    organizationId: ids.organization,
    reasonCode: "SIZE_OR_FIT" as const,
    receiptId: ids.receipt,
    returnId: ids.saleReturn,
    returnedAt: now,
  };
}

function preparation(): PosReturnPreparation {
  return {
    acceptedByName: "Cashier",
    checkoutId: ids.checkout,
    collections: [],
    destination: {
      id: ids.destination,
      isSellable: false,
      name: "Return hold",
      status: "ACTIVE",
      type: "RETURN_HOLD",
    },
    initialPayment: { paidMinor: 10_000, payableMinor: 10_000 },
    order: {
      fulfillmentMovementId: ids.movement,
      id: ids.order,
      lines: [
        {
          colorSnapshot: "Black",
          id: ids.line,
          lineTotalMinor: 10_000,
          productNameSnapshot: "T-shirt",
          productVariantId: ids.variant,
          quantity: 3,
          sizeSnapshot: "M",
          skuSnapshot: "TS-BLK-M",
          unitPriceMinor: 3_334,
        },
      ],
      orderNumber: "POS-001",
      status: "FULFILLED",
      totalMinor: 10_000,
    },
    organization: {
      addressLine1: null,
      addressLine2: null,
      city: null,
      district: null,
      email: null,
      name: "SENVO",
      phone: null,
      postalCode: null,
    },
    organizationId: ids.organization,
    originalReceiptNumber: "POS-RECEIPT-001",
    cumulativeRefundedMinor: 0,
    returns: [],
  };
}

function saleReturn(
  quantity: number,
  credit: number,
  idempotencyKey: string,
  requestSignature = "prior",
) {
  return {
    acceptedByName: "Cashier",
    acceptedByUserId: ids.user,
    checkoutId: ids.checkout,
    createdAt: now,
    destinationLocationId: ids.destination,
    destinationLocationName: "Return hold",
    id: ids.saleReturn,
    idempotencyKey,
    inventoryMovementId: ids.movement,
    lines: [
      {
        colorSnapshot: "Black",
        id: ids.line,
        lineCreditMinor: credit,
        lineNumber: 1,
        organizationId: ids.organization,
        productNameSnapshot: "T-shirt",
        productVariantId: ids.variant,
        quantity,
        salesOrderLineId: ids.line,
        sizeSnapshot: "M",
        skuSnapshot: "TS-BLK-M",
        unitPriceMinor: 3_334,
      },
    ],
    organizationId: ids.organization,
    reasonCode: "SIZE_OR_FIT" as const,
    reasonNote: null,
    receiptId: ids.receipt,
    receiptNumber: "RET-001",
    requestSignature,
    returnedAt: now,
    salesOrderId: ids.order,
    totalCreditMinor: credit,
  };
}

class FakeReturns implements PosReturnRepository {
  constructor(private readonly prep: PosReturnPreparation) {}
  create(record: CreatePosSaleReturnRecord) {
    const base = saleReturn(
      record.lines[0]?.quantity ?? 0,
      record.totalCreditMinor,
      record.idempotencyKey,
      record.requestSignature,
    );
    const value = {
      ...base,
      lines: record.lines.map((line, index) => ({
        ...line,
        id: index === 0 ? ids.line : ids.lineTwo,
        lineNumber: index + 1,
        organizationId: record.organizationId,
      })),
    };
    this.prep.returns.push(value);
    return Promise.resolve(value);
  }
  findAccount(): Promise<PosReturnAccount> {
    const credit = this.prep.returns.reduce(
      (sum, item) => sum + item.totalCreditMinor,
      0,
    );
    return Promise.resolve({
      adjustedPayableMinor: 10_000 - credit,
      checkoutId: ids.checkout,
      cumulativeReceivedMinor: 10_000,
      cumulativeRefundedMinor: 0,
      legacyPaymentRecorded: true,
      lines: [],
      orderNumber: "POS-001",
      organizationId: ids.organization,
      netReceivedMinor: 10_000,
      originalTotalMinor: 10_000,
      outstandingMinor: 0,
      refundableMinor: credit,
      returnCreditMinor: credit,
      returns: this.prep.returns,
      settlementStatus: credit ? "REFUND_DUE" : "PAID",
    });
  }
  prepare() {
    return Promise.resolve(this.prep);
  }
}

class FakeReturnReceipts implements PosReturnReceiptRepository {
  created?: Parameters<PosReturnReceiptRepository["createPosReturnReceipt"]>[0];
  createPosReturnReceipt(
    record: Parameters<PosReturnReceiptRepository["createPosReturnReceipt"]>[0],
  ) {
    this.created = record;
    return Promise.resolve(record);
  }
  findPosReturnReceiptById() {
    return Promise.resolve(null);
  }
}

function inventory() {
  let movement = movementRecord("DRAFT");
  return {
    createDraft: () => Promise.resolve(movement),
    findById: () => Promise.resolve(movement),
    findByIdempotencyKey: () => Promise.resolve(null),
    post: () => {
      movement = movementRecord("POSTED");
      return Promise.resolve(movement);
    },
  };
}
function movementRecord(status: "DRAFT" | "POSTED"): InventoryMovement {
  return {
    consumesReservationId: null,
    createdAt: now,
    destinationLocationId: ids.destination,
    id: ids.movement,
    idempotencyKey: "pos-return",
    isReservationConsumption: false,
    isReversal: false,
    isReversed: false,
    lines: [
      {
        createdAt: now,
        id: ids.line,
        lineNumber: 1,
        movementId: ids.movement,
        note: null,
        organizationId: ids.organization,
        productVariantId: ids.variant,
        quantity: 1,
      },
    ],
    movementNumber: "RET-001",
    note: null,
    occurredAt: now,
    organizationId: ids.organization,
    postedAt: status === "POSTED" ? now : null,
    referenceId: ids.saleReturn,
    referenceType: "POS_RETURN",
    reversedByMovementId: null,
    reversalReason: null,
    reversesMovementId: null,
    sourceLocationId: null,
    status,
    type: "ADJUSTMENT_IN",
    updatedAt: now,
    version: status === "POSTED" ? 2 : 1,
  };
}

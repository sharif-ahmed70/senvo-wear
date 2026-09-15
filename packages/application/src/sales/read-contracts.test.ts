import { describe, expect, it, vi } from "vitest";
import { PrismaSalesOrderReadRepository } from "@senvo/database";
import {
  salesOrderDetailsReadContractSchema,
  salesOrderListReadPageContractSchema,
} from "@senvo/contracts";
import {
  mapSalesOrderDetailsRead,
  mapSalesOrderReadPage,
} from "./read-mappers.js";

type PrismaSalesOrderClient = ConstructorParameters<
  typeof PrismaSalesOrderReadRepository
>[0];
type SalesOrderDelegate = PrismaSalesOrderClient["salesOrder"];

const organizationId = "11111111-1111-4111-8111-111111111111";
const salesOrderId = "22222222-2222-4222-8222-222222222222";
const reservationId = "33333333-3333-4333-8333-333333333333";
const stockLocationId = "44444444-4444-4444-8444-444444444444";
const lineId = "55555555-5555-4555-8555-555555555555";
const commerceId = "66666666-6666-4666-8666-666666666666";

function createDetailsFixture(
  paymentPreference: "CASH_ON_DELIVERY" | "ONLINE_PAYMENT" | null,
) {
  const commerceProfile =
    paymentPreference === null
      ? null
      : {
          createdAt: new Date("2026-09-15T12:00:00.000Z"),
          id: commerceId,
          organizationId,
          paymentPreference,
          requestSignature: "sig_test_commerce_signature",
          salesOrderId,
          source: "STOREFRONT" as const,
        };

  return {
    boothId: null,
    cancelledAt: null,
    channel: "ONLINE" as const,
    commerceProfile,
    confirmedAt: null,
    createdAt: new Date("2026-09-15T12:00:00.000Z"),
    currencyCode: "BDT",
    customerEmail: "customer@senvo.test",
    customerName: "Customer Name",
    customerPhone: "+8801700000000",
    deliveryAddressLine1: "House 1, Road 2",
    deliveryAddressLine2: null,
    deliveryCity: "Dhaka",
    deliveryDistrict: "Dhaka",
    deliveryMinor: 0,
    deliveryPostalCode: "1212",
    discountMinor: 0,
    fulfilledAt: null,
    fulfillmentMovement: null,
    id: salesOrderId,
    inventoryReservation: {
      id: reservationId,
      reservationNumber: "RES-001",
      status: "ACTIVE" as const,
      stockLocation: {
        id: stockLocationId,
        name: "Main Warehouse",
      },
    },
    lines: [
      {
        colorSnapshot: "Burgundy",
        id: lineId,
        lineNumber: 1,
        lineTotalMinor: 100000,
        productNameSnapshot: "Linen Tunic",
        quantity: 1,
        sizeSnapshot: "M",
        skuSnapshot: "LOCAL-TUNIC-M",
        unitPriceMinor: 100000,
      },
    ],
    orderNumber: "WEB-12345",
    organizationId,
    reservedAt: new Date("2026-09-15T12:00:00.000Z"),
    status: "RESERVED" as const,
    subtotalMinor: 100000,
    totalMinor: 100000,
    updatedAt: new Date("2026-09-15T12:00:00.000Z"),
    version: 1,
  };
}

describe("Sales order read contracts", () => {
  it("COD commerce detail", async () => {
    const fixture = createDetailsFixture("CASH_ON_DELIVERY");
    const fixtureSnapshot = JSON.stringify(fixture);

    let capturedWhere: { id?: string; organizationId?: string } | undefined;
    const salesOrder = {
      findFirst: vi.fn(
        (args: { where: { id: string; organizationId: string } }) => {
          capturedWhere = args.where;
          return Promise.resolve(fixture);
        },
      ),
      findMany: vi.fn(),
    } as unknown as SalesOrderDelegate;

    const repository = new PrismaSalesOrderReadRepository({ salesOrder });

    const details = await repository.getDetails({
      organizationId,
      salesOrderId,
    });
    expect(details).not.toBeNull();

    const mapped = mapSalesOrderDetailsRead(details!);
    const parsed = salesOrderDetailsReadContractSchema.parse(mapped);

    expect(parsed.commerce).toEqual({
      paymentPreference: "CASH_ON_DELIVERY",
      source: "STOREFRONT",
    });
    expect(Object.keys(parsed.commerce ?? {})).toEqual([
      "paymentPreference",
      "source",
    ]);

    expect(parsed.commerce).not.toHaveProperty("id");
    expect(parsed.commerce).not.toHaveProperty("organizationId");
    expect(parsed.commerce).not.toHaveProperty("salesOrderId");
    expect(parsed.commerce).not.toHaveProperty("requestSignature");
    expect(parsed.commerce).not.toHaveProperty("createdAt");

    expect(JSON.stringify(fixture)).toBe(fixtureSnapshot);
    expect(capturedWhere).toEqual({
      id: salesOrderId,
      organizationId,
    });
  });

  it("ONLINE_PAYMENT commerce detail", async () => {
    const fixture = createDetailsFixture("ONLINE_PAYMENT");
    const fixtureSnapshot = JSON.stringify(fixture);

    let capturedWhere: { id?: string; organizationId?: string } | undefined;
    const salesOrder = {
      findFirst: vi.fn(
        (args: { where: { id: string; organizationId: string } }) => {
          capturedWhere = args.where;
          return Promise.resolve(fixture);
        },
      ),
      findMany: vi.fn(),
    } as unknown as SalesOrderDelegate;

    const repository = new PrismaSalesOrderReadRepository({ salesOrder });

    const details = await repository.getDetails({
      organizationId,
      salesOrderId,
    });
    expect(details).not.toBeNull();

    const mapped = mapSalesOrderDetailsRead(details!);
    const parsed = salesOrderDetailsReadContractSchema.parse(mapped);

    expect(parsed.commerce).toEqual({
      paymentPreference: "ONLINE_PAYMENT",
      source: "STOREFRONT",
    });
    expect(Object.keys(parsed.commerce ?? {})).toEqual([
      "paymentPreference",
      "source",
    ]);

    expect(parsed.commerce).not.toHaveProperty("id");
    expect(parsed.commerce).not.toHaveProperty("organizationId");
    expect(parsed.commerce).not.toHaveProperty("salesOrderId");
    expect(parsed.commerce).not.toHaveProperty("requestSignature");
    expect(parsed.commerce).not.toHaveProperty("createdAt");

    expect(JSON.stringify(fixture)).toBe(fixtureSnapshot);
    expect(capturedWhere).toEqual({
      id: salesOrderId,
      organizationId,
    });
  });

  it("null-commerce detail", async () => {
    const fixture = createDetailsFixture(null);
    const fixtureSnapshot = JSON.stringify(fixture);

    let capturedWhere: { id?: string; organizationId?: string } | undefined;
    const salesOrder = {
      findFirst: vi.fn(
        (args: { where: { id: string; organizationId: string } }) => {
          capturedWhere = args.where;
          return Promise.resolve(fixture);
        },
      ),
      findMany: vi.fn(),
    } as unknown as SalesOrderDelegate;

    const repository = new PrismaSalesOrderReadRepository({ salesOrder });

    const details = await repository.getDetails({
      organizationId,
      salesOrderId,
    });
    expect(details).not.toBeNull();

    const mapped = mapSalesOrderDetailsRead(details!);
    const parsed = salesOrderDetailsReadContractSchema.parse(mapped);

    expect(parsed.commerce).toBeNull();
    expect(JSON.stringify(fixture)).toBe(fixtureSnapshot);
    expect(capturedWhere).toEqual({
      id: salesOrderId,
      organizationId,
    });
  });

  it("list compatibility", async () => {
    const listRecords = [
      {
        channel: "ONLINE" as const,
        commerceProfile: {
          paymentPreference: "CASH_ON_DELIVERY" as const,
          source: "STOREFRONT" as const,
        },
        createdAt: new Date("2026-09-15T12:00:00.000Z"),
        currencyCode: "BDT",
        customerEmail: "user1@senvo.test",
        customerName: "User One",
        customerPhone: "+8801711111111",
        deliveryCity: "Dhaka",
        deliveryDistrict: "Dhaka",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderNumber: "WEB-001",
        status: "CONFIRMED" as const,
        totalMinor: 150000,
      },
      {
        channel: "POS" as const,
        commerceProfile: null,
        createdAt: new Date("2026-09-15T11:00:00.000Z"),
        currencyCode: "BDT",
        customerEmail: null,
        customerName: null,
        customerPhone: null,
        deliveryCity: null,
        deliveryDistrict: null,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orderNumber: "POS-001",
        status: "FULFILLED" as const,
        totalMinor: 50000,
      },
    ];

    let capturedFindManyArgs:
      | {
          orderBy?: Array<{ createdAt?: string; id?: string }>;
          select?: {
            commerceProfile?: {
              select?: { paymentPreference?: boolean; source?: boolean };
            };
          };
          take?: number;
          where?: { organizationId?: string };
        }
      | undefined;

    const salesOrder = {
      findFirst: vi.fn(),
      findMany: vi.fn(
        (args: {
          orderBy?: Array<{ createdAt?: string; id?: string }>;
          select?: {
            commerceProfile?: {
              select?: { paymentPreference?: boolean; source?: boolean };
            };
          };
          take?: number;
          where?: { organizationId?: string };
        }) => {
          capturedFindManyArgs = args;
          return Promise.resolve(listRecords);
        },
      ),
    } as unknown as SalesOrderDelegate;

    const repository = new PrismaSalesOrderReadRepository({ salesOrder });

    const page = await repository.list({
      order: "NEWEST",
      organizationId,
      pageSize: 25,
    });

    const mappedPage = mapSalesOrderReadPage(page);
    const parsedPage = salesOrderListReadPageContractSchema.parse(mappedPage);

    expect(parsedPage.hasMore).toBe(false);
    expect(parsedPage.nextCursor).toBeNull();
    expect(parsedPage.items).toHaveLength(2);
    const item0 = parsedPage.items[0];
    const item1 = parsedPage.items[1];
    expect(item0).toBeDefined();
    expect(item1).toBeDefined();
    if (!item0 || !item1) throw new Error("Expected items to be defined");

    expect(typeof item0.createdAt).toBe("string");
    expect(new Date(item0.createdAt).toISOString()).toBe(item0.createdAt);
    expect(typeof item1.createdAt).toBe("string");
    expect(new Date(item1.createdAt).toISOString()).toBe(item1.createdAt);

    expect(capturedFindManyArgs?.where?.organizationId).toBe(organizationId);
    expect(capturedFindManyArgs?.orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(capturedFindManyArgs?.select?.commerceProfile).toEqual({
      select: { paymentPreference: true, source: true },
    });
    expect(capturedFindManyArgs?.take).toBe(26);
  });
});

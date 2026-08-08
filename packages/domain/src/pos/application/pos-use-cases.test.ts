import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../errors.js";
import { describe, expect, it } from "vitest";
import type {
  PosCart,
  PosCartDetails,
  PosCartLine,
  SalesCounter,
  SalesSession,
  SellableVariant,
} from "../domain/models.js";
import type { PosRepository } from "../repositories/pos-repository.js";
import {
  addPosCartItem,
  createSalesCounter,
  getPosCart,
  listCurrentUserSalesSessions,
  lookupPosSale,
  openSalesSession,
  removePosCartItem,
  updatePosCartItem,
} from "./pos-use-cases.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "10000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000003";
const otherUserId = "10000000-0000-4000-8000-000000000006";
const branchId = "10000000-0000-4000-8000-000000000004";
const variantId = "10000000-0000-4000-8000-000000000005";

describe("offline POS use cases", () => {
  it("reads only an organization-scoped persisted cart projection", async () => {
    const pos = new FakePos();
    pos.cartDetails = {
      checkoutId: null,
      createdAt: new Date(),
      id: branchId,
      lines: [],
      organizationId,
      salesSessionId: userId,
      sessionStatus: "OPEN",
      updatedAt: new Date(),
    };
    await expect(
      getPosCart(pos, { cartId: branchId, organizationId, userId }),
    ).resolves.toBe(pos.cartDetails);
    await expect(
      getPosCart(pos, {
        cartId: branchId,
        organizationId: otherOrganizationId,
        userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getPosCart(pos, {
        cartId: branchId,
        organizationId,
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only open sessions owned by the trusted user", async () => {
    const pos = new FakePos();
    pos.sessions.push(
      session({
        counterId: counter().id,
        openedAt: new Date(),
        openedByUserId: userId,
        organizationId,
      }),
      session({
        counterId: branchId,
        openedAt: new Date(),
        openedByUserId: otherUserId,
        organizationId,
      }),
    );
    await expect(
      listCurrentUserSalesSessions(pos, { organizationId, userId }),
    ).resolves.toEqual([expect.objectContaining({ openedByUserId: userId })]);
  });

  it("rejects every cart mutation from another cashier in the organization", async () => {
    const pos = new FakePos();
    pos.cart = {
      createdAt: new Date(),
      id: branchId,
      lines: [],
      organizationId,
      salesSessionId: userId,
      sessionStatus: "OPEN",
      updatedAt: new Date(),
    };
    await expect(
      addPosCartItem(
        { inventory: {} as never, pos },
        {
          cartId: branchId,
          organizationId,
          productVariantId: variantId,
          quantity: 1,
          userId: otherUserId,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updatePosCartItem(pos, {
        cartId: branchId,
        itemId: variantId,
        organizationId,
        quantity: 2,
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      removePosCartItem(pos, {
        cartId: branchId,
        itemId: variantId,
        organizationId,
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("creates a normalized organization-scoped store counter", async () => {
    const pos = new FakePos();
    const result = await createSalesCounter(
      {
        branches: {
          findById: () =>
            Promise.resolve({ id: branchId, organizationId, status: "ACTIVE" }),
        } as never,
        pos,
        salesSources: {} as never,
      },
      {
        branchId,
        code: " main-01 ",
        name: " Main counter ",
        organizationId,
        type: "STORE",
      },
    );
    expect(result).toMatchObject({
      code: "MAIN-01",
      organizationId,
      type: "STORE",
    });
  });

  it("blocks duplicate counter codes and cross-organization sources", async () => {
    const pos = new FakePos();
    pos.counters.push(counter());
    await expect(
      createSalesCounter(
        { branches: {} as never, pos, salesSources: {} as never },
        {
          branchId,
          code: "MAIN-01",
          name: "Duplicate",
          organizationId,
          type: "STORE",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createSalesCounter(
        {
          branches: { findById: () => Promise.resolve(null) } as never,
          pos: new FakePos(),
          salesSources: {} as never,
        },
        {
          branchId,
          code: "OTHER-01",
          name: "Other",
          organizationId,
          type: "STORE",
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects inactive staff and inactive counters when opening", async () => {
    const pos = new FakePos();
    pos.counters.push(counter());
    const memberships = {
      findByUserAndOrganization: () => Promise.resolve({ status: "ACTIVE" }),
    } as never;
    await expect(
      openSalesSession(
        {
          memberships,
          pos,
          users: {
            findById: () => Promise.resolve({ id: userId, status: "INACTIVE" }),
          } as never,
        },
        {
          counterId: counter().id,
          openedAt: new Date(),
          organizationId,
          userId,
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    pos.counters[0] = { ...pos.counters[0]!, status: "INACTIVE" };
    await expect(
      openSalesSession(
        {
          memberships,
          pos,
          users: {
            findById: () => Promise.resolve({ id: userId, status: "ACTIVE" }),
          } as never,
        },
        {
          counterId: counter().id,
          openedAt: new Date(),
          organizationId,
          userId,
        },
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("derives sale details and server subtotal", async () => {
    const pos = new FakePos();
    pos.cart = {
      createdAt: new Date(),
      id: branchId,
      lines: [],
      organizationId,
      salesSessionId: userId,
      sessionStatus: "OPEN",
      updatedAt: new Date(),
    };
    pos.variant = {
      id: variantId,
      organizationId,
      sellingPriceMinor: 1250,
      status: "ACTIVE",
    };
    const line = await addPosCartItem(
      {
        inventory: {
          getVariantAvailability: () =>
            Promise.resolve({ locations: [{ availableToSell: 4 }] }),
        } as never,
        pos,
      },
      {
        cartId: branchId,
        organizationId,
        productVariantId: variantId,
        quantity: 3,
        userId,
      },
    );
    expect(line).toMatchObject({
      lineSubtotalMinor: 3750,
      unitPriceMinor: 1250,
    });
    const lookup = await lookupPosSale(
      {
        barcodes: {
          lookupActive: () =>
            Promise.resolve({
              barcode: { value: "SCAN-1" },
              color: "Black",
              productName: "Oxford",
              sellingPriceMinor: 1250,
              size: "L",
              sku: "OX-L",
              variantId,
              variantStatus: "ACTIVE",
            }),
        } as never,
        inventory: {
          getVariantAvailability: () =>
            Promise.resolve({
              locations: [{ availableToSell: 4 }],
              variant: {},
            }),
        } as never,
      },
      { organizationId, value: "scan-1" },
    );
    expect(lookup).toMatchObject({
      availabilityStatus: "AVAILABLE",
      availableQuantity: 4,
      sellingPriceMinor: 1250,
    });
  });

  it("rejects unavailable and cross-organization barcode results", async () => {
    const barcodes = {
      lookupActive: (org: string) =>
        Promise.resolve(org === otherOrganizationId ? ({} as never) : null),
    } as never;
    await expect(
      lookupPosSale(
        { barcodes, inventory: {} as never },
        { organizationId, value: "SCAN-1" },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

class FakePos implements PosRepository {
  cartDetails: PosCartDetails | null = null;
  counters: SalesCounter[] = [];
  cart: PosCart | null = null;
  cartOwnerId = userId;
  sessions: SalesSession[] = [];
  variant: SellableVariant | null = null;
  createCounter(record: Parameters<PosRepository["createCounter"]>[0]) {
    const value = counter(record);
    this.counters.push(value);
    return Promise.resolve(value);
  }
  findCounterByCode(org: string, code: string) {
    return Promise.resolve(
      this.counters.find(
        (item) => item.organizationId === org && item.code === code,
      ) ?? null,
    );
  }
  findCounterById(id: string, org: string) {
    return Promise.resolve(
      this.counters.find(
        (item) => item.id === id && item.organizationId === org,
      ) ?? null,
    );
  }
  findOpenSessionByCounter() {
    return Promise.resolve(null);
  }
  openSession(record: Parameters<PosRepository["openSession"]>[0]) {
    return Promise.resolve(session(record));
  }
  findCartById(id: string, org: string, openedByUserId: string) {
    return Promise.resolve(
      this.cart?.id === id &&
        this.cart.organizationId === org &&
        this.cartOwnerId === openedByUserId
        ? this.cart
        : null,
    );
  }
  findCartDetailsById(id: string, org: string, openedByUserId: string) {
    return Promise.resolve(
      this.cartDetails?.id === id &&
        this.cartDetails.organizationId === org &&
        this.cartOwnerId === openedByUserId
        ? this.cartDetails
        : null,
    );
  }
  findSellableVariant(id: string, org: string) {
    return Promise.resolve(
      this.variant?.id === id && this.variant.organizationId === org
        ? this.variant
        : null,
    );
  }
  addCartLine(record: Parameters<PosRepository["addCartLine"]>[0]) {
    return Promise.resolve(line(record));
  }
  changeCounterStatus() {
    return Promise.resolve(null);
  }
  closeSession() {
    return Promise.resolve(null);
  }
  findCartLineById() {
    return Promise.resolve(null);
  }
  listCounters() {
    return Promise.resolve(this.counters);
  }
  listSessions() {
    return Promise.resolve([]);
  }
  listOpenSessionsByUser(org: string, openedByUserId: string) {
    return Promise.resolve(
      this.sessions.filter(
        (item) =>
          item.organizationId === org &&
          item.openedByUserId === openedByUserId &&
          item.status === "OPEN",
      ),
    );
  }
  removeCartLine() {
    return Promise.resolve(false);
  }
  updateCartLine() {
    return Promise.resolve(null);
  }
}

function counter(overrides: Partial<SalesCounter> = {}): SalesCounter {
  const now = new Date();
  return {
    boothId: null,
    branchId,
    code: "MAIN-01",
    createdAt: now,
    id: "20000000-0000-4000-8000-000000000001",
    name: "Main counter",
    organizationId,
    status: "ACTIVE",
    type: "STORE",
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}
function session(
  record: Parameters<PosRepository["openSession"]>[0],
): SalesSession {
  const now = record.openedAt;
  return {
    cartId: branchId,
    closedAt: null,
    counterId: record.counterId,
    createdAt: now,
    id: userId,
    openedAt: now,
    openedByUserId: record.openedByUserId,
    organizationId: record.organizationId,
    status: "OPEN",
    updatedAt: now,
    version: 1,
  };
}
function line(
  record: Parameters<PosRepository["addCartLine"]>[0],
): PosCartLine {
  const now = new Date();
  return { ...record, createdAt: now, id: userId, updatedAt: now };
}

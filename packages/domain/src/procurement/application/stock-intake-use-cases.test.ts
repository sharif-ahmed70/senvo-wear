import type {
  AuditEntry,
  RecordAuditEntryInput,
} from "../../audit/domain/models.js";
import type {
  Category,
  Color,
  Product,
  ProductVariant,
  Size,
  VariantBarcode,
} from "../../catalog/domain/models.js";
import type { InventoryMovement } from "../../inventory/domain/models.js";
import type {
  PurchaseWithLines,
  Supplier,
  SupplierLedgerEntry,
  SupplierPayment,
  VariantCostState,
} from "../domain/models.js";
import { describe, expect, it } from "vitest";
import { NotFoundError, ValidationApplicationError } from "../../errors.js";
import { distributeTransportCost } from "../domain/stock-intake-rules.js";
import {
  SELF_PURCHASE_SUPPLIER_CODE,
  SELF_PURCHASE_SUPPLIER_NAME,
  StockIntakeIdempotencyConflictError,
  TRANSPORT_NOT_PAYABLE_NOTE,
  recordStockIntake,
  type RecordStockIntakeDependencies,
  type RecordStockIntakeInput,
} from "./stock-intake-use-cases.js";

const testOrganizationId = "11111111-1111-4111-8111-111111111111";
const testLocationId = "44444444-4444-4444-8444-444444444444";
const testUserId = "99999999-9999-4999-8999-999999999999";

const now = new Date("2026-10-01T00:00:00.000Z");

/**
 * In-memory stand-ins for every repository the stock intake workflow touches.
 * State is shared so the real catalog, purchase, costing and supplier use cases
 * run end to end.
 */
function createStockIntakeTestWorld() {
  const state = {
    audits: [] as AuditEntry[],
    barcodes: [] as VariantBarcode[],
    categories: [] as Category[],
    colors: [] as Color[],
    costEntries: 0,
    costStates: new Map<string, VariantCostState>(),
    ledger: [] as SupplierLedgerEntry[],
    locks: [] as string[],
    movements: [] as InventoryMovement[],
    payments: [] as SupplierPayment[],
    products: [] as Product[],
    purchases: [] as PurchaseWithLines[],
    sizes: [] as Size[],
    suppliers: [] as Supplier[],
    variants: [] as ProductVariant[],
  };
  let barcodeSequence = 0;
  const id = () => crypto.randomUUID();
  const stamp = { createdAt: now, updatedAt: now };

  const onHand = (variantId: string) =>
    state.movements
      .filter((movement) => movement.status === "POSTED")
      .flatMap((movement) => movement.lines)
      .filter((line) => line.productVariantId === variantId)
      .reduce((sum, line) => sum + line.quantity, 0);

  const balance = (supplierId: string) => {
    const entries = state.ledger.filter(
      (entry) => entry.supplierId === supplierId,
    );
    const billed = entries
      .filter((entry) => entry.entryType === "BILL")
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    const paid = entries
      .filter((entry) => entry.entryType === "PAYMENT")
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    // Mirrors PrismaSupplierLedgerRepository: DEBIT adjustments reduce debt.
    const adjusted = entries
      .filter((entry) => entry.entryType === "ADJUSTMENT")
      .reduce(
        (sum, entry) =>
          entry.direction === "DEBIT"
            ? sum + entry.amountMinor
            : sum - entry.amountMinor,
        0n,
      );
    return {
      lastBillDate: null,
      lastPaymentDate: null,
      organizationId: testOrganizationId,
      outstandingBalanceMinor: billed - paid - adjusted,
      supplierId,
      totalAdjustedMinor: adjusted,
      totalBilledMinor: billed,
      totalPaidMinor: paid,
    };
  };

  const dependencies: RecordStockIntakeDependencies = {
    auditWriter: {
      recordWithinTransaction: (input: RecordAuditEntryInput) => {
        const entry: AuditEntry = {
          action: input.action,
          createdAt: now,
          id: id(),
          metadata: input.metadata ?? {},
          organizationId: input.organizationId,
          resource: input.resource,
          resourceId: input.resourceId,
          userId: input.actor.userId,
        };
        state.audits.push(entry);
        return Promise.resolve(entry);
      },
    },
    barcodes: {
      create: (record) => {
        const barcode = { ...record, ...stamp, id: id() };
        state.barcodes.push(barcode);
        return Promise.resolve(barcode);
      },
      existsByValue: (value) =>
        Promise.resolve(state.barcodes.some((row) => row.value === value)),
      findActiveByVariant: (_organizationId, variantId) =>
        Promise.resolve(
          state.barcodes.find(
            (row) =>
              row.productVariantId === variantId && row.status === "ACTIVE",
          ) ?? null,
        ),
      findById: (barcodeId) =>
        Promise.resolve(
          state.barcodes.find((row) => row.id === barcodeId) ?? null,
        ),
      listByVariant: (_organizationId, variantId) =>
        Promise.resolve(
          state.barcodes.filter((row) => row.productVariantId === variantId),
        ),
      lookupActive: () => Promise.resolve(null),
      updateStatus: () => Promise.resolve(null),
      variantExists: (organizationId, variantId) =>
        Promise.resolve(
          state.variants.some(
            (row) =>
              row.id === variantId && row.organizationId === organizationId,
          ),
        ),
    },
    categories: {
      create: (record) => {
        const category = { ...record, ...stamp, id: id() };
        state.categories.push(category);
        return Promise.resolve(category);
      },
      findById: (categoryId) =>
        Promise.resolve(
          state.categories.find((row) => row.id === categoryId) ?? null,
        ),
      findBySlug: (organizationId, slug) =>
        Promise.resolve(
          state.categories.find(
            (row) => row.organizationId === organizationId && row.slug === slug,
          ) ?? null,
        ),
    },
    colors: {
      create: (record) => {
        const color = { ...record, ...stamp, id: id() };
        state.colors.push(color);
        return Promise.resolve(color);
      },
      findByCode: (organizationId, code) =>
        Promise.resolve(
          state.colors.find(
            (row) => row.organizationId === organizationId && row.code === code,
          ) ?? null,
        ),
      findById: (colorId) =>
        Promise.resolve(state.colors.find((row) => row.id === colorId) ?? null),
      findByNormalizedName: (organizationId, normalizedName) =>
        Promise.resolve(
          state.colors.find(
            (row) =>
              row.organizationId === organizationId &&
              row.normalizedName === normalizedName,
          ) ?? null,
        ),
    },
    costs: {
      getCostState: (_organizationId, variantId) =>
        Promise.resolve(state.costStates.get(variantId) ?? null),
      getSaleLineCostSnapshot: () => Promise.resolve(null),
      getVariantOnHandQuantity: (_organizationId, variantId) =>
        Promise.resolve(onHand(variantId)),
      listCostEntries: () => Promise.resolve([]),
      recordCostEntry: (record) => {
        state.costEntries += 1;
        return Promise.resolve({
          ...record,
          createdAt: now,
          id: id(),
        } as never);
      },
      recordSaleLineCostSnapshot: () => Promise.reject(new Error("unused")),
      upsertCostState: (record) => {
        const previous = state.costStates.get(record.productVariantId);
        const next: VariantCostState = {
          averageCostMinor: record.averageCostMinor,
          costUnknownReason: record.costUnknownReason ?? null,
          createdAt: now,
          id: previous?.id ?? id(),
          inventoryValueMinor: record.inventoryValueMinor,
          isCostKnown: record.isCostKnown,
          lastCostEventAt: record.lastCostEventAt ?? null,
          organizationId: record.organizationId,
          productVariantId: record.productVariantId,
          updatedAt: now,
          version: (previous?.version ?? 0) + 1,
        };
        state.costStates.set(record.productVariantId, next);
        return Promise.resolve(next);
      },
    },
    generateBarcodeValue: () => {
      barcodeSequence += 1;
      return `SV-TEST-${barcodeSequence.toString().padStart(4, "0")}`;
    },
    inventoryMovements: {
      createDraft: (record, payloadSignature) => {
        const movementId = id();
        const movement = {
          consumesReservationId: null,
          createdAt: now,
          destinationLocationId: record.destinationLocationId,
          id: movementId,
          idempotencyKey: record.idempotencyKey,
          isReservationConsumption: false,
          isReversal: false,
          isReversed: false,
          lines: record.lines.map((line, index) => ({
            createdAt: now,
            id: id(),
            lineNumber: index + 1,
            movementId,
            note: line.note,
            organizationId: record.organizationId,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          })),
          movementNumber: record.movementNumber,
          note: record.note,
          occurredAt: record.occurredAt,
          organizationId: record.organizationId,
          payloadSignature,
          postedAt: null,
          referenceId: record.referenceId,
          referenceType: record.referenceType,
          reversalReason: null,
          reversedByMovementId: null,
          reversesMovementId: null,
          sourceLocationId: record.sourceLocationId,
          status: "DRAFT",
          type: record.type,
          updatedAt: now,
          version: 1,
        } as unknown as InventoryMovement;
        state.movements.push(movement);
        return Promise.resolve(movement);
      },
      findById: (movementId) =>
        Promise.resolve(
          state.movements.find((row) => row.id === movementId) ?? null,
        ),
      findByIdempotencyKey: (_organizationId, key) =>
        Promise.resolve(
          state.movements.find((row) => row.idempotencyKey === key) ?? null,
        ),
      post: ({ movementId }) => {
        const movement = state.movements.find((row) => row.id === movementId);
        if (!movement) return Promise.reject(new Error("missing movement"));
        Object.assign(movement, { postedAt: now, status: "POSTED" });
        return Promise.resolve(movement);
      },
    },
    organizations: {
      create: () => Promise.reject(new Error("unused")),
      findByCode: () => Promise.resolve(null),
      findById: (organizationId) =>
        Promise.resolve(
          organizationId === testOrganizationId
            ? ({ code: "SENVO", id: organizationId } as never)
            : null,
        ),
    },
    products: {
      create: (record) => {
        const product = { ...record, ...stamp, id: id() };
        state.products.push(product);
        return Promise.resolve(product);
      },
      findByCode: (organizationId, code) =>
        Promise.resolve(
          state.products.find(
            (row) =>
              row.organizationId === organizationId && row.productCode === code,
          ) ?? null,
        ),
      findById: (productId) =>
        Promise.resolve(
          state.products.find((row) => row.id === productId) ?? null,
        ),
      findBySlug: (organizationId, slug) =>
        Promise.resolve(
          state.products.find(
            (row) => row.organizationId === organizationId && row.slug === slug,
          ) ?? null,
        ),
    },
    productVariants: {
      create: (record) => {
        const variant = {
          ...record,
          ...stamp,
          id: id(),
          sellingPriceMinor: record.sellingPriceMinor ?? 0,
        };
        state.variants.push(variant);
        return Promise.resolve(variant);
      },
      existsBySku: (organizationId, sku) =>
        Promise.resolve(
          state.variants.some(
            (row) => row.organizationId === organizationId && row.sku === sku,
          ),
        ),
      existsVariantCombination: (productId, colorId, sizeId) =>
        Promise.resolve(
          state.variants.some(
            (row) =>
              row.productId === productId &&
              row.colorId === colorId &&
              row.sizeId === sizeId,
          ),
        ),
      listByProduct: (_organizationId, productId) =>
        Promise.resolve(
          state.variants.filter((row) => row.productId === productId),
        ),
      updatePrice: (input) => {
        const variant = state.variants.find(
          (row) =>
            row.id === input.variantId &&
            row.sellingPriceMinor === input.expectedSellingPriceMinor,
        );
        if (!variant) return Promise.resolve(null);
        variant.sellingPriceMinor = input.sellingPriceMinor;
        return Promise.resolve(variant);
      },
    },
    purchases: {
      create: (record) => {
        const purchaseId = id();
        const purchase: PurchaseWithLines = {
          ...stamp,
          destinationLocationId: record.destinationLocationId,
          expectedDeliveryDate: record.expectedDeliveryDate ?? null,
          id: purchaseId,
          idempotencyKey: record.idempotencyKey ?? null,
          lines: (record.lines ?? []).map((line) => ({
            ...stamp,
            id: id(),
            lineNumber: line.lineNumber,
            notes: line.notes ?? null,
            organizationId: record.organizationId,
            productName: line.productName,
            productVariantId: line.productVariantId,
            purchaseId,
            quantity: line.quantity,
            sku: line.sku,
            totalCostMinor: line.totalCostMinor,
            unitCostMinor: line.unitCostMinor,
            variantName: line.variantName ?? null,
          })),
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          purchaseDate: record.purchaseDate,
          purchaseNumber: record.purchaseNumber,
          receiptMovementId: null,
          status: record.status ?? "DRAFT",
          supplierId: record.supplierId,
          totalCostMinor: record.totalCostMinor,
        };
        state.purchases.push(purchase);
        return Promise.resolve(purchase);
      },
      findById: (purchaseId) =>
        Promise.resolve(
          state.purchases.find((row) => row.id === purchaseId) ?? null,
        ),
      findByIdempotencyKey: (_organizationId, key) =>
        Promise.resolve(
          state.purchases.find((row) => row.idempotencyKey === key) ?? null,
        ),
      findByPurchaseNumber: (_organizationId, purchaseNumber) =>
        Promise.resolve(
          state.purchases.find(
            (row) => row.purchaseNumber === purchaseNumber,
          ) ?? null,
        ),
      list: () => Promise.resolve(state.purchases),
      update: (record) => {
        const purchase = state.purchases.find((row) => row.id === record.id);
        if (!purchase) return Promise.resolve(null);
        Object.assign(purchase, {
          ...(record.status ? { status: record.status } : {}),
          ...(record.receiptMovementId
            ? { receiptMovementId: record.receiptMovementId }
            : {}),
        });
        return Promise.resolve(purchase);
      },
    },
    sizes: {
      create: (record) => {
        const size = { ...record, ...stamp, id: id() };
        state.sizes.push(size);
        return Promise.resolve(size);
      },
      findByCode: (organizationId, code) =>
        Promise.resolve(
          state.sizes.find(
            (row) => row.organizationId === organizationId && row.code === code,
          ) ?? null,
        ),
      findById: (sizeId) =>
        Promise.resolve(state.sizes.find((row) => row.id === sizeId) ?? null),
    },
    stockIntakes: {
      acquireIdempotencyLock: (organizationId, key) => {
        state.locks.push(`${organizationId}:${key}`);
        return Promise.resolve();
      },
      findCategoryByName: (organizationId, parentId, name) =>
        Promise.resolve(
          state.categories.find(
            (row) =>
              row.organizationId === organizationId &&
              row.parentId === parentId &&
              row.name.toUpperCase() === name.toUpperCase(),
          ) ?? null,
        ),
      findMaxSizeSortOrder: () =>
        Promise.resolve(
          state.sizes.length === 0
            ? null
            : Math.max(...state.sizes.map((row) => row.sortOrder)),
        ),
      findSizeByNameOrCode: (organizationId, value) =>
        Promise.resolve(
          state.sizes.find(
            (row) =>
              row.organizationId === organizationId &&
              (row.name.toUpperCase() === value.toUpperCase() ||
                row.code.toUpperCase() === value.toUpperCase()),
          ) ?? null,
        ),
      findStockIntakeAuditMetadata: (_organizationId, purchaseId) =>
        Promise.resolve(
          state.audits.find(
            (row) =>
              row.action === "STOCK_INTAKE_RECORDED" &&
              row.resourceId === purchaseId,
          )?.metadata ?? null,
        ),
      findVariantByCombination: (_organizationId, productId, colorId, sizeId) =>
        Promise.resolve(
          state.variants.find(
            (row) =>
              row.productId === productId &&
              row.colorId === colorId &&
              row.sizeId === sizeId,
          ) ?? null,
        ),
      findVariantById: (organizationId, variantId) =>
        Promise.resolve(
          state.variants.find(
            (row) =>
              row.id === variantId && row.organizationId === organizationId,
          ) ?? null,
        ),
      isActiveStockLocation: (_organizationId, locationId) =>
        Promise.resolve(locationId === testLocationId),
      listProductCodesWithPrefix: (_organizationId, prefix) =>
        Promise.resolve(
          state.products
            .map((row) => row.productCode)
            .filter((code) => code.startsWith(prefix)),
        ),
      listSupplierCodesWithPrefix: (_organizationId, prefix) =>
        Promise.resolve(
          state.suppliers
            .map((row) => row.code)
            .filter((code) => code.startsWith(prefix)),
        ),
    },
    supplierLedger: {
      getSupplierBalance: (supplierId) => Promise.resolve(balance(supplierId)),
      listLedgerEntries: () => Promise.resolve(state.ledger),
      recordLedgerEntry: (record) => {
        const entry: SupplierLedgerEntry = {
          amountMinor: record.amountMinor,
          balanceAfterMinor: record.balanceAfterMinor,
          createdAt: now,
          direction: record.direction,
          entryDate: record.entryDate,
          entryType: record.entryType,
          id: id(),
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          referenceId: record.referenceId ?? null,
          referenceType: record.referenceType ?? null,
          supplierId: record.supplierId,
        };
        state.ledger.push(entry);
        return Promise.resolve(entry);
      },
    },
    supplierPayments: {
      findByIdempotencyKey: (_organizationId, key) =>
        Promise.resolve(
          state.payments.find((row) => row.idempotencyKey === key) ?? null,
        ),
      getPaymentById: () => Promise.resolve(null),
      listPayments: () => Promise.resolve(state.payments),
      recordPayment: (record) => {
        const payment: SupplierPayment = {
          ...stamp,
          amountMinor: record.amountMinor,
          id: id(),
          idempotencyKey: record.idempotencyKey ?? null,
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          paymentDate: record.paymentDate,
          paymentMethod: record.paymentMethod,
          purchaseId: record.purchaseId ?? null,
          reference: record.reference ?? null,
          supplierId: record.supplierId,
        };
        state.payments.push(payment);
        return Promise.resolve(payment);
      },
    },
    suppliers: {
      create: (record) => {
        const supplier: Supplier = {
          ...stamp,
          address: record.address ?? null,
          code: record.code,
          contactPerson: record.contactPerson ?? null,
          email: record.email ?? null,
          id: id(),
          name: record.name,
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          phone: record.phone ?? null,
          status: record.status ?? "ACTIVE",
        };
        state.suppliers.push(supplier);
        return Promise.resolve(supplier);
      },
      deactivate: () => Promise.resolve(null),
      findByCode: (organizationId, code) =>
        Promise.resolve(
          state.suppliers.find(
            (row) => row.organizationId === organizationId && row.code === code,
          ) ?? null,
        ),
      findById: (supplierId, organizationId) =>
        Promise.resolve(
          state.suppliers.find(
            (row) =>
              row.id === supplierId && row.organizationId === organizationId,
          ) ?? null,
        ),
      list: () => Promise.resolve(state.suppliers),
      update: (record) => {
        const supplier = state.suppliers.find((row) => row.id === record.id);
        if (!supplier) return Promise.resolve(null);
        if (record.phone !== undefined) supplier.phone = record.phone;
        if (record.address !== undefined) supplier.address = record.address;
        return Promise.resolve(supplier);
      },
    },
  };

  return { dependencies, onHand, state };
}

function newProductInput(
  overrides: Partial<RecordStockIntakeInput> = {},
): RecordStockIntakeInput {
  return {
    actorUserId: testUserId,
    idempotencyKey: "intake-key-0001",
    lines: [
      {
        colorName: "Black",
        quantity: 10,
        sellingPriceMinor: 90_000,
        sizeName: "M",
        unitCostMinor: 50_000,
      },
      {
        colorName: "Black",
        quantity: 5,
        sellingPriceMinor: 90_000,
        sizeName: "L",
        unitCostMinor: 50_000,
      },
    ],
    organizationId: testOrganizationId,
    product: {
      audienceCategoryName: "Men",
      name: "Classic Crew Tee",
      typeCategoryName: "T-shirt",
    },
    purchase: { destinationLocationId: testLocationId },
    supplier: null,
    ...overrides,
  };
}

describe("recordStockIntake", () => {
  it("creates catalog records, barcodes, stock, cost and a supplier bill for a new product", async () => {
    const world = createStockIntakeTestWorld();

    const { replayed, result } = await recordStockIntake(
      world.dependencies,
      newProductInput(),
    );

    expect(replayed).toBe(false);
    const [men, tshirt] = world.state.categories;
    expect(men).toMatchObject({ name: "Men", parentId: null, slug: "men" });
    expect(tshirt).toMatchObject({
      name: "T-shirt",
      parentId: men?.id,
      slug: "t-shirt",
    });
    expect(result.product).toMatchObject({
      code: "TSH-0001",
      name: "Classic Crew Tee",
    });
    expect(world.state.products[0]).toMatchObject({
      categoryId: tshirt?.id,
      slug: "classic-crew-tee-tsh-0001",
      status: "ACTIVE",
    });
    expect(world.state.colors).toEqual([
      expect.objectContaining({ code: "BLACK", hexValue: "#9CA3AF" }),
    ]);
    expect(
      world.state.sizes.map((size) => [size.code, size.sortOrder]),
    ).toEqual([
      ["M", 10],
      ["L", 20],
    ]);
    expect(result.variants).toEqual([
      expect.objectContaining({
        barcode: "SV-TEST-0001",
        color: "Black",
        quantity: 10,
        sellingPriceMinor: 90_000,
        size: "M",
        sku: "TSH-0001-BLACK-M",
        unitCostMinor: 50_000,
      }),
      expect.objectContaining({
        barcode: "SV-TEST-0002",
        sku: "TSH-0001-BLACK-L",
      }),
    ]);
    expect(world.state.barcodes.every((row) => row.type === "CODE128")).toBe(
      true,
    );

    const variantIds = result.variants.map((variant) => variant.id);
    expect(variantIds.map((variantId) => world.onHand(variantId))).toEqual([
      10, 5,
    ]);
    expect(world.state.costStates.get(variantIds[0] ?? "")).toMatchObject({
      averageCostMinor: 50_000,
      isCostKnown: true,
    });
    expect(world.state.purchases[0]).toMatchObject({
      idempotencyKey: "stock-intake:intake-key-0001",
      status: "POSTED",
      totalCostMinor: 750_000n,
    });
    expect(result.purchase.totalCostMinor).toBe("750000");
    expect(result.dueMinor).toBe("750000");
    expect(result.payment).toBeNull();
    expect(result.supplier.name).toBe(SELF_PURCHASE_SUPPLIER_NAME);
    expect(world.state.ledger).toEqual([
      expect.objectContaining({ amountMinor: 750_000n, entryType: "BILL" }),
    ]);
    expect(world.state.audits).toEqual([
      expect.objectContaining({
        action: "STOCK_INTAKE_RECORDED",
        resource: "PURCHASE",
        resourceId: result.purchase.id,
        userId: testUserId,
      }),
    ]);
    expect(world.state.locks).toEqual([
      `${testOrganizationId}:stock-intake:intake-key-0001`,
    ]);
  });

  it("restocks an existing product, reusing variants and barcodes and updating price", async () => {
    const world = createStockIntakeTestWorld();
    const first = await recordStockIntake(
      world.dependencies,
      newProductInput(),
    );
    const [medium, large] = first.result.variants;

    const { result } = await recordStockIntake(world.dependencies, {
      ...newProductInput(),
      idempotencyKey: "intake-key-0002",
      lines: [
        {
          existingVariantId: medium?.id ?? "",
          quantity: 4,
          sellingPriceMinor: 95_000,
          unitCostMinor: 60_000,
        },
        {
          colorName: "black",
          quantity: 2,
          sellingPriceMinor: 90_000,
          sizeName: "l",
          unitCostMinor: 60_000,
        },
        {
          colorName: "Navy Blue",
          quantity: 3,
          sellingPriceMinor: 99_000,
          sizeName: "XL",
          unitCostMinor: 55_000,
        },
      ],
      product: { existingProductId: first.result.product.id },
    });

    expect(world.state.products).toHaveLength(1);
    expect(world.state.categories).toHaveLength(2);
    expect(result.variants.map((variant) => variant.id).slice(0, 2)).toEqual([
      medium?.id,
      large?.id,
    ]);
    expect(result.variants[0]?.barcode).toBe(medium?.barcode);
    expect(result.variants[1]?.barcode).toBe(large?.barcode);
    expect(result.variants[0]?.sellingPriceMinor).toBe(95_000);
    expect(result.variants[2]).toMatchObject({
      color: "Navy Blue",
      size: "XL",
      sku: "TSH-0001-NAVY-BLUE-XL",
    });
    expect(world.state.barcodes).toHaveLength(3);
    expect(world.onHand(medium?.id ?? "")).toBe(14);
    expect(world.onHand(large?.id ?? "")).toBe(7);
    // (10 * 50_000 + 4 * 60_000) / 14 -> moving average rises above 50_000.
    expect(
      world.state.costStates.get(medium?.id ?? "")?.averageCostMinor,
    ).toBeGreaterThan(50_000);
    expect(world.state.suppliers).toHaveLength(1);
  });

  it("rejects a new variant line without a selling price", async () => {
    const world = createStockIntakeTestWorld();
    const first = await recordStockIntake(
      world.dependencies,
      newProductInput(),
    );

    await expect(
      recordStockIntake(world.dependencies, {
        ...newProductInput(),
        idempotencyKey: "intake-key-0003",
        lines: [
          {
            colorName: "Red",
            quantity: 1,
            sizeName: "M",
            unitCostMinor: 1_000,
          },
        ],
        product: { existingProductId: first.result.product.id },
      }),
    ).rejects.toBeInstanceOf(ValidationApplicationError);
  });

  it("rejects a variant that belongs to another product", async () => {
    const world = createStockIntakeTestWorld();
    const first = await recordStockIntake(
      world.dependencies,
      newProductInput(),
    );
    const second = await recordStockIntake(world.dependencies, {
      ...newProductInput(),
      idempotencyKey: "intake-key-0004",
      product: {
        audienceCategoryName: "Men",
        name: "Polo",
        typeCategoryName: "Polo",
      },
    });

    await expect(
      recordStockIntake(world.dependencies, {
        ...newProductInput(),
        idempotencyKey: "intake-key-0005",
        lines: [
          {
            existingVariantId: first.result.variants[0]?.id ?? "",
            quantity: 1,
            unitCostMinor: 1_000,
          },
        ],
        product: { existingProductId: second.result.product.id },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reuses an existing top-level category that already has the type name", async () => {
    const world = createStockIntakeTestWorld();
    await world.dependencies.categories.create({
      description: null,
      name: "T-Shirt",
      organizationId: testOrganizationId,
      parentId: null,
      slug: "t-shirt",
      sortOrder: 0,
      status: "ACTIVE",
    });

    const { result } = await recordStockIntake(
      world.dependencies,
      newProductInput(),
    );

    expect(world.state.categories.map((category) => category.name)).toEqual([
      "T-Shirt",
      "Men",
    ]);
    expect(world.state.products[0]?.categoryId).toBe(
      world.state.categories[0]?.id,
    );
    expect(result.product.code).toBe("TSH-0001");
  });

  it("allocates the next product code and reuses catalog records case-insensitively", async () => {
    const world = createStockIntakeTestWorld();
    await recordStockIntake(world.dependencies, newProductInput());
    const { result } = await recordStockIntake(world.dependencies, {
      ...newProductInput(),
      idempotencyKey: "intake-key-0006",
      product: {
        audienceCategoryName: "men",
        name: "Classic Crew Tee",
        typeCategoryName: "t-shirt",
      },
    });

    expect(result.product.code).toBe("TSH-0002");
    expect(world.state.categories).toHaveLength(2);
    expect(world.state.colors).toHaveLength(1);
    expect(world.state.sizes).toHaveLength(2);
  });

  describe("supplier", () => {
    it("creates a new supplier with an automatic code", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        supplier: {
          new: {
            address: "Islampur, Dhaka",
            name: "Rahim Textiles",
            phone: "01711000000",
          },
        },
      });

      expect(world.state.suppliers).toEqual([
        expect.objectContaining({
          address: "Islampur, Dhaka",
          code: "SUP-0001",
          name: "Rahim Textiles",
          phone: "01711000000",
        }),
      ]);
      expect(result.supplier).toEqual({
        id: world.state.suppliers[0]?.id,
        name: "Rahim Textiles",
      });
      expect(world.state.ledger[0]?.supplierId).toBe(result.supplier.id);
    });

    it("uses an existing supplier and applies contact updates", async () => {
      const world = createStockIntakeTestWorld();
      const supplier = await world.dependencies.suppliers.create({
        code: "SUP-0007",
        name: "Karim Fabrics",
        organizationId: testOrganizationId,
        phone: "01800000000",
      });

      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        supplier: {
          existingSupplierId: supplier.id,
          updates: { address: "Babubazar", phone: "01900000000" },
        },
      });

      expect(result.supplier.id).toBe(supplier.id);
      expect(world.state.suppliers).toHaveLength(1);
      expect(world.state.suppliers[0]).toMatchObject({
        address: "Babubazar",
        phone: "01900000000",
      });
    });

    it("rejects an unknown existing supplier", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          supplier: {
            existingSupplierId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(world.state.products).toHaveLength(0);
    });

    it("finds or creates the self-purchase supplier when none is given", async () => {
      const world = createStockIntakeTestWorld();
      await recordStockIntake(world.dependencies, newProductInput());
      await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        idempotencyKey: "intake-key-0007",
      });

      expect(world.state.suppliers).toEqual([
        expect.objectContaining({
          code: SELF_PURCHASE_SUPPLIER_CODE,
          name: SELF_PURCHASE_SUPPLIER_NAME,
        }),
      ]);
    });
  });

  describe("transport cost", () => {
    const twoLines = [
      {
        colorName: "Black",
        quantity: 3,
        sellingPriceMinor: 90_000,
        sizeName: "M",
        unitCostMinor: 50_000,
      },
      {
        colorName: "Black",
        quantity: 1,
        sellingPriceMinor: 90_000,
        sizeName: "L",
        unitCostMinor: 40_000,
      },
    ];

    it("folds transport into unit cost so the purchase total is exact", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput({ lines: twoLines }),
        transportCostMinor: 1_001,
      });

      // 1_001 / 4 pieces = 250 each; the remainder of 1 lands on the one-piece line.
      expect(result.variants.map((variant) => variant.unitCostMinor)).toEqual([
        50_250, 40_251,
      ]);
      expect(result.purchase.totalCostMinor).toBe(
        (3 * 50_000 + 40_000 + 1_001).toString(),
      );
      expect(result.transportAppliedMinor).toBe(1_001);
      expect(result.transportRequestedMinor).toBe(1_001);
    });

    it("distributes remainders across lines and keeps the sum exact", () => {
      const lines = [
        { quantity: 7, unitCostMinor: 100 },
        { quantity: 5, unitCostMinor: 200 },
        { quantity: 2, unitCostMinor: 300 },
      ];
      for (const transport of [0, 13, 999, 12_345]) {
        const { appliedMinor, unitCosts } = distributeTransportCost(
          lines,
          transport,
        );
        const total = lines.reduce(
          (sum, line, index) => sum + line.quantity * (unitCosts[index] ?? 0),
          0,
        );
        expect(appliedMinor).toBe(transport);
        expect(total).toBe(7 * 100 + 5 * 200 + 2 * 300 + transport);
        unitCosts.forEach((unitCost, index) => {
          expect(unitCost).toBeGreaterThanOrEqual(
            lines[index]?.unitCostMinor ?? 0,
          );
        });
      }
    });

    it("lowers the even share when that makes an exact split possible", () => {
      // 6 / 5 pieces = 1 each with remainder 1, which 2 and 3 cannot absorb;
      // giving 3 to the 2-piece line and 0 to the 3-piece line is exact.
      const { appliedMinor, unitCosts } = distributeTransportCost(
        [
          { quantity: 2, unitCostMinor: 100 },
          { quantity: 3, unitCostMinor: 100 },
        ],
        6,
      );
      expect(appliedMinor).toBe(6);
      expect(2 * (unitCosts[0] ?? 0) + 3 * (unitCosts[1] ?? 0)).toBe(506);
    });

    it("applies the nearest lower amount when an exact split is impossible", () => {
      // 5_000 over 12 pieces: 416 each = 4_992; nothing between is composable.
      expect(
        distributeTransportCost([{ quantity: 12, unitCostMinor: 100 }], 5_000),
      ).toEqual({ appliedMinor: 4_992, unitCosts: [516] });
      // 1 cannot be absorbed by lines of 7 and 5 pieces, so nothing is applied.
      expect(
        distributeTransportCost(
          [
            { quantity: 7, unitCostMinor: 100 },
            { quantity: 5, unitCostMinor: 200 },
          ],
          1,
        ),
      ).toEqual({ appliedMinor: 0, unitCosts: [100, 200] });
      // 13 over 7 + 5 pieces: 13 is not composable but 12 = 7 + 5 is.
      expect(
        distributeTransportCost(
          [
            { quantity: 7, unitCostMinor: 100 },
            { quantity: 5, unitCostMinor: 200 },
          ],
          13,
        ),
      ).toEqual({ appliedMinor: 12, unitCosts: [101, 201] });
    });

    it("records a non-exact transport at the applied amount without failing", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput({
          lines: [
            {
              colorName: "Black",
              quantity: 12,
              sellingPriceMinor: 90_000,
              sizeName: "M",
              unitCostMinor: 100,
            },
          ],
        }),
        transportCostMinor: 5_000,
      });

      expect(result.transportRequestedMinor).toBe(5_000);
      expect(result.transportAppliedMinor).toBe(4_992);
      expect(result.variants[0]?.unitCostMinor).toBe(516);
      expect(result.purchase.totalCostMinor).toBe("6192");
      // Supplier owes only the goods: 12 * 100.
      expect(result.dueMinor).toBe("1200");
      expect(world.state.ledger[1]?.amountMinor).toBe(4_992n);
    });

    it("keeps transport off the supplier balance by default", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        transportCostMinor: 1_500,
      });

      expect(result.purchase.totalCostMinor).toBe("751500");
      expect(result.dueMinor).toBe("750000");
      expect(
        world.state.ledger.map((entry) => [
          entry.entryType,
          entry.direction,
          entry.amountMinor,
          entry.referenceId,
        ]),
      ).toEqual([
        ["BILL", "CREDIT", 751_500n, result.purchase.id],
        ["ADJUSTMENT", "DEBIT", 1_500n, result.purchase.id],
      ]);
      expect(world.state.ledger[1]?.notes).toBe(TRANSPORT_NOT_PAYABLE_NOTE);
      await expect(
        world.dependencies.supplierLedger.getSupplierBalance(
          result.supplier.id,
          testOrganizationId,
        ),
      ).resolves.toMatchObject({ outstandingBalanceMinor: 750_000n });
    });

    it("bills transport to the supplier when it was paid to them", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        transportCostMinor: 1_500,
        transportPaidToSupplier: true,
      });

      expect(result.dueMinor).toBe("751500");
      expect(world.state.ledger.map((entry) => entry.entryType)).toEqual([
        "BILL",
      ]);
    });

    it("does not adjust the ledger when there is no transport", async () => {
      const world = createStockIntakeTestWorld();
      await recordStockIntake(world.dependencies, newProductInput());
      expect(world.state.ledger.map((entry) => entry.entryType)).toEqual([
        "BILL",
      ]);
    });
  });

  describe("payment", () => {
    it("records a supplier payment linked to the purchase", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        payment: { amountMinor: 500_000, method: "BANK" },
      });

      expect(result.payment).toMatchObject({
        amountMinor: "500000",
        method: "BANK_TRANSFER",
      });
      expect(result.dueMinor).toBe("250000");
      expect(world.state.payments[0]).toMatchObject({
        purchaseId: result.purchase.id,
        supplierId: result.supplier.id,
      });
      expect(world.state.ledger.map((entry) => entry.entryType)).toEqual([
        "BILL",
        "PAYMENT",
      ]);
    });

    it("rejects a payment larger than the goods total before any write", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          payment: { amountMinor: 750_001, method: "CASH" },
        }),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
      expect(world.state.products).toHaveLength(0);
      expect(world.state.purchases).toHaveLength(0);
      expect(world.state.suppliers).toHaveLength(0);
    });

    it("excludes transport from the payable amount by default", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          payment: { amountMinor: 751_500, method: "CASH" },
          transportCostMinor: 1_500,
        }),
      ).rejects.toBeInstanceOf(ValidationApplicationError);

      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        payment: { amountMinor: 750_000, method: "CASH" },
        transportCostMinor: 1_500,
      });
      expect(result.dueMinor).toBe("0");
      await expect(
        world.dependencies.supplierLedger.getSupplierBalance(
          result.supplier.id,
          testOrganizationId,
        ),
      ).resolves.toMatchObject({ outstandingBalanceMinor: 0n });
    });

    it("accepts a payment equal to goods plus transport paid to the supplier", async () => {
      const world = createStockIntakeTestWorld();
      const { result } = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        payment: { amountMinor: 751_500, method: "MOBILE_BANKING" },
        transportCostMinor: 1_500,
        transportPaidToSupplier: true,
      });
      expect(result.dueMinor).toBe("0");
      await expect(
        world.dependencies.supplierLedger.getSupplierBalance(
          result.supplier.id,
          testOrganizationId,
        ),
      ).resolves.toMatchObject({ outstandingBalanceMinor: 0n });
    });
  });

  describe("line validation", () => {
    it("rejects duplicate color and size lines regardless of case", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(
          world.dependencies,
          newProductInput({
            lines: [
              {
                colorName: "Black",
                quantity: 1,
                sellingPriceMinor: 1_000,
                sizeName: "M",
                unitCostMinor: 500,
              },
              {
                colorName: " black ",
                quantity: 2,
                sellingPriceMinor: 1_000,
                sizeName: "m",
                unitCostMinor: 500,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
      expect(world.state.products).toHaveLength(0);
    });

    it("rejects the same existing variant twice", async () => {
      const world = createStockIntakeTestWorld();
      const variantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      await expect(
        recordStockIntake(
          world.dependencies,
          newProductInput({
            lines: [
              { existingVariantId: variantId, quantity: 1, unitCostMinor: 1 },
              { existingVariantId: variantId, quantity: 1, unitCostMinor: 1 },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
    });

    it("rejects an existing-variant line and a color/size line for the same variant", async () => {
      const world = createStockIntakeTestWorld();
      const first = await recordStockIntake(
        world.dependencies,
        newProductInput(),
      );
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          idempotencyKey: "intake-key-0008",
          lines: [
            {
              existingVariantId: first.result.variants[0]?.id ?? "",
              quantity: 1,
              unitCostMinor: 1,
            },
            {
              colorName: "Black",
              quantity: 1,
              sellingPriceMinor: 90_000,
              sizeName: "M",
              unitCostMinor: 1,
            },
          ],
          product: { existingProductId: first.result.product.id },
        }),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
      expect(world.state.purchases).toHaveLength(1);
    });

    it("rejects an unknown destination location", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          purchase: {
            destinationLocationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("stores the memo in notes and allows the same memo for two suppliers", async () => {
      const world = createStockIntakeTestWorld();
      const first = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        purchase: {
          destinationLocationId: testLocationId,
          memoNumber: " 101/A ",
          note: "First delivery",
        },
        supplier: { new: { name: "Rahim Textiles", phone: "01711000000" } },
      });
      const second = await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        idempotencyKey: "intake-key-0009",
        purchase: {
          destinationLocationId: testLocationId,
          memoNumber: "101/A",
        },
        supplier: { new: { name: "Karim Fabrics", phone: "01800000000" } },
      });

      expect(first.result.supplier.id).not.toBe(second.result.supplier.id);
      expect(first.result.purchase.purchaseNumber).toMatch(/^PO-/);
      expect(first.result.purchase.purchaseNumber).not.toBe(
        second.result.purchase.purchaseNumber,
      );
      expect(world.state.purchases.map((purchase) => purchase.notes)).toEqual([
        "Memo: 101/A\nFirst delivery",
        "Memo: 101/A",
      ]);
      expect(
        world.state.movements.map((movement) => movement.movementNumber),
      ).toEqual(
        world.state.purchases.map(
          (purchase) => `REC-${purchase.purchaseNumber}`,
        ),
      );
    });

    it("accepts a Bangla memo with spaces", async () => {
      const world = createStockIntakeTestWorld();
      await recordStockIntake(world.dependencies, {
        ...newProductInput(),
        purchase: {
          destinationLocationId: testLocationId,
          memoNumber: "মেমো ১২৩/৪",
        },
      });
      expect(world.state.purchases[0]?.notes).toBe("Memo: মেমো ১২৩/৪");
    });

    it("rejects a memo longer than 60 characters", async () => {
      const world = createStockIntakeTestWorld();
      await expect(
        recordStockIntake(world.dependencies, {
          ...newProductInput(),
          purchase: {
            destinationLocationId: testLocationId,
            memoNumber: "১".repeat(61),
          },
        }),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
    });
  });

  describe("idempotency", () => {
    it("replays the original result for the same key and input without new writes", async () => {
      const world = createStockIntakeTestWorld();
      const input: RecordStockIntakeInput = {
        ...newProductInput(),
        payment: { amountMinor: 1_000, method: "CASH" },
        purchase: {
          destinationLocationId: testLocationId,
          memoNumber: "MEMO-77",
          note: "First delivery",
          purchaseDate: new Date("2026-09-30T00:00:00.000Z"),
        },
        transportCostMinor: 1_500,
      };
      const first = await recordStockIntake(world.dependencies, input);
      const counts = () => ({
        audits: world.state.audits.length,
        barcodes: world.state.barcodes.length,
        ledger: world.state.ledger.length,
        movements: world.state.movements.length,
        payments: world.state.payments.length,
        products: world.state.products.length,
        purchases: world.state.purchases.length,
        variants: world.state.variants.length,
      });
      const before = counts();

      const replay = await recordStockIntake(world.dependencies, {
        ...input,
        // Whitespace and letter case in lookup names normalize to the same request.
        product: {
          audienceCategoryName: " men ",
          name: "Classic  Crew Tee",
          typeCategoryName: "T-SHIRT",
        },
      });

      expect(replay.replayed).toBe(true);
      expect(replay.result).toEqual(first.result);
      expect(counts()).toEqual(before);
    });

    it("rejects the same key with different details", async () => {
      const world = createStockIntakeTestWorld();
      await recordStockIntake(world.dependencies, newProductInput());

      const changed = newProductInput();
      await expect(
        recordStockIntake(world.dependencies, {
          ...changed,
          lines: changed.lines.map((line) => ({ ...line, quantity: 99 })),
        }),
      ).rejects.toBeInstanceOf(StockIntakeIdempotencyConflictError);
      expect(world.state.purchases).toHaveLength(1);
    });
  });
});

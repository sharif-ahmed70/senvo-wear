import type { AuditWriter } from "../../audit/application/audit-writer.js";
import type { AuditMetadata } from "../../audit/domain/models.js";
import { createVariantBarcode } from "../../catalog/application/barcode-use-cases.js";
import {
  createCategory,
  createColor,
  createProduct,
  createProductVariant,
  createSize,
} from "../../catalog/application/create-use-cases.js";
import {
  assertSellingPriceMinor,
  updateVariantPrice,
} from "../../catalog/application/variant-pricing-use-cases.js";
import type {
  Category,
  Color,
  Product,
  ProductVariant,
  Size,
  VariantBarcode,
} from "../../catalog/domain/models.js";
import {
  normalizeComparableName,
  normalizeDisplayName,
  normalizeOptionalDescription,
  normalizeSku,
} from "../../catalog/domain/value-objects.js";
import type {
  BarcodeRepository,
  CatalogProductVariantManagementRepository,
  CategoryRepository,
  ColorRepository,
  OrganizationRepository,
  ProductRepository,
  SizeRepository,
} from "../../catalog/repositories/catalog-repositories.js";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  PurchaseWithLines,
  Supplier,
  SupplierPaymentMethod,
} from "../domain/models.js";
import {
  comparableIntakeName,
  createStockIntakeRequestSignature,
  deriveCatalogCode,
  deriveProductCodePrefix,
  distributeTransportCost,
  formatSequenceCode,
  generateCode128BarcodeValue,
  nextSequenceNumber,
  normalizeIntakeName,
  slugFromIntakeName,
  withNumericSuffix,
} from "../domain/stock-intake-rules.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";
import type {
  SupplierLedgerRepository,
  SupplierPaymentRepository,
} from "../repositories/supplier-payment-repository.js";
import type { SupplierRepository } from "../repositories/supplier-repository.js";
import type { StockIntakeRepository } from "../repositories/stock-intake-repository.js";
import {
  confirmPurchaseOrder,
  createPurchaseDraftRecord,
  type ConfirmPurchaseOrderDependencies,
} from "./purchase-use-cases.js";
import { replayPurchaseCosts } from "./purchase-cost-correction.js";
import {
  createInventoryMovement,
  postInventoryMovement,
} from "../../inventory/application/movement-use-cases.js";
import { deriveCostStateAfterReceipt } from "../domain/costing-rules.js";
import {
  recordSupplierAdjustment,
  recordSupplierPayment,
} from "./supplier-payment-use-cases.js";

export const STOCK_INTAKE_IDEMPOTENCY_PREFIX = "stock-intake:";
export const SELF_PURCHASE_SUPPLIER_CODE = "SELF";
export const SELF_PURCHASE_SUPPLIER_NAME = "নিজে কেনা";
export const TRANSPORT_NOT_PAYABLE_NOTE =
  "Transport/labour — not payable to supplier";
const DEFAULT_COLOR_HEX = "#9CA3AF";
const MAX_CODE_ATTEMPTS = 50;

export type StockIntakePaymentMethod = "BANK" | "CASH" | "MOBILE_BANKING";
export type StockIntakeProductStatus = "ACTIVE" | "DRAFT" | "INACTIVE";

export type StockIntakeProductInput =
  | { existingProductId: string }
  | {
      audienceCategoryName: string;
      description?: string | null;
      name: string;
      status?: StockIntakeProductStatus;
      typeCategoryName: string;
    };

export type StockIntakeLineInput = (
  { existingVariantId: string } | { colorName: string; sizeName: string }
) & {
  quantity: number;
  sellingPriceMinor?: number;
  unitCostMinor: number;
};

export type StockIntakeSupplierInput =
  | {
      existingSupplierId: string;
      updates?: { address?: string | null; phone?: string | null };
    }
  | { new: { address?: string | null; name: string; phone: string } }
  | null;

export type RecordStockIntakeInput = {
  actorUserId: string | null;
  idempotencyKey: string;
  lines: readonly StockIntakeLineInput[];
  organizationId: string;
  payment?: { amountMinor: number; method: StockIntakePaymentMethod } | null;
  product: StockIntakeProductInput;
  purchase: {
    destinationLocationId: string;
    memoNumber?: string | null;
    note?: string | null;
    purchaseDate?: Date | null;
  };
  supplier: StockIntakeSupplierInput;
  transportCostMinor?: number | null;
  /**
   * When false (default) the transport is store cost only: it stays in unit
   * cost but is written off the supplier ledger with a DEBIT adjustment.
   */
  transportPaidToSupplier?: boolean | null;
};

export type StockIntakeResultVariant = {
  barcode: string | null;
  color: string;
  id: string;
  quantity: number;
  sellingPriceMinor: number;
  size: string;
  sku: string;
  unitCostMinor: number;
};

export type StockIntakeResult = {
  dueMinor: string;
  payment: {
    amountMinor: string;
    id: string;
    method: SupplierPaymentMethod;
  } | null;
  product: { code: string; id: string; name: string };
  purchase: { id: string; purchaseNumber: string; totalCostMinor: string };
  supplier: { id: string; name: string };
  transportAppliedMinor: number;
  transportRequestedMinor: number;
  variants: StockIntakeResultVariant[];
};

export type RecordStockIntakeOutcome = {
  replayed: boolean;
  result: StockIntakeResult;
};

export type RecordStockIntakeDependencies = {
  auditWriter: Pick<AuditWriter, "recordWithinTransaction">;
  barcodes: BarcodeRepository;
  categories: CategoryRepository;
  colors: ColorRepository;
  costs: CostRepository;
  generateBarcodeValue?: () => string;
  inventoryMovements: ConfirmPurchaseOrderDependencies["inventoryMovementRepository"];
  organizations: OrganizationRepository;
  products: ProductRepository;
  productVariants: CatalogProductVariantManagementRepository;
  purchases: PurchaseRepository;
  sizes: SizeRepository;
  stockIntakes: StockIntakeRepository;
  supplierLedger: SupplierLedgerRepository;
  supplierPayments: SupplierPaymentRepository;
  suppliers: SupplierRepository;
};

export class StockIntakeIdempotencyConflictError extends ConflictError {
  constructor() {
    super(
      "This stock intake idempotency key was already used with different details.",
    );
  }
}

type ResolvedLine = {
  color: Color;
  quantity: number;
  sellingPriceMinor: number;
  size: Size;
  /** Supplier price per piece, before transport. */
  supplierUnitCostMinor: number;
  unitCostMinor: number;
  variant: ProductVariant;
};

/**
 * Records a full supplier delivery in one transaction: catalog records
 * (categories, colors, sizes, product, variants, barcodes), the purchase and
 * its posted inventory receipt with moving-average cost, the supplier bill and
 * an optional supplier payment, plus a transactional audit entry.
 *
 * The caller must run this inside a single transaction and pass
 * transaction-scoped repositories.
 */
export async function recordStockIntake(
  dependencies: RecordStockIntakeDependencies,
  input: RecordStockIntakeInput,
): Promise<RecordStockIntakeOutcome> {
  const organizationId = input.organizationId;
  const normalized = normalizeStockIntakeInput(input);
  const requestSignature = await createStockIntakeRequestSignature(
    normalized.signature,
  );
  const purchaseIdempotencyKey = `${STOCK_INTAKE_IDEMPOTENCY_PREFIX}${normalized.idempotencyKey}`;

  await dependencies.stockIntakes.acquireIdempotencyLock(
    organizationId,
    purchaseIdempotencyKey,
  );

  const existingPurchase = await dependencies.purchases.findByIdempotencyKey(
    organizationId,
    purchaseIdempotencyKey,
  );
  if (existingPurchase) {
    const metadata =
      await dependencies.stockIntakes.findStockIntakeAuditMetadata(
        organizationId,
        existingPurchase.id,
      );
    const stored = readStoredStockIntake(metadata);
    if (!stored || stored.requestSignature !== requestSignature) {
      throw new StockIntakeIdempotencyConflictError();
    }
    return {
      replayed: true,
      result: await rebuildStockIntakeResult(
        dependencies,
        organizationId,
        existingPurchase,
        stored,
      ),
    };
  }

  const goodsTotalMinor = normalized.lines.reduce(
    (sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitCostMinor),
    0n,
  );
  const transport = distributeTransportCost(
    normalized.lines,
    normalized.transportCostMinor,
  );
  const transportAppliedMinor = BigInt(transport.appliedMinor);
  const purchaseTotalMinor = goodsTotalMinor + transportAppliedMinor;
  // What this purchase leaves owed to the supplier: transport paid to a
  // carrier or labourer stays in inventory cost but is not supplier debt.
  const supplierPayableMinor = normalized.transportPaidToSupplier
    ? purchaseTotalMinor
    : goodsTotalMinor;
  if (
    normalized.payment &&
    BigInt(normalized.payment.amountMinor) > supplierPayableMinor
  ) {
    throw new ValidationApplicationError(
      normalized.transportPaidToSupplier
        ? "Payment amount cannot exceed the purchase total."
        : "Payment amount cannot exceed the goods total owed to the supplier.",
    );
  }

  if (
    !(await dependencies.stockIntakes.isActiveStockLocation(
      organizationId,
      normalized.purchase.destinationLocationId,
    ))
  ) {
    throw new NotFoundError("Destination stock location was not found.");
  }

  const supplier = await resolveSupplier(dependencies, organizationId, input);
  const product = await resolveProduct(dependencies, organizationId, input);
  const resolvedLines = await resolveLines(
    dependencies,
    organizationId,
    product,
    normalized.lines,
    transport.unitCosts,
  );
  const barcodes = await ensureBarcodes(
    dependencies,
    organizationId,
    resolvedLines,
  );

  const draft = await createPurchaseDraftRecord(dependencies.purchases, {
    destinationLocationId: normalized.purchase.destinationLocationId,
    idempotencyKey: purchaseIdempotencyKey,
    lines: resolvedLines.map((line, index) => ({
      lineNumber: index + 1,
      productName: product.name,
      productVariantId: line.variant.id,
      quantity: line.quantity,
      sku: line.variant.sku,
      unitCostMinor: line.unitCostMinor,
      // Keep the supplier price; the transport share is stored separately.
      supplierUnitCostMinor: line.supplierUnitCostMinor,
      extraCostPerUnitMinor: line.unitCostMinor - line.supplierUnitCostMinor,
      variantName: `${line.color.name} / ${line.size.name}`,
    })),
    notes: purchaseNotes(normalized.purchase),
    organizationId,
    purchaseDate: normalized.purchase.purchaseDate ?? undefined,
    supplierId: supplier.id,
  });
  if (draft.totalCostMinor !== purchaseTotalMinor) {
    throw new BusinessRuleError(
      "Purchase total does not match goods plus applied transport cost.",
    );
  }

  const purchase = await confirmPurchaseOrder(
    {
      costRepository: dependencies.costs,
      inventoryMovementRepository: dependencies.inventoryMovements,
      purchaseRepository: dependencies.purchases,
      supplierLedgerRepository: dependencies.supplierLedger,
    },
    {
      idempotencyKey: purchaseIdempotencyKey,
      organizationId,
      purchaseId: draft.id,
    },
  );

  // confirmPurchaseOrder bills the full purchase total (goods + transport) to
  // the supplier; take the transport back off when it was not owed to them.
  if (!normalized.transportPaidToSupplier && transportAppliedMinor > 0n) {
    await recordSupplierAdjustment(
      {
        supplierLedgerRepository: dependencies.supplierLedger,
        supplierRepository: dependencies.suppliers,
      },
      {
        amountMinor: transportAppliedMinor,
        direction: "DEBIT",
        entryType: "ADJUSTMENT",
        notes: TRANSPORT_NOT_PAYABLE_NOTE,
        organizationId,
        purchaseId: purchase.id,
        referenceId: purchase.id,
        supplierId: supplier.id,
      },
    );
  }

  let payment: StockIntakeResult["payment"] = null;
  if (normalized.payment) {
    const recorded = await recordSupplierPayment(
      {
        purchaseRepository: dependencies.purchases,
        supplierLedgerRepository: dependencies.supplierLedger,
        supplierPaymentRepository: dependencies.supplierPayments,
        supplierRepository: dependencies.suppliers,
      },
      {
        amountMinor: BigInt(normalized.payment.amountMinor),
        idempotencyKey: purchaseIdempotencyKey,
        notes: `Payment for purchase ${purchase.purchaseNumber}`,
        organizationId,
        paymentMethod: normalized.payment.method,
        purchaseId: purchase.id,
        supplierId: supplier.id,
      },
    );
    payment = {
      amountMinor: recorded.payment.amountMinor.toString(),
      id: recorded.payment.id,
      method: recorded.payment.paymentMethod,
    };
  }

  const paidMinor = payment ? BigInt(payment.amountMinor) : 0n;
  const dueMinor = supplierPayableMinor - paidMinor;
  if (dueMinor < 0n) {
    throw new BusinessRuleError(
      "Supplier payment exceeds the amount owed for this purchase.",
    );
  }
  const result: StockIntakeResult = {
    dueMinor: dueMinor.toString(),
    payment,
    product: { code: product.productCode, id: product.id, name: product.name },
    purchase: {
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      totalCostMinor: purchase.totalCostMinor.toString(),
    },
    supplier: { id: supplier.id, name: supplier.name },
    transportAppliedMinor: transport.appliedMinor,
    transportRequestedMinor: normalized.transportCostMinor,
    variants: resolvedLines.map((line, index) => ({
      barcode: barcodes[index]?.value ?? null,
      color: line.color.name,
      id: line.variant.id,
      quantity: line.quantity,
      sellingPriceMinor: line.sellingPriceMinor,
      size: line.size.name,
      sku: line.variant.sku,
      unitCostMinor: line.unitCostMinor,
    })),
  };

  await dependencies.auditWriter.recordWithinTransaction({
    action: "STOCK_INTAKE_RECORDED",
    actor: { userId: input.actorUserId },
    // Identifiers, counts, amounts and the request fingerprint only: no
    // names, phone numbers or other personal data. Replays rebuild the
    // response from the stored records these ids point to.
    metadata: {
      barcodeIds: barcodes.map((barcode) => barcode.id),
      dueMinor: result.dueMinor,
      lineCount: resolvedLines.length,
      paymentId: payment?.id ?? null,
      productId: product.id,
      requestSignature,
      sellingPricesMinor: resolvedLines.map((line) => line.sellingPriceMinor),
      supplierId: supplier.id,
      supplierPayableMinor: supplierPayableMinor.toString(),
      totalCostMinor: purchase.totalCostMinor.toString(),
      totalQuantity: resolvedLines.reduce(
        (sum, line) => sum + line.quantity,
        0,
      ),
      transportAppliedMinor: transport.appliedMinor,
      transportPaidToSupplier: normalized.transportPaidToSupplier,
      transportRequestedMinor: normalized.transportCostMinor,
    },
    organizationId,
    resource: "PURCHASE",
    resourceId: purchase.id,
  });
  return { replayed: false, result };
}

type NormalizedLine = {
  colorKey: string | null;
  colorName: string | null;
  existingVariantId: string | null;
  quantity: number;
  sellingPriceMinor: number | null;
  sizeKey: string | null;
  sizeName: string | null;
  unitCostMinor: number;
};

function normalizeStockIntakeInput(input: RecordStockIntakeInput) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ValidationApplicationError("idempotencyKey is required.");
  }
  if (input.lines.length === 0) {
    throw new ValidationApplicationError(
      "Stock intake requires at least one line.",
    );
  }

  const seenVariants = new Set<string>();
  const seenCombinations = new Set<string>();
  const lines: NormalizedLine[] = input.lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new ValidationApplicationError(
        "Line quantity must be a positive integer.",
      );
    }
    if (!Number.isSafeInteger(line.unitCostMinor) || line.unitCostMinor < 0) {
      throw new ValidationApplicationError(
        "Line unit cost must be a non-negative integer.",
      );
    }
    if (line.sellingPriceMinor !== undefined) {
      assertSellingPriceMinor(line.sellingPriceMinor);
    }
    const base = {
      quantity: line.quantity,
      sellingPriceMinor: line.sellingPriceMinor ?? null,
      unitCostMinor: line.unitCostMinor,
    };
    if ("existingVariantId" in line) {
      const variantId = line.existingVariantId.toLowerCase();
      if (seenVariants.has(variantId)) {
        throw new ValidationApplicationError(
          "A variant may appear only once per stock intake.",
        );
      }
      seenVariants.add(variantId);
      return {
        ...base,
        colorKey: null,
        colorName: null,
        existingVariantId: variantId,
        sizeKey: null,
        sizeName: null,
      };
    }
    const colorName = normalizeDisplayName(line.colorName, "color name");
    const sizeName = normalizeDisplayName(line.sizeName, "size name");
    const colorKey = comparableIntakeName(colorName);
    const sizeKey = comparableIntakeName(sizeName);
    const combination = `${colorKey}\u0000${sizeKey}`;
    if (seenCombinations.has(combination)) {
      throw new ValidationApplicationError(
        "A color and size combination may appear only once per stock intake.",
      );
    }
    seenCombinations.add(combination);
    return {
      ...base,
      colorKey,
      colorName,
      existingVariantId: null,
      sizeKey,
      sizeName,
    };
  });

  const transportCostMinor = input.transportCostMinor ?? 0;
  const transportPaidToSupplier = input.transportPaidToSupplier ?? false;
  if (!Number.isSafeInteger(transportCostMinor) || transportCostMinor < 0) {
    throw new ValidationApplicationError(
      "Transport cost must be a non-negative integer.",
    );
  }
  const payment = input.payment
    ? {
        amountMinor: input.payment.amountMinor,
        method: mapPaymentMethod(input.payment.method),
      }
    : null;
  if (
    payment &&
    (!Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0)
  ) {
    throw new ValidationApplicationError(
      "Payment amount must be a positive integer.",
    );
  }

  const purchase = {
    destinationLocationId: input.purchase.destinationLocationId.toLowerCase(),
    memoNumber: input.purchase.memoNumber?.trim() || null,
    note: optionalText(input.purchase.note),
    purchaseDate: input.purchase.purchaseDate ?? null,
  };
  if (purchase.memoNumber && [...purchase.memoNumber].length > 60) {
    throw new ValidationApplicationError(
      "Memo number must be 60 characters or fewer.",
    );
  }
  if (purchase.purchaseDate && Number.isNaN(purchase.purchaseDate.getTime())) {
    throw new ValidationApplicationError("purchaseDate is invalid.");
  }

  const product =
    "existingProductId" in input.product
      ? { existingProductId: input.product.existingProductId.toLowerCase() }
      : {
          audienceCategory: comparableIntakeName(
            input.product.audienceCategoryName,
          ),
          description: normalizeOptionalDescription(input.product.description),
          name: normalizeDisplayName(input.product.name, "product name"),
          status: input.product.status ?? "ACTIVE",
          typeCategory: comparableIntakeName(input.product.typeCategoryName),
        };
  const supplier =
    input.supplier === null
      ? null
      : "existingSupplierId" in input.supplier
        ? {
            address: signatureOptional(input.supplier.updates?.address),
            existingSupplierId: input.supplier.existingSupplierId.toLowerCase(),
            phone: signatureOptional(input.supplier.updates?.phone),
          }
        : {
            new: {
              address: optionalText(input.supplier.new.address),
              name: normalizeIntakeName(input.supplier.new.name),
              phone: normalizeIntakeName(input.supplier.new.phone),
            },
          };

  return {
    idempotencyKey,
    lines,
    payment,
    purchase,
    signature: {
      lines: lines.map((line) => [
        line.existingVariantId,
        line.colorKey,
        line.sizeKey,
        line.quantity,
        line.unitCostMinor,
        line.sellingPriceMinor,
      ]),
      payment,
      product,
      purchase: {
        ...purchase,
        purchaseDate: purchase.purchaseDate?.toISOString() ?? null,
      },
      supplier,
      transportCostMinor,
      transportPaidToSupplier,
      version: 2,
    },
    transportCostMinor,
    transportPaidToSupplier,
  };
}

async function resolveSupplier(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  input: RecordStockIntakeInput,
): Promise<Supplier> {
  const { suppliers } = dependencies;
  if (input.supplier === null) {
    const existing = await suppliers.findByCode(
      organizationId,
      SELF_PURCHASE_SUPPLIER_CODE,
    );
    return (
      existing ??
      suppliers.create({
        code: SELF_PURCHASE_SUPPLIER_CODE,
        name: SELF_PURCHASE_SUPPLIER_NAME,
        organizationId,
      })
    );
  }

  if ("existingSupplierId" in input.supplier) {
    const supplier = await suppliers.findById(
      input.supplier.existingSupplierId,
      organizationId,
    );
    if (!supplier) {
      throw new NotFoundError("Supplier was not found in this organization.");
    }
    const updates = input.supplier.updates;
    if (
      updates &&
      (updates.phone !== undefined || updates.address !== undefined)
    ) {
      const updated = await suppliers.update({
        ...(updates.address !== undefined
          ? { address: optionalText(updates.address) }
          : {}),
        id: supplier.id,
        organizationId,
        ...(updates.phone !== undefined
          ? { phone: optionalText(updates.phone) }
          : {}),
      });
      if (!updated) {
        throw new NotFoundError("Supplier was not found in this organization.");
      }
      return updated;
    }
    return supplier;
  }

  const fresh = input.supplier.new;
  const existingCodes =
    await dependencies.stockIntakes.listSupplierCodesWithPrefix(
      organizationId,
      "SUP-",
    );
  const firstSequence = nextSequenceNumber("SUP", existingCodes);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = formatSequenceCode("SUP", firstSequence + attempt);
    if (!(await suppliers.findByCode(organizationId, code))) {
      return suppliers.create({
        address: optionalText(fresh.address),
        code,
        name: normalizeDisplayName(fresh.name, "supplier name"),
        organizationId,
        phone: normalizeIntakeName(fresh.phone),
      });
    }
  }
  throw new ConflictError("Could not allocate a unique supplier code.");
}

async function resolveProduct(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  input: RecordStockIntakeInput,
): Promise<Product> {
  if ("existingProductId" in input.product) {
    const product = await dependencies.products.findById(
      input.product.existingProductId,
    );
    if (!product || product.organizationId !== organizationId) {
      throw new NotFoundError("Product was not found.");
    }
    return product;
  }

  const productInput = input.product;
  const audience = await findOrCreateCategory(
    dependencies,
    organizationId,
    productInput.audienceCategoryName,
    null,
  );
  const typeCategory =
    (await dependencies.stockIntakes.findCategoryByName(
      organizationId,
      audience.id,
      normalizeDisplayName(productInput.typeCategoryName, "category name"),
    )) ??
    (await dependencies.stockIntakes.findCategoryByName(
      organizationId,
      null,
      normalizeDisplayName(productInput.typeCategoryName, "category name"),
    )) ??
    (await findOrCreateCategory(
      dependencies,
      organizationId,
      productInput.typeCategoryName,
      audience,
    ));

  const prefix = deriveProductCodePrefix(productInput.typeCategoryName);
  const existingCodes =
    await dependencies.stockIntakes.listProductCodesWithPrefix(
      organizationId,
      `${prefix}-`,
    );
  const firstSequence = nextSequenceNumber(prefix, existingCodes);
  const name = normalizeDisplayName(productInput.name, "product name");
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const productCode = formatSequenceCode(prefix, firstSequence + attempt);
    const slug = slugFromIntakeName(
      `${name} ${productCode}`,
      productCode.toLowerCase(),
    );
    if (
      (await dependencies.products.findByCode(organizationId, productCode)) ||
      (await dependencies.products.findBySlug(organizationId, slug))
    ) {
      continue;
    }
    return createProduct(
      {
        categories: dependencies.categories,
        organizations: dependencies.organizations,
        products: dependencies.products,
      },
      {
        categoryId: typeCategory.id,
        description: productInput.description ?? null,
        name,
        organizationId,
        productCode,
        slug,
        status: productInput.status ?? "ACTIVE",
      },
    );
  }
  throw new ConflictError("Could not allocate a unique product code.");
}

async function findOrCreateCategory(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  rawName: string,
  parent: Category | null,
): Promise<Category> {
  const name = normalizeDisplayName(rawName, "category name");
  const existing = await dependencies.stockIntakes.findCategoryByName(
    organizationId,
    parent?.id ?? null,
    name,
  );
  if (existing) {
    return existing;
  }

  const baseSlug = slugFromIntakeName(name, "category");
  const candidates = parent
    ? [baseSlug, `${parent.slug}-${baseSlug}`.slice(0, 120).replace(/-+$/u, "")]
    : [baseSlug];
  let slug: string | null = null;
  for (const candidate of candidates) {
    if (
      !(await dependencies.categories.findBySlug(organizationId, candidate))
    ) {
      slug = candidate;
      break;
    }
  }
  const suffixBase = candidates.at(-1) ?? baseSlug;
  for (let attempt = 2; !slug && attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = withNumericSuffix(suffixBase, attempt, 120);
    if (
      !(await dependencies.categories.findBySlug(organizationId, candidate))
    ) {
      slug = candidate;
    }
  }
  if (!slug) {
    throw new ConflictError("Could not allocate a unique category slug.");
  }

  return createCategory(
    {
      categories: dependencies.categories,
      organizations: dependencies.organizations,
    },
    {
      name,
      organizationId,
      parentId: parent?.id ?? null,
      slug,
    },
  );
}

async function resolveLines(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  product: Product,
  lines: readonly NormalizedLine[],
  unitCosts: readonly number[],
): Promise<ResolvedLine[]> {
  const colorCache = new Map<string, Color>();
  const sizeCache = new Map<string, Size>();
  const resolved: ResolvedLine[] = [];
  const seenVariantIds = new Set<string>();

  for (const [index, line] of lines.entries()) {
    const unitCostMinor = unitCosts[index] ?? line.unitCostMinor;
    let variant: ProductVariant | null;
    let color: Color;
    let size: Size;

    if (line.existingVariantId) {
      variant = await dependencies.stockIntakes.findVariantById(
        organizationId,
        line.existingVariantId,
      );
      if (!variant || variant.productId !== product.id) {
        throw new NotFoundError("Product variant was not found.");
      }
      color = await requireOwned(
        dependencies.colors.findById(variant.colorId),
        organizationId,
        "Color",
      );
      size = await requireOwned(
        dependencies.sizes.findById(variant.sizeId),
        organizationId,
        "Size",
      );
    } else {
      color = await findOrCreateColor(
        dependencies,
        organizationId,
        line.colorName ?? "",
        colorCache,
      );
      size = await findOrCreateSize(
        dependencies,
        organizationId,
        line.sizeName ?? "",
        sizeCache,
      );
      variant = await dependencies.stockIntakes.findVariantByCombination(
        organizationId,
        product.id,
        color.id,
        size.id,
      );
    }

    if (variant?.status === "ARCHIVED") {
      throw new ValidationApplicationError(
        `${variant.sku} (${color.name} / ${size.name}) is archived. Restore it on the product page before adding stock.`,
      );
    }
    if (variant) {
      if (
        line.sellingPriceMinor !== null &&
        line.sellingPriceMinor !== variant.sellingPriceMinor
      ) {
        variant = await updateVariantPrice(dependencies.productVariants, {
          expectedSellingPriceMinor: variant.sellingPriceMinor,
          organizationId,
          sellingPriceMinor: line.sellingPriceMinor,
          variantId: variant.id,
        });
      }
    } else {
      if (line.sellingPriceMinor === null) {
        throw new ValidationApplicationError(
          "sellingPriceMinor is required for new variants.",
        );
      }
      variant = await createProductVariant(
        {
          colors: dependencies.colors,
          products: dependencies.products,
          productVariants: dependencies.productVariants,
          sizes: dependencies.sizes,
        },
        {
          colorId: color.id,
          organizationId,
          productId: product.id,
          sellingPriceMinor: line.sellingPriceMinor,
          sizeId: size.id,
          sku: await allocateSku(dependencies, organizationId, [
            product.productCode,
            color.code,
            size.code,
          ]),
          status: "ACTIVE",
        },
      );
    }

    if (seenVariantIds.has(variant.id)) {
      throw new ValidationApplicationError(
        "A variant may appear only once per stock intake.",
      );
    }
    seenVariantIds.add(variant.id);
    resolved.push({
      color,
      quantity: line.quantity,
      sellingPriceMinor: variant.sellingPriceMinor,
      size,
      supplierUnitCostMinor: line.unitCostMinor,
      unitCostMinor,
      variant,
    });
  }
  return resolved;
}

async function findOrCreateColor(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  rawName: string,
  cache: Map<string, Color>,
): Promise<Color> {
  const name = normalizeDisplayName(rawName, "color name");
  const normalizedName = normalizeComparableName(name);
  const cached = cache.get(normalizedName);
  if (cached) return cached;

  const color =
    (await dependencies.colors.findByNormalizedName(
      organizationId,
      normalizedName,
    )) ??
    (await createColor(
      {
        colors: dependencies.colors,
        organizations: dependencies.organizations,
      },
      {
        code: await allocateCode(deriveCatalogCode(name, "CLR"), (code) =>
          dependencies.colors.findByCode(organizationId, code),
        ),
        hexValue: DEFAULT_COLOR_HEX,
        name,
        organizationId,
      },
    ));
  cache.set(normalizedName, color);
  return color;
}

async function findOrCreateSize(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  rawName: string,
  cache: Map<string, Size>,
): Promise<Size> {
  const name = normalizeDisplayName(rawName, "size name");
  const key = comparableIntakeName(name);
  const cached = cache.get(key);
  if (cached) return cached;

  let size = await dependencies.stockIntakes.findSizeByNameOrCode(
    organizationId,
    name,
  );
  if (!size) {
    const maxSortOrder =
      await dependencies.stockIntakes.findMaxSizeSortOrder(organizationId);
    size = await createSize(
      {
        organizations: dependencies.organizations,
        sizes: dependencies.sizes,
      },
      {
        code: await allocateCode(deriveCatalogCode(name, "SZ"), (code) =>
          dependencies.sizes.findByCode(organizationId, code),
        ),
        name,
        organizationId,
        sortOrder: Math.max(0, maxSortOrder ?? 0) + 10,
      },
    );
  }
  cache.set(key, size);
  return size;
}

async function allocateCode(
  base: string,
  find: (code: string) => Promise<unknown>,
): Promise<string> {
  for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = withNumericSuffix(base, attempt, 64);
    if (!(await find(code))) {
      return code;
    }
  }
  throw new ConflictError("Could not allocate a unique catalog code.");
}

async function allocateSku(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  parts: readonly string[],
): Promise<string> {
  const base = normalizeSku(parts.join("-").slice(0, 76).replace(/-+$/u, ""));
  for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const sku = withNumericSuffix(base, attempt, 80);
    if (
      !(await dependencies.productVariants.existsBySku(organizationId, sku))
    ) {
      return sku;
    }
  }
  throw new ConflictError("Could not allocate a unique SKU.");
}

async function ensureBarcodes(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  lines: readonly ResolvedLine[],
): Promise<VariantBarcode[]> {
  const generate =
    dependencies.generateBarcodeValue ?? generateCode128BarcodeValue;
  const barcodes: VariantBarcode[] = [];
  for (const line of lines) {
    const active = await dependencies.barcodes.findActiveByVariant(
      organizationId,
      line.variant.id,
    );
    if (active) {
      barcodes.push(active);
      continue;
    }
    let value = generate();
    for (
      let attempt = 0;
      attempt < 5 && (await dependencies.barcodes.existsByValue(value));
      attempt += 1
    ) {
      value = generate();
    }
    const created = await createVariantBarcode(dependencies.barcodes, {
      organizationId,
      productVariantId: line.variant.id,
      type: "CODE128",
      value,
    });
    barcodes.push(created);
  }
  return barcodes;
}

async function requireOwned<T extends { organizationId: string }>(
  lookup: Promise<T | null>,
  organizationId: string,
  label: string,
): Promise<T> {
  const record = await lookup;
  if (!record || record.organizationId !== organizationId) {
    throw new NotFoundError(`${label} was not found.`);
  }
  return record;
}

function mapPaymentMethod(
  method: StockIntakePaymentMethod,
): SupplierPaymentMethod {
  switch (method) {
    case "BANK":
      return "BANK_TRANSFER";
    case "CASH":
      return "CASH";
    case "MOBILE_BANKING":
      return "MOBILE_BANKING";
    default:
      throw new ValidationApplicationError("Payment method is invalid.");
  }
}

function purchaseNotes(purchase: {
  memoNumber: string | null;
  note: string | null;
}): string | null {
  const parts = [
    purchase.memoNumber ? `Memo: ${purchase.memoNumber}` : null,
    purchase.note,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join("\n") : null;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeIntakeName(value);
  return normalized || null;
}

function signatureOptional(value: string | null | undefined) {
  return value === undefined ? { set: false } : { set: optionalText(value) };
}

type StoredStockIntake = {
  barcodeIds: (string | null)[];
  dueMinor: string;
  paymentId: string | null;
  productId: string;
  requestSignature: string;
  sellingPricesMinor: number[];
  transportAppliedMinor: number;
  transportRequestedMinor: number;
};

function readStoredStockIntake(
  metadata: AuditMetadata | null,
): StoredStockIntake | null {
  if (!metadata) return null;
  const {
    barcodeIds,
    dueMinor,
    paymentId,
    productId,
    requestSignature,
    sellingPricesMinor,
    transportAppliedMinor,
    transportRequestedMinor,
  } = metadata;
  if (
    typeof requestSignature !== "string" ||
    typeof productId !== "string" ||
    typeof dueMinor !== "string" ||
    (paymentId !== null && typeof paymentId !== "string") ||
    typeof transportAppliedMinor !== "number" ||
    typeof transportRequestedMinor !== "number" ||
    !Array.isArray(barcodeIds) ||
    !barcodeIds.every((id) => id === null || typeof id === "string") ||
    !Array.isArray(sellingPricesMinor) ||
    !sellingPricesMinor.every((price) => typeof price === "number")
  ) {
    return null;
  }
  return {
    barcodeIds: barcodeIds as (string | null)[],
    dueMinor,
    paymentId,
    productId,
    requestSignature,
    sellingPricesMinor,
    transportAppliedMinor,
    transportRequestedMinor,
  };
}

/**
 * Rebuilds the original response for an idempotent replay from the stored
 * purchase, its lines and the records referenced by the audit entry.
 */
async function rebuildStockIntakeResult(
  dependencies: RecordStockIntakeDependencies,
  organizationId: string,
  purchase: PurchaseWithLines,
  stored: StoredStockIntake,
): Promise<StockIntakeResult> {
  const product = await requireOwned(
    dependencies.products.findById(stored.productId),
    organizationId,
    "Product",
  );
  const supplier = await dependencies.suppliers.findById(
    purchase.supplierId,
    organizationId,
  );
  if (!supplier) {
    throw new NotFoundError("Supplier was not found in this organization.");
  }
  let payment: StockIntakeResult["payment"] = null;
  if (stored.paymentId) {
    const recorded = await dependencies.supplierPayments.getPaymentById(
      stored.paymentId,
      organizationId,
    );
    if (!recorded) {
      throw new NotFoundError("Supplier payment was not found.");
    }
    payment = {
      amountMinor: recorded.amountMinor.toString(),
      id: recorded.id,
      method: recorded.paymentMethod,
    };
  }

  const lines = [...purchase.lines].sort(
    (left, right) => left.lineNumber - right.lineNumber,
  );
  const variants: StockIntakeResultVariant[] = [];
  for (const [index, line] of lines.entries()) {
    const variant = await dependencies.stockIntakes.findVariantById(
      organizationId,
      line.productVariantId,
    );
    if (!variant) {
      throw new NotFoundError("Product variant was not found.");
    }
    const color = await requireOwned(
      dependencies.colors.findById(variant.colorId),
      organizationId,
      "Color",
    );
    const size = await requireOwned(
      dependencies.sizes.findById(variant.sizeId),
      organizationId,
      "Size",
    );
    const barcodeId = stored.barcodeIds[index];
    const barcode = barcodeId
      ? await dependencies.barcodes.findById(barcodeId, organizationId)
      : null;
    variants.push({
      barcode: barcode?.value ?? null,
      color: color.name,
      id: variant.id,
      quantity: line.quantity,
      sellingPriceMinor:
        stored.sellingPricesMinor[index] ?? variant.sellingPriceMinor,
      size: size.name,
      sku: line.sku,
      unitCostMinor: line.unitCostMinor,
    });
  }

  return {
    dueMinor: stored.dueMinor,
    payment,
    product: { code: product.productCode, id: product.id, name: product.name },
    purchase: {
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      totalCostMinor: purchase.totalCostMinor.toString(),
    },
    supplier: { id: supplier.id, name: supplier.name },
    transportAppliedMinor: stored.transportAppliedMinor,
    transportRequestedMinor: stored.transportRequestedMinor,
    variants,
  };
}

/* ------------------------------------------------------------------ */
/* Correcting a saved intake                                           */
/* ------------------------------------------------------------------ */

export type CorrectStockIntakeInput = {
  actorUserId: string | null;
  idempotencyKey: string;
  /** The complete, corrected list of lines (supplier price per piece). */
  lines: readonly StockIntakeLineInput[];
  organizationId: string;
  purchaseId: string;
  /** Total transport/labour of the purchase after the correction. */
  transportCostMinor: number;
};

export type CorrectStockIntakeResult = {
  purchase: PurchaseWithLines;
  variants: StockIntakeResultVariant[];
};

/**
 * Corrects a received intake in place, the way a wrong memo is fixed in a
 * shop: the same purchase gets the right pieces and prices. In one
 * transaction:
 * - new colours/sizes are created (with barcodes) like at intake;
 * - purchase lines are updated, added or removed and the extra cost is
 *   spread again over the pieces;
 * - stock moves by the difference only (RECEIPT for more pieces,
 *   ADJUSTMENT_OUT for fewer, both linked to the purchase);
 * - the supplier balance changes by the difference of the goods value;
 * - variant costs are replayed from their purchase receipts.
 * Sending the same lines again changes nothing, so a retry is safe.
 */
export async function correctStockIntake(
  dependencies: RecordStockIntakeDependencies,
  input: CorrectStockIntakeInput,
): Promise<CorrectStockIntakeResult> {
  const { organizationId } = input;
  const { purchases } = dependencies;
  if (!purchases.replaceLines || !purchases.listPostedLinesForVariants) {
    throw new BusinessRuleError(
      "Purchase correction is not available.",
      "PURCHASE_CORRECTION_UNAVAILABLE",
    );
  }
  const purchase = await purchases.findById(input.purchaseId, organizationId);
  if (!purchase) throw new NotFoundError("Purchase was not found.");
  if (purchase.status !== "POSTED") {
    throw new BusinessRuleError(
      "Only a received (posted) purchase can be corrected.",
      "PURCHASE_NOT_POSTED",
    );
  }
  const firstLine = purchase.lines[0];
  if (!firstLine) {
    throw new BusinessRuleError("The purchase has no lines.", "PURCHASE_EMPTY");
  }
  if (purchase.lines.some((line) => line.supplierUnitCostMinor === null)) {
    throw new BusinessRuleError(
      "This purchase was recorded without a supplier price per piece, so it cannot be corrected here.",
      "SUPPLIER_PRICE_UNKNOWN",
    );
  }

  const firstVariant = await dependencies.stockIntakes.findVariantById(
    organizationId,
    firstLine.productVariantId,
  );
  if (!firstVariant) throw new NotFoundError("Product variant was not found.");
  const asIntake: RecordStockIntakeInput = {
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    lines: input.lines,
    organizationId,
    product: { existingProductId: firstVariant.productId },
    purchase: { destinationLocationId: purchase.destinationLocationId },
    supplier: null,
    transportCostMinor: input.transportCostMinor,
  };
  const normalized = normalizeStockIntakeInput(asIntake);
  const product = await resolveProduct(dependencies, organizationId, asIntake);
  for (const line of purchase.lines) {
    const variant = await dependencies.stockIntakes.findVariantById(
      organizationId,
      line.productVariantId,
    );
    if (!variant || variant.productId !== product.id) {
      throw new BusinessRuleError(
        "This purchase has more than one product; correct it from the purchase page.",
        "PURCHASE_MULTIPLE_PRODUCTS",
      );
    }
  }

  const transport = distributeTransportCost(
    normalized.lines.map((line) => ({
      quantity: line.quantity,
      unitCostMinor: line.unitCostMinor,
    })),
    normalized.transportCostMinor,
  );
  const resolved = await resolveLines(
    dependencies,
    organizationId,
    product,
    normalized.lines,
    transport.unitCosts,
  );
  const barcodes = await ensureBarcodes(dependencies, organizationId, resolved);

  const before = new Map(
    purchase.lines.map((line) => [line.productVariantId, line]),
  );
  const after = new Map(resolved.map((line) => [line.variant.id, line]));
  const added = resolved
    .map((line) => ({
      line,
      quantity: line.quantity - (before.get(line.variant.id)?.quantity ?? 0),
    }))
    .filter((item) => item.quantity > 0);
  const removed = purchase.lines
    .map((line) => ({
      line,
      quantity:
        line.quantity - (after.get(line.productVariantId)?.quantity ?? 0),
    }))
    .filter((item) => item.quantity > 0);

  const goodsBefore = purchase.lines.reduce(
    (sum, line) =>
      sum + BigInt(line.quantity) * BigInt(line.supplierUnitCostMinor ?? 0),
    0n,
  );
  const goodsAfter = resolved.reduce(
    (sum, line) =>
      sum + BigInt(line.quantity) * BigInt(line.supplierUnitCostMinor),
    0n,
  );
  const unitCostChanged = resolved.some(
    (line) => before.get(line.variant.id)?.unitCostMinor !== line.unitCostMinor,
  );
  if (
    added.length === 0 &&
    removed.length === 0 &&
    !unitCostChanged &&
    goodsAfter === goodsBefore
  ) {
    return { purchase, variants: correctionVariants(resolved, barcodes) };
  }

  await purchases.replaceLines({
    lines: resolved.map((line) => ({
      extraCostPerUnitMinor: line.unitCostMinor - line.supplierUnitCostMinor,
      id: before.get(line.variant.id)?.id ?? null,
      productName: product.name,
      productVariantId: line.variant.id,
      quantity: line.quantity,
      sku: line.variant.sku,
      supplierUnitCostMinor: line.supplierUnitCostMinor,
      totalCostMinor: BigInt(line.quantity) * BigInt(line.unitCostMinor),
      unitCostMinor: line.unitCostMinor,
      variantName: `${line.color.name} / ${line.size.name}`,
    })),
    organizationId,
    purchaseId: purchase.id,
  });
  await purchases.update({
    id: purchase.id,
    organizationId,
    totalCostMinor: resolved.reduce(
      (sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitCostMinor),
      0n,
    ),
  });

  const keySuffix = normalized.idempotencyKey;
  const reference = `Correction of purchase ${purchase.purchaseNumber}`;
  const shortKey = keySuffix
    .replace(/[^a-z0-9]/giu, "")
    .slice(-8)
    .toUpperCase();
  // Fewer pieces first: fails early if they were already sold.
  if (removed.length) {
    const out = await createInventoryMovement(dependencies.inventoryMovements, {
      idempotencyKey: `purchase-correction:${keySuffix}:out`,
      lines: removed.map((item) => ({
        note: reference,
        productVariantId: item.line.productVariantId,
        quantity: item.quantity,
      })),
      movementNumber: `COR-${purchase.purchaseNumber}-${shortKey}-OUT`,
      note: reference,
      occurredAt: new Date(),
      organizationId,
      referenceId: purchase.id,
      referenceType: "PURCHASE",
      sourceLocationId: purchase.destinationLocationId,
      type: "ADJUSTMENT_OUT",
    });
    await postInventoryMovement(dependencies.inventoryMovements, {
      movementId: out.id,
      organizationId,
    });
  }
  if (added.length) {
    const draft = await createInventoryMovement(
      dependencies.inventoryMovements,
      {
        destinationLocationId: purchase.destinationLocationId,
        idempotencyKey: `purchase-correction:${keySuffix}:in`,
        lines: added.map((item) => ({
          note: reference,
          productVariantId: item.line.variant.id,
          quantity: item.quantity,
        })),
        movementNumber: `COR-${purchase.purchaseNumber}-${shortKey}-IN`,
        note: reference,
        occurredAt: new Date(),
        organizationId,
        referenceId: purchase.id,
        referenceType: "PURCHASE",
        type: "RECEIPT",
      },
    );
    const posted = await postInventoryMovement(
      dependencies.inventoryMovements,
      { movementId: draft.id, organizationId },
    );
    // The added pieces are a receipt of this purchase, like at intake.
    for (const item of added) {
      const variantId = item.line.variant.id;
      const onHand = await dependencies.costs.getVariantOnHandQuantity(
        organizationId,
        variantId,
      );
      const state = await dependencies.costs.getCostState(
        organizationId,
        variantId,
      );
      const derived = deriveCostStateAfterReceipt({
        costState: state,
        existingOnHandQuantity: Math.max(0, onHand - item.quantity),
        receivedQuantity: item.quantity,
        unitCostMinor: item.line.unitCostMinor,
      });
      await dependencies.costs.recordCostEntry({
        afterAverageCostMinor: derived.afterAverageCostMinor,
        afterQuantity: derived.afterQuantity,
        afterValueMinor: derived.afterValueMinor,
        beforeAverageCostMinor: derived.beforeAverageCostMinor,
        beforeQuantity: derived.beforeQuantity,
        beforeValueMinor: derived.beforeValueMinor,
        eventType: "PURCHASE_RECEIPT",
        organizationId,
        productVariantId: variantId,
        quantityChange: item.quantity,
        reference: purchase.purchaseNumber,
        sourceMovementId: posted.id,
        sourcePurchaseId: purchase.id,
        valueChangeMinor: derived.valueChangeMinor,
      });
      await dependencies.costs.upsertCostState({
        averageCostMinor: derived.afterAverageCostMinor,
        costUnknownReason: derived.costUnknownReason,
        expectedVersion: state?.version,
        inventoryValueMinor: derived.afterValueMinor,
        isCostKnown: derived.isCostKnown,
        lastCostEventAt: new Date(),
        organizationId,
        productVariantId: variantId,
      });
    }
  }

  // Prices or the extra share may have changed: replay the purchase's variants.
  await replayPurchaseCosts(
    { costs: dependencies.costs, purchases },
    {
      correctedAt: new Date(),
      organizationId,
      purchase,
      variantIds: [...new Set([...before.keys(), ...after.keys()])],
    },
  );

  const goodsDelta = goodsAfter - goodsBefore;
  if (goodsDelta !== 0n) {
    await recordSupplierAdjustment(
      {
        supplierLedgerRepository: dependencies.supplierLedger,
        supplierRepository: dependencies.suppliers,
      },
      {
        amountMinor: goodsDelta > 0n ? goodsDelta : -goodsDelta,
        // CREDIT: more is owed to the supplier; DEBIT: less.
        direction: goodsDelta > 0n ? "CREDIT" : "DEBIT",
        entryType: "ADJUSTMENT",
        notes: reference,
        organizationId,
        purchaseId: purchase.id,
        referenceId: purchase.id,
        supplierId: purchase.supplierId,
      },
    );
  }

  await dependencies.auditWriter.recordWithinTransaction({
    action: "STOCK_INTAKE_CORRECTED",
    actor: { userId: input.actorUserId },
    metadata: {
      addedPieces: added.reduce((sum, item) => sum + item.quantity, 0),
      goodsDeltaMinor: goodsDelta.toString(),
      lineCount: resolved.length,
      productId: product.id,
      removedPieces: removed.reduce((sum, item) => sum + item.quantity, 0),
      transportAppliedMinor: transport.appliedMinor,
    },
    organizationId,
    resource: "PURCHASE",
    resourceId: purchase.id,
  });

  const updated = await purchases.findById(purchase.id, organizationId);
  return {
    purchase: updated ?? purchase,
    variants: correctionVariants(resolved, barcodes),
  };
}

function correctionVariants(
  lines: readonly ResolvedLine[],
  barcodes: readonly VariantBarcode[],
): StockIntakeResultVariant[] {
  return lines.map((line, index) => ({
    barcode: barcodes[index]?.value ?? null,
    color: line.color.name,
    id: line.variant.id,
    quantity: line.quantity,
    sellingPriceMinor: line.sellingPriceMinor,
    size: line.size.name,
    sku: line.variant.sku,
    unitCostMinor: line.unitCostMinor,
  }));
}

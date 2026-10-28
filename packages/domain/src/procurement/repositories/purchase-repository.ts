import type {
  Purchase,
  PurchaseStatus,
  PurchaseWithLines,
} from "../domain/models.js";

export type CreatePurchaseLineRecord = {
  lineNumber: number;
  notes?: string | null;
  productName: string;
  productVariantId: string;
  quantity: number;
  sku: string;
  totalCostMinor: bigint;
  unitCostMinor: number;
  /** Supplier price per piece before extra charges. */
  supplierUnitCostMinor?: number | null;
  /** Extra charges per piece; supplier + extra = unitCostMinor. */
  extraCostPerUnitMinor?: number | null;
  variantName?: string | null;
};

export type CreatePurchaseRecord = {
  destinationLocationId: string;
  expectedDeliveryDate?: Date | null;
  idempotencyKey?: string | null;
  lines?: CreatePurchaseLineRecord[];
  notes?: string | null;
  organizationId: string;
  purchaseDate: Date;
  purchaseNumber: string;
  receiptMovementId?: string | null;
  status?: PurchaseStatus;
  supplierId: string;
  totalCostMinor: bigint;
};

export type UpdatePurchaseRecord = {
  expectedDeliveryDate?: Date | null;
  id: string;
  notes?: string | null;
  organizationId: string;
  receiptMovementId?: string | null;
  status?: PurchaseStatus;
  totalCostMinor?: bigint;
};

export type PurchaseListFilter = {
  destinationLocationId?: string;
  limit?: number;
  offset?: number;
  organizationId: string;
  status?: PurchaseStatus;
  supplierId?: string;
};

export type PurchaseRepository = {
  create(record: CreatePurchaseRecord): Promise<PurchaseWithLines>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseWithLines | null>;
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<PurchaseWithLines | null>;
  findByPurchaseNumber(
    organizationId: string,
    purchaseNumber: string,
  ): Promise<PurchaseWithLines | null>;
  list(filter: PurchaseListFilter): Promise<Purchase[]>;
  update(record: UpdatePurchaseRecord): Promise<Purchase | null>;
  /** Records the cash memo photo; returns the replaced key, or null if no purchase. */
  setMemo?(input: {
    contentType: string;
    organizationId: string;
    purchaseId: string;
    storageKey: string;
    uploadedAt: Date;
  }): Promise<{ previousStorageKey: string | null } | null>;
  findMemo?(
    organizationId: string,
    purchaseId: string,
  ): Promise<PurchaseMemo | null>;
  /** The latest purchase price of each variant of a product (not cancelled). */
  lastCostsForProduct?(
    organizationId: string,
    productId: string,
  ): Promise<VariantLastPurchaseCost[]>;
  /** Sets corrected per-piece costs on lines of one purchase. */
  updateLineCosts?(input: {
    lines: ReadonlyArray<{
      extraCostPerUnitMinor: number;
      id: string;
      totalCostMinor: bigint;
      unitCostMinor: number;
    }>;
    organizationId: string;
    purchaseId: string;
  }): Promise<void>;
  /**
   * Corrects a purchase's lines: lines with an `id` are updated, lines
   * without one are added (next line numbers), and lines not listed are
   * removed.
   */
  replaceLines?(input: {
    lines: ReadonlyArray<
      Omit<CreatePurchaseLineRecord, "lineNumber"> & { id: string | null }
    >;
    organizationId: string;
    purchaseId: string;
  }): Promise<void>;
  /** Lines of posted purchases for these variants (for cost replay). */
  listPostedLinesForVariants?(
    organizationId: string,
    productVariantIds: readonly string[],
  ): Promise<
    Array<{
      productVariantId: string;
      purchaseId: string;
      quantity: number;
      unitCostMinor: number;
    }>
  >;
};

export type PurchaseMemo = {
  contentType: string;
  storageKey: string;
  uploadedAt: Date;
};

export type VariantLastPurchaseCost = {
  extraCostPerUnitMinor: number | null;
  productVariantId: string;
  purchaseDate: Date;
  purchaseId: string;
  purchaseNumber: string;
  supplierUnitCostMinor: number | null;
  unitCostMinor: number;
};

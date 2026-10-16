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
};

import type {
  InventoryMovementStatus,
  InventoryMovementType,
} from "../domain/models.js";
import type {
  BranchStatus,
  StockLocationStatus,
  StockLocationType,
} from "../../organization/domain/models.js";

export type InventoryVariantReadItem = {
  color: string;
  id: string;
  productId: string;
  productName: string;
  size: string;
  sku: string;
};

export type InventoryLocationReadItem = {
  id: string;
  name: string;
};

export type InventoryAvailabilityReadItem = {
  availableToSell: number;
  location: InventoryLocationReadItem;
  onHand: number;
  reserved: number;
  variant: InventoryVariantReadItem;
};

export type StockLocationReadItem = {
  branch: {
    id: string;
    name: string;
    status: BranchStatus;
  };
  id: string;
  isSellable: boolean;
  name: string;
  status: StockLocationStatus;
  type: StockLocationType;
};

export type InventoryMovementHistoryItem = {
  destinationLocation: InventoryLocationReadItem | null;
  id: string;
  occurredAt: Date;
  quantity: number;
  sourceLocation: InventoryLocationReadItem | null;
  status: InventoryMovementStatus;
  type: InventoryMovementType;
  variant: InventoryVariantReadItem;
};

export type VariantInventoryAvailability = {
  locations: Array<{
    availableToSell: number;
    location: InventoryLocationReadItem;
    onHand: number;
    reserved: number;
  }>;
  variant: InventoryVariantReadItem;
};

export type InventoryReadPage<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type InventoryReadPageFilter = {
  cursor?: string;
  organizationId: string;
  pageSize: number;
};

export type InventoryReadRepository = {
  listProductSummaries(
    filter: InventoryReadPageFilter & {
      locationId?: string;
      search?: string;
      lowStockThreshold?: number;
    },
  ): Promise<InventoryReadPage<ProductInventorySummary>>;
  getVariantAvailability(input: {
    organizationId: string;
    variantId: string;
  }): Promise<VariantInventoryAvailability | null>;
  listAvailability(
    filter: InventoryReadPageFilter & {
      locationId?: string;
      search?: string;
    },
  ): Promise<InventoryReadPage<InventoryAvailabilityReadItem>>;
  listLocations(
    filter: InventoryReadPageFilter,
  ): Promise<InventoryReadPage<StockLocationReadItem>>;
  listMovements(
    filter: InventoryReadPageFilter & {
      locationId?: string;
      status?: InventoryMovementStatus;
      type?: InventoryMovementType;
    },
  ): Promise<InventoryReadPage<InventoryMovementHistoryItem>>;
};

export type InventoryQuantitySummary = {
  onHand: number;
  reserved: number;
  availableToSell: number;
};

export type ProductInventorySummary = InventoryQuantitySummary & {
  product: { id: string; name: string; productCode: string };
  lowStockThreshold: number | null;
  isLowStock: boolean | null;
  variants: Array<
    InventoryQuantitySummary & {
      variant: InventoryVariantReadItem;
      locations: Array<
        InventoryQuantitySummary & { location: InventoryLocationReadItem }
      >;
    }
  >;
  locations: Array<
    InventoryQuantitySummary & { location: InventoryLocationReadItem }
  >;
};

import type {
  InventoryMovement,
  InventoryMovementLine,
  InventoryMovementStatus,
  InventoryMovementType,
  OnHandBalance,
} from "../domain/models.js";

export type CursorPageRequest = {
  cursor?: string;
  pageSize?: number;
};

export type CursorPageResult<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type InventoryMovementLineInput = {
  note: string | null;
  productVariantId: string;
  quantity: number;
};

export type CreateInventoryMovementRecord = {
  destinationLocationId: string | null;
  idempotencyKey: string;
  lines: InventoryMovementLineInput[];
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  sourceLocationId: string | null;
  type: InventoryMovementType;
};

export type ReplaceInventoryMovementLinesRecord = {
  lines: InventoryMovementLineInput[];
  movementId: string;
  organizationId: string;
};

export type InventoryMovementListFilter = {
  cursor?: string;
  destinationLocationId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  organizationId: string;
  pageSize: number;
  sourceLocationId?: string;
  status?: InventoryMovementStatus;
  type?: InventoryMovementType;
};

export type InventoryBalanceFilter = {
  cursor?: string;
  locationId: string;
  onlyPositive?: boolean;
  organizationId: string;
  pageSize: number;
  productVariantId?: string;
};

export type InventoryMovementRepository = {
  createDraft(
    record: CreateInventoryMovementRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryMovement | null>;
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryMovement | null>;
  getPayloadSignature(
    movementId: string,
    organizationId: string,
  ): Promise<string | null>;
  list(
    filter: InventoryMovementListFilter,
  ): Promise<CursorPageResult<InventoryMovement>>;
  post(record: {
    movementId: string;
    organizationId: string;
  }): Promise<InventoryMovement>;
  replaceDraftLines(
    record: ReplaceInventoryMovementLinesRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement>;
};

export type InventoryBalanceQueryRepository = {
  getOnHand(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<OnHandBalance>;
  listByLocation(
    filter: InventoryBalanceFilter,
  ): Promise<CursorPageResult<OnHandBalance>>;
};

export type InventoryMovementLineDraft = Pick<
  InventoryMovementLine,
  "note" | "productVariantId" | "quantity"
>;

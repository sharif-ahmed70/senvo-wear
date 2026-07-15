import type {
  InventoryMovement,
  InventoryMovementLine,
  InventoryMovementStatus,
  InventoryMovementType,
  InventoryAllocationLine,
  InventoryAllocationPolicy,
  InventoryAllocationPolicyLocation,
  InventoryAllocationPolicyStatus,
  InventoryAllocationPreview,
  InventoryAllocationStrategy,
  InventoryAvailability,
  InventoryReservation,
  InventoryReservationStatus,
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

export type ReverseInventoryMovementRecord = {
  idempotencyKey: string;
  lines: InventoryMovementLineInput[];
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  reversalReason: string;
  reversesMovementId: string;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
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
  isReversal?: boolean;
  isReversed?: boolean;
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

export type InventoryReservationLineInput = {
  productVariantId: string;
  quantity: number;
};

export type CreateInventoryReservationRecord = {
  expiresAt: Date | null;
  idempotencyKey: string;
  lines: InventoryReservationLineInput[];
  note: string | null;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  reservationNumber: string;
  stockLocationId: string;
};

export type ChangeInventoryReservationStatusRecord = {
  expectedVersion: number;
  organizationId: string;
  reservationId: string;
  status: Exclude<InventoryReservationStatus, "ACTIVE">;
};

export type ConsumeInventoryReservationRecord = {
  expectedReservationVersion: number;
  idempotencyKey: string;
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  referenceId: string | null;
  referenceType: string | null;
  reservationId: string;
};

export type ConsumeInventoryReservationResult = {
  movement: InventoryMovement;
  reservation: InventoryReservation;
};

export type InventoryReservationListFilter = {
  cursor?: string;
  expiresBefore?: Date;
  organizationId: string;
  pageSize: number;
  productVariantId?: string;
  referenceId?: string;
  referenceType?: string;
  status?: InventoryReservationStatus;
  stockLocationId?: string;
};

export type InventoryAllocationPolicyLocationInput = {
  isEnabled: boolean;
  priority: number;
  stockLocationId: string;
};

export type CreateInventoryAllocationPolicyRecord = {
  code: string;
  name: string;
  organizationId: string;
  requireSellableLocation: boolean;
  strategy: InventoryAllocationStrategy;
};

export type InventoryAllocationPolicyMetadataPatch = {
  name: string;
  requireSellableLocation?: boolean;
};

export type ReplaceInventoryAllocationPolicyLocationsRecord = {
  expectedVersion: number;
  locations: InventoryAllocationPolicyLocationInput[];
  organizationId: string;
  policyId: string;
};

export type ChangeInventoryAllocationPolicyStatusRecord = {
  expectedVersion: number;
  organizationId: string;
  policyId: string;
  status: Exclude<InventoryAllocationPolicyStatus, "ACTIVE"> | "ACTIVE";
};

export type UpdateInventoryAllocationPolicyMetadataRecord = {
  expectedVersion: number;
  metadata: InventoryAllocationPolicyMetadataPatch;
  organizationId: string;
  policyId: string;
};

export type InventoryAllocationPolicyListFilter = {
  cursor?: string;
  organizationId: string;
  pageSize: number;
  search?: string;
  status?: InventoryAllocationPolicyStatus;
};

export type PreviewInventoryAllocationRecord = {
  lines: InventoryAllocationLine[];
  organizationId: string;
  policyId: string;
  preferredBranchId: string | null;
  preferredLocationId: string | null;
};

export type AllocateInventoryReservationRecord =
  PreviewInventoryAllocationRecord & {
    expiresAt: Date | null;
    idempotencyKey: string;
    note: string | null;
    referenceId: string | null;
    referenceType: string | null;
    reservationNumber: string;
  };

export type AllocateInventoryReservationResult = {
  reservation: InventoryReservation;
  selectedBranchId: string;
  selectedStockLocationId: string;
};

export type InventoryAvailabilityFilter = {
  cursor?: string;
  onlyAvailable?: boolean;
  organizationId: string;
  pageSize: number;
  productVariantId?: string;
  stockLocationId: string;
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
  reversePostedMovement(
    record: ReverseInventoryMovementRecord,
    payloadSignature: string,
  ): Promise<InventoryMovement>;
};

export type InventoryMovementPostingRepository = Pick<
  InventoryMovementRepository,
  "findById" | "post"
>;

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

export type InventoryReservationRepository = {
  changeStatus(
    record: ChangeInventoryReservationStatusRecord,
  ): Promise<InventoryReservation>;
  createActive(
    record: CreateInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<InventoryReservation>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryReservation | null>;
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<InventoryReservation | null>;
  getPayloadSignature(
    reservationId: string,
    organizationId: string,
  ): Promise<string | null>;
  list(
    filter: InventoryReservationListFilter,
  ): Promise<CursorPageResult<InventoryReservation>>;
  sumActiveReserved(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<number>;
};

export type InventoryReservationConsumptionRepository = {
  consume(
    record: ConsumeInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<ConsumeInventoryReservationResult>;
};

export type InventoryAllocationPolicyRepository = {
  changeStatus(
    record: ChangeInventoryAllocationPolicyStatusRecord,
  ): Promise<InventoryAllocationPolicy>;
  create(
    record: CreateInventoryAllocationPolicyRecord,
  ): Promise<InventoryAllocationPolicy>;
  findByCode(
    organizationId: string,
    code: string,
  ): Promise<InventoryAllocationPolicy | null>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryAllocationPolicy | null>;
  list(
    filter: InventoryAllocationPolicyListFilter,
  ): Promise<CursorPageResult<InventoryAllocationPolicy>>;
  replaceLocations(
    record: ReplaceInventoryAllocationPolicyLocationsRecord,
  ): Promise<InventoryAllocationPolicy>;
  updateMetadata(
    record: UpdateInventoryAllocationPolicyMetadataRecord,
  ): Promise<InventoryAllocationPolicy>;
};

export type InventoryAllocationQueryRepository = {
  allocateAndReserve(
    record: AllocateInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<AllocateInventoryReservationResult>;
  preview(
    record: PreviewInventoryAllocationRecord,
  ): Promise<InventoryAllocationPreview>;
};

export type InventoryAvailabilityQueryRepository = {
  getAvailability(input: {
    organizationId: string;
    productVariantId: string;
    stockLocationId: string;
  }): Promise<InventoryAvailability>;
  listByLocation(
    filter: InventoryAvailabilityFilter,
  ): Promise<CursorPageResult<InventoryAvailability>>;
};

export type InventoryMovementLineDraft = Pick<
  InventoryMovementLine,
  "note" | "productVariantId" | "quantity"
>;

export type InventoryAllocationPolicyLocationDraft = Pick<
  InventoryAllocationPolicyLocation,
  "isEnabled" | "priority" | "stockLocationId"
>;

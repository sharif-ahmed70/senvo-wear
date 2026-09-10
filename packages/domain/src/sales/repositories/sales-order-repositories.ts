import type {
  SalesBooth,
  SalesBoothStatus,
  SalesChannel,
  SalesOrder,
  SalesOrderChannel,
  SalesOrderStatus,
} from "../domain/models.js";
import type { LegacyReservationExclusionReason } from "../application/reservation-expiry-use-cases.js";

export type CursorPageRequest = {
  cursor?: string;
  pageSize?: number;
};

export type CursorPageResult<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
};

export type CreateSalesOrderLineRecord = {
  discountMinor: number;
  lineTotalMinor: number;
  productVariantId: string;
  quantity: number;
  unitPriceMinor: number;
};

export type ReplaceSalesOrderLineRecord = CreateSalesOrderLineRecord;

export type DraftSalesOrderMetadataChanges = {
  allocationPolicyId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddressLine1?: string | null;
  deliveryAddressLine2?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  deliveryMinor?: number;
  deliveryPostalCode?: string | null;
  discountMinor?: number;
  note?: string | null;
};

export type AmendDraftSalesOrderRecord = {
  expectedVersion: number;
  lines?: ReplaceSalesOrderLineRecord[];
  metadata?: DraftSalesOrderMetadataChanges;
  organizationId: string;
  salesOrderId: string;
};

export type CreateDraftSalesOrderRecord = {
  allocationPolicyId: string | null;
  boothId: string | null;
  channel: SalesOrderChannel;
  currencyCode: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryMinor: number;
  deliveryPostalCode: string | null;
  discountMinor: number;
  idempotencyKey: string;
  lines: CreateSalesOrderLineRecord[];
  note: string | null;
  orderNumber: string;
  organizationId: string;
  subtotalMinor: number;
  totalMinor: number;
};

export type SalesChannelPerformance = {
  orderCount: number;
  salesChannel: SalesChannel;
  totalMinor: number;
};

export type SalesBoothPerformance = {
  booth: SalesBooth;
  orderCount: number;
  totalMinor: number;
};

export type SalesSourceSummary = {
  booths: SalesBoothPerformance[];
  channels: SalesChannelPerformance[];
  legacyOrderCount: number;
};

export type CreateSalesBoothRecord = {
  endDate: Date;
  location: string;
  name: string;
  organizationId: string;
  responsibleStaffId: string;
  startDate: Date;
};

export type SalesSourceRepository = {
  createBooth(record: CreateSalesBoothRecord): Promise<SalesBooth>;
  findBoothById(id: string, organizationId: string): Promise<SalesBooth | null>;
  getSummary(organizationId: string): Promise<SalesSourceSummary>;
  listBooths(organizationId: string): Promise<SalesBooth[]>;
  updateBoothStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: SalesBoothStatus;
  }): Promise<SalesBooth | null>;
};

export type ReserveSalesOrderRecord = {
  expectedVersion: number;
  expiresAt: Date | null;
  organizationId: string;
  preferredBranchId: string | null;
  preferredLocationId: string | null;
  reservationIdempotencyKey: string;
  reservationNumber: string;
  salesOrderId: string;
};

export type ConfirmSalesOrderRecord = {
  expectedVersion: number;
  organizationId: string;
  salesOrderId: string;
};

export type CancelSalesOrderRecord = ConfirmSalesOrderRecord;

export type FulfillSalesOrderRecord = {
  consumptionIdempotencyKey: string;
  expectedVersion: number;
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  salesOrderId: string;
};

export type SalesOrderListFilter = {
  channel?: SalesOrderChannel;
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: string;
  customerPhone?: string;
  organizationId: string;
  pageSize: number;
  status?: SalesOrderStatus;
};

export type FindDueStorefrontReservationOrderIdsFilter = {
  cutoff: Date;
  limit: number;
  organizationId: string;
};

export type ReclaimExpiredStorefrontReservationRecord = {
  applicationTime?: Date;
  cutoff: Date;
  organizationId: string;
  salesOrderId: string;
};

export type ReclaimExpiredStorefrontReservationResult = {
  expiresAt: Date | null;
  orderId: string;
  orderNumber?: string;
  reclaimed: boolean;
  reservationId?: string;
  reservationNumber?: string;
};

export type FindLegacyNullExpiryCandidatesFilter = {
  cursor?: {
    createdAt: Date;
    id: string;
  };
  limit: number;
  organizationId: string;
};

export type LegacyNullExpiryCandidateRecord = {
  cancelledAt?: Date | null;
  channel?: string | null;
  confirmedAt?: Date | null;
  createdAt: Date;
  fulfilledAt?: Date | null;
  fulfillmentMovementId?: string | null;
  hasOnlinePaymentAttempts?: boolean;
  hasPaymentBatches?: boolean;
  id: string;
  inventoryReservationId: string;
  orderNumber: string;
  paymentPreference: string | null;
  reservationConfirmedAt?: Date | null;
  reservationExpiredAt?: Date | null;
  reservationNumber: string;
  reservationReferenceId?: string | null;
  reservationReferenceType?: string | null;
  reservationReleasedAt?: Date | null;
  reservationVersion: number;
  reservedAt: Date | null;
};

export type NormalizeLegacyStorefrontReservationRecord = {
  applicationTime?: Date;
  cutoff: Date;
  expectedReservationId?: string;
  expectedReservationNumber?: string;
  expectedReservationVersion?: number;
  organizationId: string;
  salesOrderId: string;
};

export type NormalizeLegacyStorefrontReservationStatus =
  | "NORMALIZED_STILL_VALID"
  | "NORMALIZED_AND_RECLAIMED"
  | "SKIPPED"
  | "DEFERRED";

export type NormalizeLegacyStorefrontReservationResult = {
  calculatedExpiresAt?: Date;
  orderId: string;
  orderNumber?: string;
  paymentPreference?: string;
  previousExpiresAt: null;
  reclaimed: boolean;
  reservationId?: string;
  reservationNumber?: string;
  reservationVersionAfter?: number;
  reservationVersionBefore?: number;
  reservedAt?: Date;
  skipOrDeferReason?: LegacyReservationExclusionReason;
  status: NormalizeLegacyStorefrontReservationStatus;
};

export type SalesOrderRepository = {
  amendDraft(record: AmendDraftSalesOrderRecord): Promise<SalesOrder>;
  cancel(record: CancelSalesOrderRecord): Promise<SalesOrder>;
  confirm(record: ConfirmSalesOrderRecord): Promise<SalesOrder>;
  createDraft(
    record: CreateDraftSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder>;
  findById(id: string, organizationId: string): Promise<SalesOrder | null>;
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SalesOrder | null>;
  findByOrderNumber(
    organizationId: string,
    orderNumber: string,
  ): Promise<SalesOrder | null>;
  findDueStorefrontReservationOrderIds(
    filter: FindDueStorefrontReservationOrderIdsFilter,
  ): Promise<string[]>;
  findLegacyNullExpiryCandidates(
    filter: FindLegacyNullExpiryCandidatesFilter,
  ): Promise<LegacyNullExpiryCandidateRecord[]>;
  fulfill(
    record: FulfillSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder>;
  list(filter: SalesOrderListFilter): Promise<CursorPageResult<SalesOrder>>;
  normalizeLegacyStorefrontReservation(
    record: NormalizeLegacyStorefrontReservationRecord,
  ): Promise<NormalizeLegacyStorefrontReservationResult>;
  reclaimExpiredStorefrontReservation(
    record: ReclaimExpiredStorefrontReservationRecord,
  ): Promise<ReclaimExpiredStorefrontReservationResult>;
  reserve(
    record: ReserveSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder>;
};

export type SalesOrderCreationRepository = Pick<
  SalesOrderRepository,
  "createDraft" | "findByIdempotencyKey"
>;

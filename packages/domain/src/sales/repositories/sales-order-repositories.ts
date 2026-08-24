import type {
  SalesBooth,
  SalesBoothStatus,
  SalesChannel,
  SalesOrder,
  SalesOrderChannel,
  SalesOrderStatus,
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
  customerId: string | null;
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
  fulfill(
    record: FulfillSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder>;
  list(filter: SalesOrderListFilter): Promise<CursorPageResult<SalesOrder>>;
  reserve(
    record: ReserveSalesOrderRecord,
    payloadSignature: string,
  ): Promise<SalesOrder>;
};

export type SalesOrderCreationRepository = Pick<
  SalesOrderRepository,
  "createDraft" | "findByIdempotencyKey"
>;

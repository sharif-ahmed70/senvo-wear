import type {
  SupplierBalanceSummary,
  SupplierLedgerDirection,
  SupplierLedgerEntry,
  SupplierLedgerEntryType,
  SupplierPayment,
  SupplierPaymentMethod,
} from "../domain/models.js";

export type CreateSupplierPaymentRecord = {
  amountMinor: bigint;
  idempotencyKey?: string | null;
  notes?: string | null;
  organizationId: string;
  paymentDate: Date;
  paymentMethod: SupplierPaymentMethod;
  purchaseId?: string | null;
  reference?: string | null;
  supplierId: string;
};

export type SupplierPaymentListFilter = {
  from?: Date;
  limit?: number;
  offset?: number;
  organizationId: string;
  purchaseId?: string;
  supplierId?: string;
  to?: Date;
};

export type SupplierPaymentRepository = {
  findByIdempotencyKey?(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<SupplierPayment | null>;
  getPaymentById(
    id: string,
    organizationId: string,
  ): Promise<SupplierPayment | null>;
  listPayments(filter: SupplierPaymentListFilter): Promise<SupplierPayment[]>;
  recordPayment(record: CreateSupplierPaymentRecord): Promise<SupplierPayment>;
};

export type CreateSupplierLedgerEntryRecord = {
  amountMinor: bigint;
  balanceAfterMinor: bigint;
  direction: SupplierLedgerDirection;
  entryDate: Date;
  entryType: SupplierLedgerEntryType;
  notes?: string | null;
  organizationId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  supplierId: string;
};

export type SupplierLedgerListFilter = {
  entryType?: SupplierLedgerEntryType;
  from?: Date;
  limit?: number;
  offset?: number;
  organizationId: string;
  supplierId: string;
  to?: Date;
};

export type SupplierLedgerRepository = {
  getSupplierBalance(
    supplierId: string,
    organizationId: string,
  ): Promise<SupplierBalanceSummary>;
  listLedgerEntries(
    filter: SupplierLedgerListFilter,
  ): Promise<SupplierLedgerEntry[]>;
  recordLedgerEntry(
    record: CreateSupplierLedgerEntryRecord,
  ): Promise<SupplierLedgerEntry>;
};

export type AuditAction =
  | "INVENTORY_MOVEMENT_POSTED"
  | "POS_CHECKOUT_COMPLETED"
  | "POS_PAYMENT_RECORDED"
  | "SALES_RECEIPT_ISSUED"
  | "SALES_ORDER_CREATED";

export type AuditResource =
  | "INVENTORY_MOVEMENT"
  | "PAYMENT"
  | "POS_CHECKOUT"
  | "SALES_ORDER"
  | "SALES_RECEIPT";

export type AuditJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly AuditJsonValue[]
  | { readonly [key: string]: AuditJsonValue };

export type AuditMetadata = Readonly<Record<string, AuditJsonValue>>;

export type AuditActor = {
  userId: string | null;
};

export type AuditEntry = {
  action: AuditAction;
  createdAt: Date;
  id: string;
  metadata: AuditMetadata;
  organizationId: string;
  resource: AuditResource;
  resourceId: string;
  userId: string | null;
};

export type RecordAuditEntryInput = {
  action: AuditAction;
  actor: AuditActor;
  metadata?: AuditMetadata;
  organizationId: string;
  resource: AuditResource;
  resourceId: string;
};

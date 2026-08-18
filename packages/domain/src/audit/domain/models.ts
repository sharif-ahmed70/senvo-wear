export type AuditAction =
  | "INVENTORY_MOVEMENT_POSTED"
  | "POS_CHECKOUT_COMPLETED"
  | "POS_PAYMENT_RECORDED"
  | "POS_OUTSTANDING_PAYMENT_COLLECTED"
  | "ONLINE_PAYMENT_CONFIRMED"
  | "ONLINE_PAYMENT_REFUND_CONFIRMED"
  | "ONLINE_PAYMENT_RECONCILED"
  | "POS_REFUND_ISSUED"
  | "POS_SALE_RETURN_RECORDED"
  | "SALES_RECEIPT_ISSUED"
  | "SALES_ORDER_CREATED"
  | "STOREFRONT_ORDER_PLACED";

export type AuditResource =
  | "INVENTORY_MOVEMENT"
  | "PAYMENT"
  | "PAYMENT_COLLECTION"
  | "PAYMENT_REFUND"
  | "ONLINE_PAYMENT_ATTEMPT"
  | "PROVIDER_REFUND"
  | "POS_CHECKOUT"
  | "POS_RETURN"
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

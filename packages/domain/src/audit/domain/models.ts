export type AuditAction = "INVENTORY_MOVEMENT_POSTED" | "SALES_ORDER_CREATED";

export type AuditResource = "INVENTORY_MOVEMENT" | "SALES_ORDER";

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

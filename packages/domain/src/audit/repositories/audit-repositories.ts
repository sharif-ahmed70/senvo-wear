import type {
  AuditAction,
  AuditEntry,
  AuditMetadata,
  AuditResource,
} from "../domain/models.js";

export type CreateAuditEntryRecord = {
  action: AuditAction;
  metadata: AuditMetadata;
  organizationId: string;
  resource: AuditResource;
  resourceId: string;
  userId: string | null;
};

export type AuditEntryRepository = {
  create(record: CreateAuditEntryRecord): Promise<AuditEntry>;
  findById(id: string, organizationId: string): Promise<AuditEntry | null>;
};

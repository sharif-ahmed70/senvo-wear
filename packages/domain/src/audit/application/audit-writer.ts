import type { AuditEntry, RecordAuditEntryInput } from "../domain/models.js";
import {
  assertAuditId,
  normalizeAuditAction,
  normalizeAuditMetadata,
  normalizeAuditResource,
} from "../domain/value-objects.js";
import type { AuditEntryRepository } from "../repositories/audit-repositories.js";

export type AuditWriter = {
  record(input: RecordAuditEntryInput): Promise<AuditEntry>;
  recordWithinTransaction(input: RecordAuditEntryInput): Promise<AuditEntry>;
};

export class RepositoryAuditWriter implements AuditWriter {
  constructor(private readonly repository: AuditEntryRepository) {}

  async record(input: RecordAuditEntryInput): Promise<AuditEntry> {
    return this.recordWithinTransaction(input);
  }

  async recordWithinTransaction(
    input: RecordAuditEntryInput,
  ): Promise<AuditEntry> {
    return this.repository.create({
      action: normalizeAuditAction(input.action),
      metadata: normalizeAuditMetadata(input.metadata),
      organizationId: assertAuditId(input.organizationId, "organizationId"),
      resource: normalizeAuditResource(input.resource),
      resourceId: assertAuditId(input.resourceId, "resourceId"),
      userId: input.actor.userId
        ? assertAuditId(input.actor.userId, "actor.userId")
        : null,
    });
  }
}

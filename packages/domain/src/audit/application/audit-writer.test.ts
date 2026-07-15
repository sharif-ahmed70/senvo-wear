import { ValidationApplicationError } from "../../errors.js";
import { describe, expect, it } from "vitest";
import { RepositoryAuditWriter } from "./audit-writer.js";
import type {
  AuditEntryRepository,
  CreateAuditEntryRecord,
} from "../repositories/audit-repositories.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const resourceId = "33333333-3333-4333-8333-333333333333";

describe("RepositoryAuditWriter", () => {
  it("records a valid organization-scoped audit entry", async () => {
    const repository = new MemoryAuditEntryRepository();
    const writer = new RepositoryAuditWriter(repository);

    await expect(
      writer.record({
        action: "SALES_ORDER_CREATED",
        actor: { userId },
        metadata: { requestId: "req_audit_1" },
        organizationId,
        resource: "SALES_ORDER",
        resourceId,
      }),
    ).resolves.toMatchObject({ organizationId, resourceId, userId });
  });

  it("preserves a missing user actor as null", async () => {
    const repository = new MemoryAuditEntryRepository();
    const writer = new RepositoryAuditWriter(repository);

    await writer.record({
      action: "INVENTORY_MOVEMENT_POSTED",
      actor: { userId: null },
      organizationId,
      resource: "INVENTORY_MOVEMENT",
      resourceId,
    });

    expect(repository.lastRecord?.userId).toBeNull();
  });

  it("rejects invalid resources and sensitive metadata", async () => {
    const writer = new RepositoryAuditWriter(new MemoryAuditEntryRepository());

    await expect(
      writer.record({
        action: "SALES_ORDER_CREATED",
        actor: { userId },
        organizationId,
        resource: "CUSTOMER" as "SALES_ORDER",
        resourceId,
      }),
    ).rejects.toBeInstanceOf(ValidationApplicationError);

    await expect(
      writer.record({
        action: "SALES_ORDER_CREATED",
        actor: { userId },
        metadata: { password: "must-not-be-recorded" },
        organizationId,
        resource: "SALES_ORDER",
        resourceId,
      }),
    ).rejects.toBeInstanceOf(ValidationApplicationError);
  });
});

class MemoryAuditEntryRepository implements AuditEntryRepository {
  lastRecord: CreateAuditEntryRecord | null = null;

  create(record: CreateAuditEntryRecord) {
    this.lastRecord = record;
    return Promise.resolve({
      ...record,
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
      id: "44444444-4444-4444-8444-444444444444",
    });
  }

  findById() {
    return Promise.resolve(null);
  }
}

import type {
  AuditEntry,
  AuditEntryRepository,
  AuditMetadata,
  CreateAuditEntryRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type AuditPrismaClient = Pick<PrismaClient, "auditEntry">;

export class PrismaAuditEntryRepository implements AuditEntryRepository {
  constructor(private readonly prisma: AuditPrismaClient) {}

  async create(record: CreateAuditEntryRecord): Promise<AuditEntry> {
    return mapAuditEntry(
      await this.prisma.auditEntry.create({
        data: {
          ...record,
          metadata: record.metadata,
        },
      }),
    );
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AuditEntry | null> {
    const record = await this.prisma.auditEntry.findFirst({
      where: { id, organizationId },
    });
    return record ? mapAuditEntry(record) : null;
  }
}

function mapAuditEntry(
  record: Omit<AuditEntry, "action" | "metadata" | "resource"> & {
    action: string;
    metadata: Prisma.JsonValue;
    resource: string;
  },
): AuditEntry {
  return {
    ...record,
    action: record.action as AuditEntry["action"],
    metadata: record.metadata as AuditMetadata,
    resource: record.resource as AuditEntry["resource"],
  };
}

import {
  BusinessRuleError,
  ConflictError,
  type Branch,
  type BranchChildStatusCounts,
  type BranchMetadataPatch,
  type BranchRepository,
  type CreateBranchRecord,
  type CreatePosCounterRecord,
  type CreateStockLocationRecord,
  type PosCounter,
  type PosCounterMetadataPatch,
  type PosCounterRepository,
  type StockLocation,
  type StockLocationMetadataPatch,
  type StockLocationRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type OrganizationPrismaClient = Pick<
  PrismaClient,
  "$transaction" | "branch" | "posCounter" | "stockLocation"
>;

type KnownPrismaError = {
  code?: string;
};

export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly prisma: OrganizationPrismaClient) {}

  async create(record: CreateBranchRecord): Promise<Branch> {
    return mapBranch(
      await createWithIntegrityMapping(() =>
        this.prisma.branch.create({ data: record }),
      ),
    );
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<Branch | null> {
    const record = await this.prisma.branch.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapBranch(record) : null;
  }

  async findById(id: string): Promise<Branch | null> {
    const record = await this.prisma.branch.findUnique({ where: { id } });
    return record ? mapBranch(record) : null;
  }

  async countChildrenByStatuses(
    organizationId: string,
    branchId: string,
    statuses: readonly Branch["status"][],
  ): Promise<BranchChildStatusCounts> {
    const [stockLocations, posCounters] = await Promise.all([
      this.prisma.stockLocation.count({
        where: {
          branchId,
          organizationId,
          status: { in: [...statuses] },
        },
      }),
      this.prisma.posCounter.count({
        where: {
          branchId,
          organizationId,
          status: { in: [...statuses] },
        },
      }),
    ]);

    return { posCounters, stockLocations };
  }

  async changeStatus(record: {
    blockedChildStatuses?: readonly Branch["status"][];
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: Branch["status"];
  }): Promise<Branch | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        if (record.blockedChildStatuses?.length) {
          const [stockLocations, posCounters] = await Promise.all([
            transaction.stockLocation.count({
              where: {
                branchId: record.id,
                organizationId: record.organizationId,
                status: { in: [...record.blockedChildStatuses] },
              },
            }),
            transaction.posCounter.count({
              where: {
                branchId: record.id,
                organizationId: record.organizationId,
                status: { in: [...record.blockedChildStatuses] },
              },
            }),
          ]);
          assertNoBranchStatusBlockers({ posCounters, stockLocations });
        }
        const update = await transaction.branch.updateMany({
          data: {
            status: record.status,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.branch.findUnique({ where: { id: record.id } });
      }),
      mapBranch,
    );
  }

  async updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: BranchMetadataPatch;
    organizationId: string;
  }): Promise<Branch | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        const update = await transaction.branch.updateMany({
          data: {
            ...record.metadata,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.branch.findUnique({ where: { id: record.id } });
      }),
      mapBranch,
    );
  }
}

export class PrismaStockLocationRepository implements StockLocationRepository {
  constructor(private readonly prisma: OrganizationPrismaClient) {}

  async create(record: CreateStockLocationRecord): Promise<StockLocation> {
    return mapStockLocation(
      await createWithIntegrityMapping(() =>
        this.prisma.stockLocation.create({ data: record }),
      ),
    );
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<StockLocation | null> {
    const record = await this.prisma.stockLocation.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapStockLocation(record) : null;
  }

  async findById(id: string): Promise<StockLocation | null> {
    const record = await this.prisma.stockLocation.findUnique({
      where: { id },
    });
    return record ? mapStockLocation(record) : null;
  }

  async changeStatus(record: {
    expectedVersion: number;
    id: string;
    isSellable: boolean;
    organizationId: string;
    status: StockLocation["status"];
  }): Promise<StockLocation | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        const update = await transaction.stockLocation.updateMany({
          data: {
            isSellable: record.isSellable,
            status: record.status,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.stockLocation.findUnique({
          where: { id: record.id },
        });
      }),
      mapStockLocation,
    );
  }

  async updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: StockLocationMetadataPatch;
    organizationId: string;
  }): Promise<StockLocation | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        const update = await transaction.stockLocation.updateMany({
          data: {
            ...record.metadata,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.stockLocation.findUnique({
          where: { id: record.id },
        });
      }),
      mapStockLocation,
    );
  }
}

export class PrismaPosCounterRepository implements PosCounterRepository {
  constructor(private readonly prisma: OrganizationPrismaClient) {}

  async create(record: CreatePosCounterRecord): Promise<PosCounter> {
    return mapPosCounter(
      await createWithIntegrityMapping(() =>
        this.prisma.posCounter.create({ data: record }),
      ),
    );
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<PosCounter | null> {
    const record = await this.prisma.posCounter.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapPosCounter(record) : null;
  }

  async findById(id: string): Promise<PosCounter | null> {
    const record = await this.prisma.posCounter.findUnique({ where: { id } });
    return record ? mapPosCounter(record) : null;
  }

  async changeStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: PosCounter["status"];
  }): Promise<PosCounter | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        const update = await transaction.posCounter.updateMany({
          data: {
            status: record.status,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.posCounter.findUnique({ where: { id: record.id } });
      }),
      mapPosCounter,
    );
  }

  async updateMetadata(record: {
    expectedVersion: number;
    id: string;
    metadata: PosCounterMetadataPatch;
    organizationId: string;
  }): Promise<PosCounter | null> {
    return mapVersionedUpdate(
      await this.prisma.$transaction(async (transaction) => {
        const update = await transaction.posCounter.updateMany({
          data: {
            ...record.metadata,
            version: { increment: 1 },
          },
          where: versionedWhere(record),
        });
        if (update.count === 0) {
          return null;
        }
        return transaction.posCounter.findUnique({ where: { id: record.id } });
      }),
      mapPosCounter,
    );
  }
}

async function createWithIntegrityMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError(
        "Organization operation identity uniqueness constraint was violated.",
        error,
      );
    }
    if (isForeignKeyConstraintError(error)) {
      throw new BusinessRuleError(
        "Organization operation reference integrity was violated.",
        error,
      );
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002");
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2003");
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === code
  );
}

function mapBranch(record: Branch): Branch {
  return record;
}

function mapStockLocation(record: StockLocation): StockLocation {
  return record;
}

function mapPosCounter(record: PosCounter): PosCounter {
  return record;
}

function assertNoBranchStatusBlockers(blockers: BranchChildStatusCounts): void {
  const blockingCategories = [
    blockers.stockLocations > 0 ? "stock locations" : null,
    blockers.posCounters > 0 ? "POS counters" : null,
  ].filter(Boolean);

  if (blockingCategories.length > 0) {
    throw new BusinessRuleError(
      `Branch status change is blocked by ${blockingCategories.join(" and ")}.`,
    );
  }
}

function versionedWhere(record: {
  expectedVersion: number;
  id: string;
  organizationId: string;
}) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    version: record.expectedVersion,
  };
}

function mapVersionedUpdate<TInput, TOutput>(
  record: TInput | null,
  mapper: (record: TInput) => TOutput,
): TOutput | null {
  return record ? mapper(record) : null;
}

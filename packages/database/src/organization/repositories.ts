import {
  BusinessRuleError,
  ConflictError,
  type Branch,
  type BranchChildStatusCounts,
  type BranchListFilter,
  type BranchMetadataPatch,
  type BranchRepository,
  type CreateBranchRecord,
  type CreatePosCounterRecord,
  type CreateStockLocationRecord,
  type CursorPageResult,
  encodeCursor,
  parseCursor,
  type PosCounter,
  type PosCounterListFilter,
  type PosCounterMetadataPatch,
  type PosCounterRepository,
  type StockLocation,
  type StockLocationListFilter,
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

  async findById(id: string, organizationId?: string): Promise<Branch | null> {
    const record = await this.prisma.branch.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
    return record ? mapBranch(record) : null;
  }

  async list(filter: BranchListFilter): Promise<CursorPageResult<Branch>> {
    const cursor = filter.cursor ? parseCursor(filter.cursor) : undefined;
    const records = await this.prisma.branch.findMany({
      orderBy: orderedByCreatedAtAndId(),
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.status
          ? { status: filter.status }
          : { status: { in: ["ACTIVE", "INACTIVE"] } }),
        ...(filter.type ? { type: filter.type } : {}),
        ...andReadPredicates(filter.search, cursor),
      },
    });

    return toCursorPage(records.map(mapBranch), filter.pageSize);
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

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<StockLocation | null> {
    const record = await this.prisma.stockLocation.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
    return record ? mapStockLocation(record) : null;
  }

  async list(
    filter: StockLocationListFilter,
  ): Promise<CursorPageResult<StockLocation>> {
    const cursor = filter.cursor ? parseCursor(filter.cursor) : undefined;
    const records = await this.prisma.stockLocation.findMany({
      orderBy: orderedByCreatedAtAndId(),
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
        ...(filter.status
          ? { status: filter.status }
          : { status: { in: ["ACTIVE", "INACTIVE"] } }),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.isSellable === undefined
          ? {}
          : { isSellable: filter.isSellable }),
        ...andReadPredicates(filter.search, cursor),
      },
    });

    return toCursorPage(records.map(mapStockLocation), filter.pageSize);
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

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<PosCounter | null> {
    const record = await this.prisma.posCounter.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
    });
    return record ? mapPosCounter(record) : null;
  }

  async list(
    filter: PosCounterListFilter,
  ): Promise<CursorPageResult<PosCounter>> {
    const cursor = filter.cursor ? parseCursor(filter.cursor) : undefined;
    const records = await this.prisma.posCounter.findMany({
      orderBy: orderedByCreatedAtAndId(),
      take: filter.pageSize + 1,
      where: {
        organizationId: filter.organizationId,
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
        ...(filter.status
          ? { status: filter.status }
          : { status: { in: ["ACTIVE", "INACTIVE"] } }),
        ...andReadPredicates(filter.search, cursor),
      },
    });

    return toCursorPage(records.map(mapPosCounter), filter.pageSize);
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

function orderedByCreatedAtAndId() {
  return [{ createdAt: "asc" as const }, { id: "asc" as const }];
}

function searchByNameOrCode(search?: string):
  | {
      OR: [
        { name: { contains: string; mode: "insensitive" } },
        { code: { contains: string; mode: "insensitive" } },
      ];
    }
  | Record<string, never> {
  return search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
}

function andReadPredicates(
  search?: string,
  cursor?: ReturnType<typeof parseCursor>,
): Record<string, unknown> {
  const predicates = [searchByNameOrCode(search), afterCursor(cursor)].filter(
    (predicate) => Object.keys(predicate).length > 0,
  );

  if (predicates.length === 0) {
    return {};
  }
  return { AND: predicates };
}

function afterCursor(
  cursor?: ReturnType<typeof parseCursor>,
): Record<string, unknown> {
  if (!cursor) {
    return {};
  }
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

function toCursorPage<T extends { createdAt: Date; id: string }>(
  records: T[],
  pageSize: number,
): CursorPageResult<T> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;
  const lastItem = items.at(-1);

  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeCursor(lastItem.createdAt, lastItem.id)
        : null,
  };
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

import {
  BusinessRuleError,
  ConflictError,
  type Branch,
  type BranchRepository,
  type CreateBranchRecord,
  type CreatePosCounterRecord,
  type CreateStockLocationRecord,
  type PosCounter,
  type PosCounterRepository,
  type StockLocation,
  type StockLocationRepository,
} from "@senvo/domain";
import type { PrismaClient } from "../../generated/prisma/client.js";

type OrganizationPrismaClient = Pick<
  PrismaClient,
  "branch" | "posCounter" | "stockLocation"
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

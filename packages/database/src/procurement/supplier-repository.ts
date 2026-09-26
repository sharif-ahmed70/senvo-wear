import {
  ConflictError,
  type CreateSupplierRecord,
  type Supplier,
  type SupplierListFilter,
  type SupplierRepository,
  type UpdateSupplierRecord,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type SupplierPrismaClient = Pick<PrismaClient, "supplier">;

type KnownPrismaError = {
  code?: string;
};

export class PrismaSupplierRepository implements SupplierRepository {
  constructor(private readonly prisma: SupplierPrismaClient) {}

  async create(record: CreateSupplierRecord): Promise<Supplier> {
    try {
      const created = await this.prisma.supplier.create({
        data: {
          address: record.address ?? null,
          code: record.code,
          contactPerson: record.contactPerson ?? null,
          email: record.email ?? null,
          name: record.name,
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          phone: record.phone ?? null,
          status: record.status ?? "ACTIVE",
        },
      });
      return mapSupplier(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          "Supplier with this code already exists in this organization.",
        );
      }
      throw error;
    }
  }

  async findById(id: string, organizationId: string): Promise<Supplier | null> {
    const record = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    return record ? mapSupplier(record) : null;
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<Supplier | null> {
    const record = await this.prisma.supplier.findUnique({
      where: { organizationId_code: { code, organizationId } },
    });
    return record ? mapSupplier(record) : null;
  }

  async list(filter: SupplierListFilter): Promise<Supplier[]> {
    const where: Prisma.SupplierWhereInput = {
      organizationId: filter.organizationId,
    };

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search?.trim()) {
      const search = filter.search.trim();
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const records = await this.prisma.supplier.findMany({
      orderBy: { name: "asc" },
      where,
    });
    return records.map(mapSupplier);
  }

  async update(record: UpdateSupplierRecord): Promise<Supplier | null> {
    try {
      const updated = await this.prisma.supplier.update({
        data: {
          ...(record.name !== undefined ? { name: record.name } : {}),
          ...(record.code !== undefined ? { code: record.code } : {}),
          ...(record.contactPerson !== undefined
            ? { contactPerson: record.contactPerson }
            : {}),
          ...(record.phone !== undefined ? { phone: record.phone } : {}),
          ...(record.email !== undefined ? { email: record.email } : {}),
          ...(record.address !== undefined ? { address: record.address } : {}),
          ...(record.notes !== undefined ? { notes: record.notes } : {}),
          ...(record.status !== undefined ? { status: record.status } : {}),
        },
        where: {
          id_organizationId: {
            id: record.id,
            organizationId: record.organizationId,
          },
        },
      });
      return mapSupplier(updated);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return null;
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          "Supplier with this code already exists in this organization.",
        );
      }
      throw error;
    }
  }

  async deactivate(
    id: string,
    organizationId: string,
  ): Promise<Supplier | null> {
    return this.update({
      id,
      organizationId,
      status: "INACTIVE",
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2002"
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as KnownPrismaError).code === "P2025"
  );
}

function mapSupplier(record: Supplier): Supplier {
  return record;
}

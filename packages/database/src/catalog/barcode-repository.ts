import {
  ConflictError,
  type BarcodeLookupResult,
  type BarcodeRepository,
  type CreateVariantBarcodeRecord,
  type VariantBarcode,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type BarcodePrismaClient = Pick<
  PrismaClient,
  "productVariant" | "variantBarcode"
>;
type BarcodeRecord = Prisma.VariantBarcodeGetPayload<Record<string, never>>;
type LookupRecord = Prisma.VariantBarcodeGetPayload<{
  include: {
    productVariant: {
      include: { color: true; product: true; size: true };
    };
  };
}>;

export class PrismaBarcodeRepository implements BarcodeRepository {
  constructor(private readonly prisma: BarcodePrismaClient) {}

  async create(record: CreateVariantBarcodeRecord): Promise<VariantBarcode> {
    try {
      return mapBarcode(
        await this.prisma.variantBarcode.create({ data: record }),
      );
    } catch (error) {
      throw mapConflict(error);
    }
  }

  async existsByValue(value: string): Promise<boolean> {
    return (await this.prisma.variantBarcode.count({ where: { value } })) > 0;
  }

  async findActiveByVariant(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantBarcode | null> {
    const record = await this.prisma.variantBarcode.findFirst({
      where: { organizationId, productVariantId, status: "ACTIVE" },
    });
    return record ? mapBarcode(record) : null;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<VariantBarcode | null> {
    const record = await this.prisma.variantBarcode.findFirst({
      where: { id, organizationId },
    });
    return record ? mapBarcode(record) : null;
  }

  async listByVariant(
    organizationId: string,
    productVariantId: string,
  ): Promise<VariantBarcode[]> {
    const records = await this.prisma.variantBarcode.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: { organizationId, productVariantId },
    });
    return records.map(mapBarcode);
  }

  async lookupActive(
    organizationId: string,
    value: string,
  ): Promise<BarcodeLookupResult | null> {
    const record = await this.prisma.variantBarcode.findFirst({
      include: {
        productVariant: {
          include: { color: true, product: true, size: true },
        },
      },
      where: { organizationId, status: "ACTIVE", value },
    });
    return record ? mapLookup(record) : null;
  }

  async updateStatus(record: {
    id: string;
    organizationId: string;
    status: VariantBarcode["status"];
  }): Promise<VariantBarcode | null> {
    try {
      const result = await this.prisma.variantBarcode.updateMany({
        data: { status: record.status },
        where: { id: record.id, organizationId: record.organizationId },
      });
      return result.count === 0
        ? null
        : this.findById(record.id, record.organizationId);
    } catch (error) {
      throw mapConflict(error);
    }
  }

  async variantExists(
    organizationId: string,
    productVariantId: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.productVariant.count({
        where: { id: productVariantId, organizationId },
      })) > 0
    );
  }
}

function mapBarcode(record: BarcodeRecord): VariantBarcode {
  return record;
}

function mapLookup(record: LookupRecord): BarcodeLookupResult {
  return {
    barcode: mapBarcode(record),
    color: record.productVariant.color.name,
    productName: record.productVariant.product.name,
    size: record.productVariant.size.name,
    sku: record.productVariant.sku,
    variantId: record.productVariant.id,
  };
}

function mapConflict(error: unknown): unknown {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  ) {
    return new ConflictError(
      "Barcode uniqueness constraint was violated.",
      error,
    );
  }
  return error;
}

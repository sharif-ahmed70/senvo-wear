import {
  ConflictError,
  NotFoundError,
  type CatalogMediaRepository,
  type CreatePrimaryProductMediaRecord,
  type PrimaryProductMedia,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type CatalogMediaPrismaClient = Pick<
  PrismaClient,
  "$executeRaw" | "catalogMediaLink" | "mediaAsset" | "product"
>;

const mediaInclude = {
  mediaAsset: true,
} satisfies Prisma.CatalogMediaLinkInclude;

type MediaLinkRecord = Prisma.CatalogMediaLinkGetPayload<{
  include: typeof mediaInclude;
}>;

export class PrismaCatalogMediaRepository implements CatalogMediaRepository {
  constructor(private readonly prisma: CatalogMediaPrismaClient) {}

  async findPrimary(
    organizationId: string,
    productId: string,
  ): Promise<PrimaryProductMedia | null> {
    const record = await this.prisma.catalogMediaLink.findFirst({
      include: mediaInclude,
      where: {
        organizationId,
        productId,
        role: "PRIMARY",
        status: "ACTIVE",
        mediaAsset: { status: "ACTIVE" },
      },
    });
    return record ? mapPrimary(record) : null;
  }

  async listPrimary(
    organizationId: string,
    productIds: readonly string[],
  ): Promise<PrimaryProductMedia[]> {
    if (productIds.length === 0) return [];
    const records = await this.prisma.catalogMediaLink.findMany({
      include: mediaInclude,
      where: {
        organizationId,
        productId: { in: [...productIds] },
        role: "PRIMARY",
        status: "ACTIVE",
        mediaAsset: { status: "ACTIVE" },
      },
    });
    return records.map(mapPrimary);
  }

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<PrimaryProductMedia | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      include: { catalogLinks: { include: { mediaAsset: true }, take: 1 } },
      where: {
        organizationId_idempotencyKey: { idempotencyKey, organizationId },
      },
    });
    const link = asset?.catalogLinks.at(0);
    return link ? mapPrimary(link) : null;
  }

  async replacePrimary(record: CreatePrimaryProductMediaRecord): Promise<{
    current: PrimaryProductMedia;
    previous: PrimaryProductMedia | null;
  }> {
    await this.lock(record.organizationId, record.productId);
    const product = await this.prisma.product.findFirst({
      select: { id: true },
      where: { id: record.productId, organizationId: record.organizationId },
    });
    if (!product) throw new NotFoundError("Product was not found.");

    const replay = await this.findByIdempotencyKey(
      record.organizationId,
      record.idempotencyKey,
    );
    if (replay) {
      if (replay.asset.requestSignature !== record.requestSignature) {
        throw new ConflictError(
          "The idempotency key was already used with different media.",
        );
      }
      return { current: replay, previous: null };
    }

    const previous = await this.findPrimary(
      record.organizationId,
      record.productId,
    );
    if (previous) {
      await this.prisma.catalogMediaLink.updateMany({
        data: { status: "ARCHIVED" },
        where: { id: previous.link.id, organizationId: record.organizationId },
      });
      await this.prisma.mediaAsset.updateMany({
        data: { status: "ARCHIVED", version: { increment: 1 } },
        where: { id: previous.asset.id, organizationId: record.organizationId },
      });
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        altText: record.altText,
        byteSize: record.byteSize,
        contentType: record.contentType,
        id: record.id,
        idempotencyKey: record.idempotencyKey,
        mediaType: record.mediaType,
        organizationId: record.organizationId,
        requestSignature: record.requestSignature,
        storageKey: record.storageKey,
      },
    });
    const link = await this.prisma.catalogMediaLink.create({
      data: {
        id: record.linkId,
        mediaAssetId: asset.id,
        organizationId: record.organizationId,
        productId: record.productId,
        role: "PRIMARY",
        sortOrder: 0,
      },
      include: mediaInclude,
    });
    return { current: mapPrimary(link), previous };
  }

  async archivePrimary(input: {
    organizationId: string;
    productId: string;
  }): Promise<PrimaryProductMedia | null> {
    await this.lock(input.organizationId, input.productId);
    const current = await this.findPrimary(
      input.organizationId,
      input.productId,
    );
    if (!current) return null;
    await this.prisma.catalogMediaLink.updateMany({
      data: { status: "ARCHIVED" },
      where: { id: current.link.id, organizationId: input.organizationId },
    });
    await this.prisma.mediaAsset.updateMany({
      data: { status: "ARCHIVED", version: { increment: 1 } },
      where: { id: current.asset.id, organizationId: input.organizationId },
    });
    return current;
  }

  async listArchivedStorageKeys(
    organizationId: string,
    limit: number,
  ): Promise<string[]> {
    const records = await this.prisma.mediaAsset.findMany({
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { storageKey: true },
      take: limit,
      where: { organizationId, status: "ARCHIVED" },
    });
    return records.map((record) => record.storageKey);
  }

  private async lock(organizationId: string, productId: string): Promise<void> {
    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${productId}:primary-media`}, 0))`;
  }
}

function mapPrimary(record: MediaLinkRecord): PrimaryProductMedia {
  return {
    asset: record.mediaAsset,
    link: {
      createdAt: record.createdAt,
      id: record.id,
      mediaAssetId: record.mediaAssetId,
      organizationId: record.organizationId,
      productId: record.productId,
      role: record.role,
      sortOrder: record.sortOrder,
      status: record.status,
      updatedAt: record.updatedAt,
    },
  };
}

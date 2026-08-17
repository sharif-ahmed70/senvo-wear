import {
  ConflictError,
  NotFoundError,
  type CatalogMediaRepository,
  type CreateProductMediaRecord,
  type CreatePrimaryProductMediaRecord,
  type PrimaryProductMedia,
  type ProductMedia,
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

  async listProductMedia(
    organizationId: string,
    productId: string,
  ): Promise<ProductMedia[]> {
    const records = await this.prisma.catalogMediaLink.findMany({
      include: mediaInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      where: {
        organizationId,
        productId,
        status: "ACTIVE",
        mediaAsset: { status: "ACTIVE" },
      },
    });
    return records.map(mapPrimary).sort(mediaOrder);
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
        productVariantId: null,
        role: "PRIMARY",
        sortOrder: 0,
      },
      include: mediaInclude,
    });
    return { current: mapPrimary(link), previous };
  }

  async add(record: CreateProductMediaRecord): Promise<ProductMedia> {
    await this.lock(record.organizationId, record.productId);
    const product = await this.prisma.product.findFirst({
      select: { id: true },
      where: { id: record.productId, organizationId: record.organizationId },
    });
    if (!product) throw new NotFoundError("Product was not found.");
    await this.requireVariant(record);
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
      return replay;
    }
    const existing = await this.listProductMedia(
      record.organizationId,
      record.productId,
    );
    const role = existing.some((item) => item.link.role === "PRIMARY")
      ? record.role
      : "PRIMARY";
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
    return mapPrimary(
      await this.prisma.catalogMediaLink.create({
        data: {
          id: record.linkId,
          mediaAssetId: asset.id,
          organizationId: record.organizationId,
          productId: record.productId,
          productVariantId: record.productVariantId,
          role,
          sortOrder: existing.length,
        },
        include: mediaInclude,
      }),
    );
  }

  async setPrimary(input: {
    linkId: string;
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia[]> {
    await this.lock(input.organizationId, input.productId);
    const target = await this.prisma.catalogMediaLink.findFirst({
      select: { id: true },
      where: {
        id: input.linkId,
        organizationId: input.organizationId,
        productId: input.productId,
        status: "ACTIVE",
        mediaAsset: { status: "ACTIVE" },
      },
    });
    if (!target) throw new NotFoundError("Product image was not found.");
    await this.prisma.catalogMediaLink.updateMany({
      data: { role: "GALLERY" },
      where: {
        organizationId: input.organizationId,
        productId: input.productId,
        role: "PRIMARY",
        status: "ACTIVE",
        id: { not: input.linkId },
      },
    });
    await this.prisma.catalogMediaLink.updateMany({
      data: { role: "PRIMARY" },
      where: {
        id: input.linkId,
        organizationId: input.organizationId,
        productId: input.productId,
        status: "ACTIVE",
      },
    });
    return this.listProductMedia(input.organizationId, input.productId);
  }

  async reorder(input: {
    linkIds: readonly string[];
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia[]> {
    await this.lock(input.organizationId, input.productId);
    const active = await this.listProductMedia(
      input.organizationId,
      input.productId,
    );
    if (
      active.length !== input.linkIds.length ||
      active.some((item) => !input.linkIds.includes(item.link.id))
    ) {
      throw new ConflictError(
        "The media order must include every active product image exactly once.",
      );
    }
    const primary = active.find((item) => item.link.role === "PRIMARY");
    if (primary && input.linkIds[0] !== primary.link.id) {
      throw new ConflictError(
        "The primary image must remain first in the product gallery.",
      );
    }
    await Promise.all(
      input.linkIds.map((id, sortOrder) =>
        this.prisma.catalogMediaLink.updateMany({
          data: { sortOrder },
          where: {
            id,
            organizationId: input.organizationId,
            productId: input.productId,
            status: "ACTIVE",
          },
        }),
      ),
    );
    return this.listProductMedia(input.organizationId, input.productId);
  }

  async updateMetadata(input: {
    altText: string;
    linkId: string;
    organizationId: string;
    productId: string;
    productVariantId: string | null;
  }): Promise<ProductMedia | null> {
    await this.lock(input.organizationId, input.productId);
    await this.requireVariant(input);
    const link = await this.prisma.catalogMediaLink.findFirst({
      include: mediaInclude,
      where: {
        id: input.linkId,
        organizationId: input.organizationId,
        productId: input.productId,
        status: "ACTIVE",
      },
    });
    if (!link) return null;
    await this.prisma.mediaAsset.updateMany({
      data: { altText: input.altText, version: { increment: 1 } },
      where: { id: link.mediaAssetId, organizationId: input.organizationId },
    });
    return mapPrimary(
      await this.prisma.catalogMediaLink.update({
        data: { productVariantId: input.productVariantId },
        include: mediaInclude,
        where: { id: input.linkId },
      }),
    );
  }

  async archive(input: {
    linkId: string;
    organizationId: string;
    productId: string;
  }): Promise<ProductMedia | null> {
    await this.lock(input.organizationId, input.productId);
    const current = await this.prisma.catalogMediaLink.findFirst({
      include: mediaInclude,
      where: {
        id: input.linkId,
        organizationId: input.organizationId,
        productId: input.productId,
        status: "ACTIVE",
      },
    });
    if (!current) return null;
    await this.prisma.catalogMediaLink.updateMany({
      data: { status: "ARCHIVED" },
      where: { id: input.linkId, organizationId: input.organizationId },
    });
    await this.prisma.mediaAsset.updateMany({
      data: { status: "ARCHIVED", version: { increment: 1 } },
      where: { id: current.mediaAssetId, organizationId: input.organizationId },
    });
    if (current.role === "PRIMARY") {
      const next = (
        await this.listProductMedia(input.organizationId, input.productId)
      ).at(0);
      if (next) {
        await this.prisma.catalogMediaLink.updateMany({
          data: { role: "PRIMARY" },
          where: { id: next.link.id, organizationId: input.organizationId },
        });
      }
    }
    return mapPrimary(current);
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
    const next = (
      await this.listProductMedia(input.organizationId, input.productId)
    ).at(0);
    if (next) {
      await this.prisma.catalogMediaLink.updateMany({
        data: { role: "PRIMARY" },
        where: { id: next.link.id, organizationId: input.organizationId },
      });
    }
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

  private async requireVariant(input: {
    organizationId: string;
    productId: string;
    productVariantId: string | null;
  }): Promise<void> {
    if (!input.productVariantId) return;
    const count = await this.prisma.product.count({
      where: {
        id: input.productId,
        organizationId: input.organizationId,
        variants: { some: { id: input.productVariantId } },
      },
    });
    if (count === 0) {
      throw new NotFoundError("Product variant was not found.");
    }
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
      productVariantId: record.productVariantId,
      role: record.role,
      sortOrder: record.sortOrder,
      status: record.status,
      updatedAt: record.updatedAt,
    },
  };
}

function mediaOrder(left: ProductMedia, right: ProductMedia): number {
  if (left.link.role !== right.link.role)
    return left.link.role === "PRIMARY" ? -1 : 1;
  return (
    left.link.sortOrder - right.link.sortOrder ||
    left.link.createdAt.getTime() - right.link.createdAt.getTime() ||
    left.link.id.localeCompare(right.link.id)
  );
}

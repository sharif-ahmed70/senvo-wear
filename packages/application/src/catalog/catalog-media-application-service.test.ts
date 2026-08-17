import {
  ConflictError,
  type CatalogMediaRepository,
  type CatalogProductManagementRepository,
  type CreatePrimaryProductMediaRecord,
  type CreateProductMediaRecord,
  type PrimaryProductMedia,
} from "@senvo/domain";
import { InMemoryObjectStorageProvider } from "@senvo/storage";
import { describe, expect, it } from "vitest";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { CatalogMediaApplicationService } from "./catalog-media-application-service.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000002";
const context = {
  organizationId,
  requestId: "req_media_test_1",
  userId: "10000000-0000-4000-8000-000000000003",
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString(
  "base64",
);

describe("CatalogMediaApplicationService", () => {
  it("attaches and idempotently replays an organization-owned primary image", async () => {
    const fixture = createFixture();
    const input = {
      altText: "Black everyday shirt",
      contentBase64: png,
      contentType: "image/png" as const,
      idempotencyKey: "media-request-001",
      productId,
    };
    const first = await fixture.service.setPrimaryProductImage(context, input);
    const replay = await fixture.service.setPrimaryProductImage(context, input);
    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(fixture.repository.current?.asset.storageKey).toContain(
      `organizations/${organizationId}/products/${productId}/`,
    );
    expect(fixture.repository.replaceCount).toBe(1);
  });

  it("replaces and removes the active primary image", async () => {
    const fixture = createFixture();
    await fixture.service.setPrimaryProductImage(context, {
      altText: "First image",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-002",
      productId,
    });
    const replacement = await fixture.service.setPrimaryProductImage(context, {
      altText: "Replacement image",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-003",
      productId,
    });
    expect(replacement.ok && replacement.data.altText).toBe(
      "Replacement image",
    );
    expect(fixture.repository.archived).toHaveLength(1);
    await expect(
      fixture.service.removePrimaryProductImage(context, { productId }),
    ).resolves.toMatchObject({ data: null, ok: true });
    expect(fixture.repository.current).toBeNull();
  });

  it("rejects content that does not match its declared image MIME", async () => {
    const fixture = createFixture();
    const result = await fixture.service.setPrimaryProductImage(context, {
      altText: "Invalid image",
      contentBase64: Buffer.from("not a png").toString("base64"),
      contentType: "image/png",
      idempotencyKey: "media-request-004",
      productId,
    });
    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
    expect(fixture.repository.current).toBeNull();
  });

  it("deletes a newly uploaded object when the database transaction fails", async () => {
    const repository = new MemoryMediaRepository();
    const storage = new InMemoryObjectStorageProvider();
    const service = new CatalogMediaApplicationService({
      media: repository,
      products: productRepository(),
      storage,
      transactionManager: {
        execute: () => Promise.reject(new Error("database unavailable")),
      },
    });
    const result = await service.setPrimaryProductImage(context, {
      altText: "Compensated image",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-005",
      productId,
    });
    expect(result).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
      ok: false,
    });
  });

  it("keeps replacement database truth when old-object deletion fails", async () => {
    const repository = new MemoryMediaRepository();
    const storage = new InMemoryObjectStorageProvider({ delete: true });
    const service = serviceFor(repository, storage);
    await service.setPrimaryProductImage(context, {
      altText: "First",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-006",
      productId,
    });
    const result = await service.setPrimaryProductImage(context, {
      altText: "Current",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-007",
      productId,
    });
    expect(result).toMatchObject({ data: { altText: "Current" }, ok: true });
    expect(repository.current?.asset.altText).toBe("Current");
    expect(repository.archived).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with different image details", async () => {
    const fixture = createFixture();
    await fixture.service.setPrimaryProductImage(context, {
      altText: "First request",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-008",
      productId,
    });
    const conflict = await fixture.service.setPrimaryProductImage(context, {
      altText: "Different request",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-008",
      productId,
    });
    expect(conflict).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      ok: false,
    });
    expect(fixture.repository.replaceCount).toBe(1);
  });

  it("removes the losing object when concurrent retries converge on one asset", async () => {
    const fixture = createFixture();
    const input = {
      altText: "Concurrent retry",
      contentBase64: png,
      contentType: "image/png" as const,
      idempotencyKey: "media-request-009",
      productId,
    };
    const [first, second] = await Promise.all([
      fixture.service.setPrimaryProductImage(context, input),
      fixture.service.setPrimaryProductImage(context, input),
    ]);
    expect(first).toEqual(second);
    expect(fixture.repository.replaceCount).toBe(1);
    expect(fixture.storage.count()).toBe(1);
  });

  it("rejects duplicate media reorder ids before persistence", async () => {
    const fixture = createFixture();
    const linkId = "10000000-0000-4000-8000-000000000010";
    const result = await fixture.service.reorderProductMedia(context, {
      linkIds: [linkId, linkId],
      productId,
    });
    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
  });

  it("adds gallery media without accepting organization or storage identity", async () => {
    const fixture = createFixture();
    const result = await fixture.service.addProductMedia(context, {
      altText: "Oxford side view",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-010",
      productId,
      productVariantId: null,
    });
    expect(result).toMatchObject({
      data: {
        altText: "Oxford side view",
        productVariantId: null,
        role: "GALLERY",
      },
      ok: true,
    });
    const rejected = await fixture.service.addProductMedia(context, {
      altText: "Unsafe upload",
      contentBase64: png,
      contentType: "image/png",
      idempotencyKey: "media-request-011",
      organizationId,
      productId,
      storageKey: "browser-owned-key",
    });
    expect(rejected).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
  });
});

class MemoryMediaRepository implements CatalogMediaRepository {
  current: PrimaryProductMedia | null = null;
  archived: PrimaryProductMedia[] = [];
  replaceCount = 0;

  async add(record: CreateProductMediaRecord) {
    const result = await this.replacePrimary(record);
    result.current.link.role = record.role;
    result.current.link.productVariantId = record.productVariantId;
    return result.current;
  }
  archive(input: { linkId: string }) {
    return this.current?.link.id === input.linkId
      ? this.archivePrimary()
      : Promise.resolve(null);
  }

  archivePrimary() {
    const current = this.current;
    if (current) this.archived.push(current);
    this.current = null;
    return Promise.resolve(current);
  }
  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    const all = [...this.archived, ...(this.current ? [this.current] : [])];
    return Promise.resolve(
      all.find(
        (item) =>
          item.asset.organizationId === organizationId &&
          item.asset.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }
  findPrimary(organizationId: string, requestedProductId: string) {
    return Promise.resolve(
      this.current?.asset.organizationId === organizationId &&
        this.current.link.productId === requestedProductId
        ? this.current
        : null,
    );
  }
  listArchivedStorageKeys(organizationId: string) {
    return Promise.resolve(
      this.archived
        .filter((item) => item.asset.organizationId === organizationId)
        .map((item) => item.asset.storageKey),
    );
  }
  listPrimary(organizationId: string, productIds: readonly string[]) {
    return Promise.resolve(
      this.current &&
        this.current.asset.organizationId === organizationId &&
        productIds.includes(this.current.link.productId)
        ? [this.current]
        : [],
    );
  }
  listProductMedia(organizationId: string, requestedProductId: string) {
    return this.findPrimary(organizationId, requestedProductId).then((item) =>
      item ? [item] : [],
    );
  }
  reorder() {
    return Promise.resolve(this.current ? [this.current] : []);
  }
  setPrimary() {
    if (this.current) this.current.link.role = "PRIMARY";
    return Promise.resolve(this.current ? [this.current] : []);
  }
  updateMetadata(input: { altText: string; productVariantId: string | null }) {
    if (this.current) {
      this.current.asset.altText = input.altText;
      this.current.link.productVariantId = input.productVariantId;
    }
    return Promise.resolve(this.current);
  }
  replacePrimary(record: CreatePrimaryProductMediaRecord) {
    const replay = [
      ...this.archived,
      ...(this.current ? [this.current] : []),
    ].find(
      (item) =>
        item.asset.organizationId === record.organizationId &&
        item.asset.idempotencyKey === record.idempotencyKey,
    );
    if (replay) {
      if (replay.asset.requestSignature !== record.requestSignature) {
        throw new ConflictError(
          "The idempotency key was already used with different media.",
        );
      }
      return Promise.resolve({ current: replay, previous: null });
    }
    this.replaceCount += 1;
    const previous = this.current;
    if (previous) this.archived.push(previous);
    const now = new Date("2026-08-17T12:00:00.000Z");
    const created: PrimaryProductMedia = {
      asset: {
        ...record,
        createdAt: now,
        status: "ACTIVE",
        updatedAt: now,
        version: 1,
      },
      link: {
        createdAt: now,
        id: record.linkId,
        mediaAssetId: record.id,
        organizationId: record.organizationId,
        productId: record.productId,
        productVariantId: null,
        role: "PRIMARY",
        sortOrder: 0,
        status: "ACTIVE",
        updatedAt: now,
      },
    };
    this.current = created;
    return Promise.resolve({ current: created, previous });
  }
}

function productRepository(): CatalogProductManagementRepository {
  return {
    findById: (_id, requestedOrganizationId) =>
      Promise.resolve(
        requestedOrganizationId === organizationId
          ? ({ id: productId } as never)
          : null,
      ),
  } as CatalogProductManagementRepository;
}

function serviceFor(
  repository: MemoryMediaRepository,
  storage: InMemoryObjectStorageProvider,
): CatalogMediaApplicationService {
  const transactionManager: ApplicationTransactionManager = {
    execute: (applicationContext, operation) =>
      operation({
        applicationContext,
        catalogMediaRepository: repository,
      } as never),
  };
  return new CatalogMediaApplicationService({
    media: repository,
    products: productRepository(),
    storage,
    transactionManager,
  });
}

function createFixture() {
  const repository = new MemoryMediaRepository();
  const storage = new InMemoryObjectStorageProvider();
  return { repository, service: serviceFor(repository, storage), storage };
}

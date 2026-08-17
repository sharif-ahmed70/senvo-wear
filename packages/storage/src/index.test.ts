import { describe, expect, it } from "vitest";
import {
  InMemoryObjectStorageProvider,
  productImageObjectKey,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000002";
const assetId = "10000000-0000-4000-8000-000000000003";

describe("product media object storage", () => {
  it("builds deterministic organization-owned keys", () => {
    expect(
      productImageObjectKey({
        assetId,
        contentType: "image/png",
        organizationId,
        productId,
      }),
    ).toBe(
      `organizations/${organizationId}/products/${productId}/${assetId}.png`,
    );
    expect(() =>
      productImageObjectKey({
        assetId: "../escape",
        contentType: "image/png",
        organizationId,
        productId,
      }),
    ).toThrow("identifiers are invalid");
  });

  it("uploads, resolves, and deletes an image", async () => {
    const storage = new InMemoryObjectStorageProvider();
    const key = productImageObjectKey({
      assetId,
      contentType: "image/png",
      organizationId,
      productId,
    });
    await storage.upload({
      body: new Uint8Array([137, 80, 78, 71]),
      contentType: "image/png",
      key,
    });
    expect(storage.has(key)).toBe(true);
    await expect(storage.getUrl(key)).resolves.toMatch(
      /^data:image\/png;base64,/,
    );
    await storage.delete(key);
    expect(storage.has(key)).toBe(false);
  });

  it("surfaces upload and delete failures", async () => {
    const uploadFailure = new InMemoryObjectStorageProvider({ upload: true });
    await expect(
      uploadFailure.upload({
        body: new Uint8Array([1]),
        contentType: "image/png",
        key: "key",
      }),
    ).rejects.toThrow("upload failed");
    const deleteFailure = new InMemoryObjectStorageProvider({ delete: true });
    await expect(deleteFailure.delete("key")).rejects.toThrow(
      "deletion failed",
    );
  });
});

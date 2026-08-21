import { describe, expect, it } from "vitest";
import {
  InMemoryObjectStorageProvider,
  S3CompatibleObjectStorageProvider,
  loadS3CompatibleStorageConfig,
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

  it("signs S3-compatible writes and returns the configured public URL", async () => {
    const requests: { authorization: string | null; method: string }[] = [];
    const provider = new S3CompatibleObjectStorageProvider(
      {
        accessKeyId: "access-key",
        bucket: "senvo-media",
        endpoint: "https://storage.example.test",
        publicBaseUrl: "https://media.example.test",
        region: "auto",
        secretAccessKey: "server-secret",
      },
      (input, init) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
          method: init?.method ?? "GET",
        });
        expect(requestUrl).toContain("/senvo-media/organizations/");
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      () => new Date("2026-08-21T06:00:00.000Z"),
    );
    const key = productImageObjectKey({
      assetId,
      contentType: "image/png",
      organizationId,
      productId,
    });
    await expect(
      provider.upload({
        body: new Uint8Array([137, 80, 78, 71]),
        contentType: "image/png",
        key,
      }),
    ).resolves.toMatchObject({
      url: `https://media.example.test/${key}`,
    });
    await provider.delete(key);
    expect(requests.map((request) => request.method)).toEqual([
      "PUT",
      "DELETE",
    ]);
    expect(requests[0]?.authorization).toMatch(/^AWS4-HMAC-SHA256 /u);
    expect(requests[0]?.authorization).not.toContain("server-secret");
  });

  it("requires HTTPS and server-only production storage credentials", () => {
    expect(() =>
      loadS3CompatibleStorageConfig({
        MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
        MEDIA_S3_ENDPOINT: "http://storage.example.test",
      }),
    ).toThrow("MEDIA_S3_ENDPOINT must use HTTPS");
  });
});

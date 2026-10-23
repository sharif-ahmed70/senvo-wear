import type { PurchaseRepository, SupplierRepository } from "@senvo/domain";
import { InMemoryObjectStorageProvider } from "@senvo/storage";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import { ProcurementApplicationService } from "./procurement-application-service.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const purchaseId = "33333333-3333-4333-8333-333333333333";
const context: ApplicationExecutionContext = {
  organizationId: orgId,
  permissions: [
    { action: "CREATE", resource: "PROCUREMENT" },
    { action: "READ", resource: "PROCUREMENT" },
  ],
  requestId: "req-memo-0001",
  userId: "99999999-9999-4999-8999-999999999999",
};
// A JPEG starts with FF D8 FF.
const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString(
  "base64",
);

function service(found = true) {
  let memo: {
    contentType: string;
    storageKey: string;
    uploadedAt: Date;
  } | null = null;
  const storage = new InMemoryObjectStorageProvider();
  const purchases = {
    findMemo: vi.fn(() => Promise.resolve(memo)),
    setMemo: vi.fn(
      (input: {
        contentType: string;
        storageKey: string;
        uploadedAt: Date;
      }) => {
        if (!found) return Promise.resolve(null);
        const previousStorageKey = memo?.storageKey ?? null;
        memo = input;
        return Promise.resolve({ previousStorageKey });
      },
    ),
  } as unknown as PurchaseRepository;
  return {
    purchases,
    service: new ProcurementApplicationService({
      authorizationService: { authorize: () => Promise.resolve() },
      purchases,
      storage,
      suppliers: {} as SupplierRepository,
    }),
    storage,
  };
}

describe("purchase cash memo", () => {
  it("stores the photo, replaces the old one and reads it back", async () => {
    const { service: svc, storage } = service();
    const first = await svc.uploadPurchaseMemo(context, {
      contentBase64: jpegBase64,
      contentType: "image/jpeg",
      purchaseId,
    });
    expect(first.ok).toBe(true);
    const second = await svc.uploadPurchaseMemo(context, {
      contentBase64: jpegBase64,
      contentType: "image/jpeg",
      purchaseId,
    });
    expect(second.ok).toBe(true);
    // Only the latest photo is kept in storage.
    expect([
      ...(
        storage as unknown as { objects: Map<string, unknown> }
      ).objects.keys(),
    ]).toHaveLength(1);
    const read = await svc.getPurchaseMemo(context, { purchaseId });
    expect(read).toMatchObject({
      data: { contentType: "image/jpeg" },
      ok: true,
    });
  });

  it("rejects a file that is not the image type it claims", async () => {
    const result = await service().service.uploadPurchaseMemo(context, {
      contentBase64: Buffer.from("not an image").toString("base64"),
      contentType: "image/jpeg",
      purchaseId,
    });
    expect(result.ok).toBe(false);
  });

  it("does not keep the file when the purchase does not exist", async () => {
    const { service: svc, storage } = service(false);
    const result = await svc.uploadPurchaseMemo(context, {
      contentBase64: jpegBase64,
      contentType: "image/jpeg",
      purchaseId,
    });
    expect(result.ok).toBe(false);
    expect(
      (storage as unknown as { objects: Map<string, unknown> }).objects.size,
    ).toBe(0);
  });

  it("returns null when no memo was added", async () => {
    await expect(
      service().service.getPurchaseMemo(context, { purchaseId }),
    ).resolves.toEqual({ data: null, ok: true });
  });
});

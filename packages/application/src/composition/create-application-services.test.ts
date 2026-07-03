import type { SalesOrderRepository } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import { createApplicationServices } from "./create-application-services.js";

describe("createApplicationServices", () => {
  it("composes sales services with an injected repository without opening Prisma", async () => {
    const services = createApplicationServices({
      logger: nullLogger,
      requestIdGenerator: () => "generated_request_1",
      salesOrderRepository: fakeRepository,
    });

    const result = await services.sales.getOrderById(
      { organizationId: "11111111-1111-4111-8111-111111111111" },
      { salesOrderId: "22222222-2222-4222-8222-222222222222" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "NOT_FOUND",
        requestId: "generated_request_1",
      });
    }
    await expect(services.disconnect()).resolves.toBeUndefined();
  });
});

const fakeRepository: SalesOrderRepository = {
  amendDraft: () => Promise.reject(unreachableError()),
  cancel: () => Promise.reject(unreachableError()),
  confirm: () => Promise.reject(unreachableError()),
  createDraft: () => Promise.reject(unreachableError()),
  findById: () => Promise.resolve(null),
  findByIdempotencyKey: () => Promise.resolve(null),
  findByOrderNumber: () => Promise.resolve(null),
  fulfill: () => Promise.reject(unreachableError()),
  list: () => Promise.resolve({ hasMore: false, items: [], nextCursor: null }),
  reserve: () => Promise.reject(unreachableError()),
};

const nullLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

function unreachableError(): Error {
  return new Error("Unexpected repository call.");
}

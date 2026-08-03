import { describe, expect, it } from "vitest";
import {
  getSalesOrderDetails,
  listSalesOrderReadModel,
  type SalesOrderReadRepository,
} from "../../index.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const salesOrderId = "22222222-2222-4222-8222-222222222222";

describe("sales order read query use cases", () => {
  it("normalizes filters and preserves organization scope", async () => {
    const repository = new FakeSalesOrderReadRepository();

    await listSalesOrderReadModel(repository, {
      organizationId,
      order: "OLDEST",
      search: "  SO-42  ",
      status: "RESERVED",
    });

    expect(repository.listInput).toEqual({
      cursor: undefined,
      order: "OLDEST",
      organizationId,
      pageSize: 25,
      search: "SO-42",
      status: "RESERVED",
    });
  });

  it("rejects invalid pagination and identifiers", async () => {
    const repository = new FakeSalesOrderReadRepository();
    expect(() =>
      listSalesOrderReadModel(repository, {
        organizationId,
        pageSize: 101,
      }),
    ).toThrow("pageSize must be between");
    await expect(
      getSalesOrderDetails(repository, {
        organizationId: "wrong",
        salesOrderId,
      }),
    ).rejects.toThrow("organizationId must be a valid UUID");
  });

  it("uses safe not-found behavior for another organization", async () => {
    const repository = new FakeSalesOrderReadRepository();
    await expect(
      getSalesOrderDetails(repository, { organizationId, salesOrderId }),
    ).rejects.toThrow("Sales order was not found");
    expect(repository.detailsInput).toEqual({ organizationId, salesOrderId });
  });
});

class FakeSalesOrderReadRepository implements SalesOrderReadRepository {
  detailsInput?: Parameters<SalesOrderReadRepository["getDetails"]>[0];
  listInput?: Parameters<SalesOrderReadRepository["list"]>[0];

  getDetails(input: Parameters<SalesOrderReadRepository["getDetails"]>[0]) {
    this.detailsInput = input;
    return Promise.resolve(null);
  }

  list(input: Parameters<SalesOrderReadRepository["list"]>[0]) {
    this.listInput = input;
    return Promise.resolve({ hasMore: false, items: [], nextCursor: null });
  }
}

/* eslint-disable @typescript-eslint/require-await -- In-memory test repositories mirror async production repository contracts. */
import { describe, expect, it } from "vitest";
import {
  encodeCursor,
  getBranchById,
  getPosCounterById,
  getStockLocationById,
  listBranches,
  listPosCounters,
  listStockLocations,
  parseCursor,
} from "../application/read-use-cases.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import type {
  BranchListFilter,
  BranchRepository,
  CreateBranchRecord,
  CreatePosCounterRecord,
  CreateStockLocationRecord,
  PosCounterRepository,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";

describe("organization operation read use cases", () => {
  it("gets records by id within organization and hides cross-organization records", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch({ organizationId: orgA });
    const otherBranch = repositories.seedBranch({ organizationId: orgB });
    const location = repositories.seedLocation(branch.id, {
      organizationId: orgA,
    });
    const counter = repositories.seedCounter(branch.id, {
      organizationId: orgA,
    });

    await expect(
      getBranchById(repositories.branches, {
        branchId: branch.id,
        organizationId: orgA,
      }),
    ).resolves.toMatchObject({ id: branch.id, version: 1 });
    await expect(
      getBranchById(repositories.branches, {
        branchId: otherBranch.id,
        organizationId: orgA,
      }),
    ).rejects.toThrow("Branch was not found");
    await expect(
      getStockLocationById(repositories.stockLocations, {
        organizationId: orgA,
        stockLocationId: location.id,
      }),
    ).resolves.toMatchObject({ id: location.id });
    await expect(
      getPosCounterById(repositories.posCounters, {
        organizationId: orgA,
        posCounterId: counter.id,
      }),
    ).resolves.toMatchObject({ id: counter.id });
  });

  it("normalizes branch filters, search, default page size, and archived visibility", async () => {
    const repositories = createInMemoryRepositories();
    repositories.seedBranch({
      code: "MAIN",
      name: "Main Showroom",
      organizationId: orgA,
      status: "ACTIVE",
      type: "SHOWROOM",
    });
    repositories.seedBranch({
      code: "ARCHIVE",
      name: "Archived Branch",
      organizationId: orgA,
      status: "ARCHIVED",
      type: "WAREHOUSE",
    });

    const defaultResult = await listBranches(repositories.branches, {
      organizationId: orgA,
      search: "   ",
    });
    expect(defaultResult.items.map((branch) => branch.code)).toEqual(["MAIN"]);
    expect(repositories.lastBranchFilter).toMatchObject({
      organizationId: orgA,
      pageSize: 25,
      search: undefined,
    });

    const archived = await listBranches(repositories.branches, {
      organizationId: orgA,
      status: "ARCHIVED",
      type: "WAREHOUSE",
    });
    expect(archived.items.map((branch) => branch.code)).toEqual(["ARCHIVE"]);
  });

  it("filters locations and counters by branch, status, type, sellability, name, and code", async () => {
    const repositories = createInMemoryRepositories();
    const firstBranch = repositories.seedBranch({ organizationId: orgA });
    const secondBranch = repositories.seedBranch({ organizationId: orgA });
    repositories.seedLocation(firstBranch.id, {
      code: "FLOOR",
      isSellable: true,
      name: "Showroom Floor",
      organizationId: orgA,
      status: "ACTIVE",
      type: "SHOWROOM",
    });
    repositories.seedLocation(secondBranch.id, {
      code: "HOLD",
      isSellable: false,
      name: "Hold Area",
      organizationId: orgA,
      type: "QC_HOLD",
    });
    repositories.seedCounter(firstBranch.id, {
      code: "COUNTER-1",
      name: "Front Counter",
      organizationId: orgA,
      status: "ACTIVE",
    });
    repositories.seedCounter(secondBranch.id, {
      code: "BACK",
      name: "Back Counter",
      organizationId: orgA,
      status: "INACTIVE",
    });

    const locations = await listStockLocations(repositories.stockLocations, {
      branchId: firstBranch.id,
      isSellable: true,
      organizationId: orgA,
      search: "floor",
      status: "ACTIVE",
      type: "SHOWROOM",
    });
    expect(locations.items.map((location) => location.code)).toEqual(["FLOOR"]);

    const counters = await listPosCounters(repositories.posCounters, {
      branchId: firstBranch.id,
      organizationId: orgA,
      search: "counter-1",
      status: "ACTIVE",
    });
    expect(counters.items.map((counter) => counter.code)).toEqual([
      "COUNTER-1",
    ]);
  });

  it("rejects oversized page requests and invalid cursors", async () => {
    const repositories = createInMemoryRepositories();
    await expect(
      listBranches(repositories.branches, {
        organizationId: orgA,
        pageSize: 101,
      }),
    ).rejects.toThrow("pageSize");
    await expect(
      listBranches(repositories.branches, {
        cursor: "not-a-cursor",
        organizationId: orgA,
      }),
    ).rejects.toThrow("cursor");
  });

  it("paginates deterministically without duplicates or gaps", async () => {
    const repositories = createInMemoryRepositories();
    const createdAt = new Date("2026-07-02T00:00:00.000Z");
    const ids = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ];
    for (const [index, id] of ids.entries()) {
      repositories.seedBranch({
        code: `BRANCH-${index}`,
        createdAt,
        id,
        organizationId: orgA,
      });
    }

    const firstPage = await listBranches(repositories.branches, {
      organizationId: orgA,
      pageSize: 2,
    });
    expect(firstPage).toMatchObject({ hasMore: true });
    expect(firstPage.items.map((branch) => branch.id)).toEqual(ids.slice(0, 2));
    expect(firstPage.nextCursor).toBe(
      encodeCursor(createdAt, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    );
    expect(parseCursor(firstPage.nextCursor ?? "")).toMatchObject({
      id: ids[1],
    });

    const secondPage = await listBranches(repositories.branches, {
      cursor: firstPage.nextCursor ?? undefined,
      organizationId: orgA,
      pageSize: 2,
    });
    expect(secondPage).toMatchObject({ hasMore: false, nextCursor: null });
    expect(secondPage.items.map((branch) => branch.id)).toEqual([ids[2]]);
  });

  it("returns empty isolated results when no organization records match", async () => {
    const repositories = createInMemoryRepositories();
    repositories.seedBranch({ organizationId: orgB });
    repositories.seedLocation(
      repositories.seedBranch({ organizationId: orgB }).id,
      {
        organizationId: orgB,
      },
    );
    repositories.seedCounter(
      repositories.seedBranch({ organizationId: orgB }).id,
      {
        organizationId: orgB,
      },
    );

    await expect(
      listBranches(repositories.branches, { organizationId: orgA }),
    ).resolves.toMatchObject({ hasMore: false, items: [], nextCursor: null });
    await expect(
      listStockLocations(repositories.stockLocations, { organizationId: orgA }),
    ).resolves.toMatchObject({ hasMore: false, items: [], nextCursor: null });
    await expect(
      listPosCounters(repositories.posCounters, { organizationId: orgA }),
    ).resolves.toMatchObject({ hasMore: false, items: [], nextCursor: null });
  });
});

function createInMemoryRepositories() {
  const now = () => new Date("2026-07-02T00:00:00.000Z");
  let nextId = 1;
  const branches: Branch[] = [];
  const stockLocations: StockLocation[] = [];
  const posCounters: PosCounter[] = [];
  const id = () =>
    `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
  const state: {
    lastBranchFilter?: BranchListFilter;
  } = {};

  const branchesRepository: BranchRepository = {
    create: async (record: CreateBranchRecord) => {
      const branch = {
        ...record,
        createdAt: now(),
        id: id(),
        updatedAt: now(),
        version: 1,
      };
      branches.push(branch);
      return branch;
    },
    countChildrenByStatuses: async () => ({
      posCounters: 0,
      stockLocations: 0,
    }),
    findByCode: async (organizationId: string, code: string) =>
      branches.find(
        (branch) =>
          branch.organizationId === organizationId && branch.code === code,
      ) ?? null,
    findById: async (branchId: string, organizationId?: string) =>
      branches.find(
        (branch) =>
          branch.id === branchId &&
          (organizationId === undefined ||
            branch.organizationId === organizationId),
      ) ?? null,
    list: async (filter) => {
      state.lastBranchFilter = filter;
      return pageRecords(
        branches.filter(
          (branch) =>
            branch.organizationId === filter.organizationId &&
            matchesDefaultArchivedPolicy(branch.status, filter.status) &&
            (filter.type === undefined || branch.type === filter.type) &&
            matchesSearch(branch, filter.search),
        ),
        filter,
      );
    },
    changeStatus: async () => null,
    updateMetadata: async () => null,
  };

  const stockLocationsRepository: StockLocationRepository = {
    create: async (record: CreateStockLocationRecord) => {
      const location = {
        ...record,
        createdAt: now(),
        id: id(),
        updatedAt: now(),
        version: 1,
      };
      stockLocations.push(location);
      return location;
    },
    findByCode: async (organizationId: string, code: string) =>
      stockLocations.find(
        (location) =>
          location.organizationId === organizationId && location.code === code,
      ) ?? null,
    findById: async (locationId: string, organizationId?: string) =>
      stockLocations.find(
        (location) =>
          location.id === locationId &&
          (organizationId === undefined ||
            location.organizationId === organizationId),
      ) ?? null,
    list: async (filter) =>
      pageRecords(
        stockLocations.filter(
          (location) =>
            location.organizationId === filter.organizationId &&
            matchesDefaultArchivedPolicy(location.status, filter.status) &&
            (filter.branchId === undefined ||
              location.branchId === filter.branchId) &&
            (filter.type === undefined || location.type === filter.type) &&
            (filter.isSellable === undefined ||
              location.isSellable === filter.isSellable) &&
            matchesSearch(location, filter.search),
        ),
        filter,
      ),
    changeStatus: async () => null,
    updateMetadata: async () => null,
  };

  const posCountersRepository: PosCounterRepository = {
    create: async (record: CreatePosCounterRecord) => {
      const counter = {
        ...record,
        createdAt: now(),
        id: id(),
        updatedAt: now(),
        version: 1,
      };
      posCounters.push(counter);
      return counter;
    },
    findByCode: async (organizationId: string, code: string) =>
      posCounters.find(
        (counter) =>
          counter.organizationId === organizationId && counter.code === code,
      ) ?? null,
    findById: async (counterId: string, organizationId?: string) =>
      posCounters.find(
        (counter) =>
          counter.id === counterId &&
          (organizationId === undefined ||
            counter.organizationId === organizationId),
      ) ?? null,
    list: async (filter) =>
      pageRecords(
        posCounters.filter(
          (counter) =>
            counter.organizationId === filter.organizationId &&
            matchesDefaultArchivedPolicy(counter.status, filter.status) &&
            (filter.branchId === undefined ||
              counter.branchId === filter.branchId) &&
            matchesSearch(counter, filter.search),
        ),
        filter,
      ),
    changeStatus: async () => null,
    updateMetadata: async () => null,
  };

  return {
    branches: branchesRepository,
    get lastBranchFilter() {
      return state.lastBranchFilter;
    },
    posCounters: posCountersRepository,
    seedBranch: (overrides: Partial<Branch> = {}) => {
      const branch = {
        addressLine1: null,
        addressLine2: null,
        city: null,
        code: `BRANCH-${nextId}`,
        countryCode: "BD",
        createdAt: now(),
        district: null,
        email: null,
        id: id(),
        name: "Main",
        organizationId: orgA,
        phone: null,
        postalCode: null,
        status: "ACTIVE",
        timezone: "Asia/Dhaka",
        type: "SHOWROOM",
        updatedAt: now(),
        version: 1,
        ...overrides,
      } satisfies Branch;
      branches.push(branch);
      return branch;
    },
    seedCounter: (branchId: string, overrides: Partial<PosCounter> = {}) => {
      const counter = {
        branchId,
        code: `COUNTER-${nextId}`,
        createdAt: now(),
        id: id(),
        name: "Counter",
        organizationId: orgA,
        status: "ACTIVE",
        updatedAt: now(),
        version: 1,
        ...overrides,
      } satisfies PosCounter;
      posCounters.push(counter);
      return counter;
    },
    seedLocation: (
      branchId: string,
      overrides: Partial<StockLocation> = {},
    ) => {
      const location = {
        branchId,
        code: `LOCATION-${nextId}`,
        createdAt: now(),
        id: id(),
        isSellable: false,
        name: "Location",
        organizationId: orgA,
        status: "ACTIVE",
        type: "WAREHOUSE",
        updatedAt: now(),
        version: 1,
        ...overrides,
      } satisfies StockLocation;
      stockLocations.push(location);
      return location;
    },
    stockLocations: stockLocationsRepository,
  };
}

function pageRecords<T extends { createdAt: Date; id: string }>(
  records: T[],
  filter: { cursor?: string; pageSize: number },
) {
  const cursor = filter.cursor ? parseCursor(filter.cursor) : undefined;
  const ordered = [...records].sort(compareCreatedAtThenId);
  const filtered = cursor
    ? ordered.filter(
        (record) =>
          record.createdAt > cursor.createdAt ||
          (record.createdAt.getTime() === cursor.createdAt.getTime() &&
            record.id > cursor.id),
      )
    : ordered;
  const items = filtered.slice(0, filter.pageSize);
  const hasMore = filtered.length > filter.pageSize;
  const lastItem = items.at(-1);
  return {
    hasMore,
    items,
    nextCursor:
      hasMore && lastItem
        ? encodeCursor(lastItem.createdAt, lastItem.id)
        : null,
  };
}

function compareCreatedAtThenId(
  left: { createdAt: Date; id: string },
  right: { createdAt: Date; id: string },
): number {
  return (
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function matchesDefaultArchivedPolicy(
  recordStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED",
  filterStatus?: "ACTIVE" | "INACTIVE" | "ARCHIVED",
): boolean {
  if (filterStatus) {
    return recordStatus === filterStatus;
  }
  return recordStatus !== "ARCHIVED";
}

function matchesSearch(
  record: { code: string; name: string },
  search?: string,
): boolean {
  if (!search) {
    return true;
  }
  const normalized = search.toLowerCase();
  return (
    record.name.toLowerCase().includes(normalized) ||
    record.code.toLowerCase().includes(normalized)
  );
}

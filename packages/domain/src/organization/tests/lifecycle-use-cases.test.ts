/* eslint-disable @typescript-eslint/require-await -- In-memory test repositories mirror async production repository contracts. */
import { describe, expect, it } from "vitest";
import {
  changeBranchStatus,
  changePosCounterStatus,
  changeStockLocationStatus,
  updateBranchMetadata,
  updatePosCounterMetadata,
  updateStockLocationMetadata,
} from "../application/lifecycle-use-cases.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import type {
  BranchRepository,
  CreateBranchRecord,
  CreatePosCounterRecord,
  CreateStockLocationRecord,
  PosCounterRepository,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

describe("organization operation lifecycle use cases", () => {
  it("allows active/inactive/archive transitions and rejects archived terminal changes", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch();

    const inactive = await changeBranchStatus(repositories.branches, {
      branchId: branch.id,
      expectedVersion: branch.version,
      organizationId: branch.organizationId,
      status: "INACTIVE",
    });
    expect(inactive).toMatchObject({ status: "INACTIVE", version: 2 });

    const active = await changeBranchStatus(repositories.branches, {
      branchId: branch.id,
      expectedVersion: inactive.version,
      organizationId: branch.organizationId,
      status: "ACTIVE",
    });
    expect(active).toMatchObject({ status: "ACTIVE", version: 3 });

    const archived = await changeBranchStatus(repositories.branches, {
      branchId: branch.id,
      expectedVersion: active.version,
      organizationId: branch.organizationId,
      status: "ARCHIVED",
    });
    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: branch.id,
        expectedVersion: archived.version,
        organizationId: branch.organizationId,
        status: "ACTIVE",
      }),
    ).rejects.toThrow("archived");
  });

  it("blocks branch deactivation and archive by child statuses without cascading children", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch();
    const location = repositories.seedLocation(branch.id, "ACTIVE");
    const counter = repositories.seedCounter(branch.id, "ACTIVE");

    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: branch.id,
        expectedVersion: branch.version,
        organizationId: branch.organizationId,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("stock locations and POS counters");

    repositories.setLocationStatus(location.id, "ARCHIVED");
    repositories.setCounterStatus(counter.id, "INACTIVE");
    await expect(
      changeBranchStatus(repositories.branches, {
        branchId: branch.id,
        expectedVersion: branch.version,
        organizationId: branch.organizationId,
        status: "ARCHIVED",
      }),
    ).rejects.toThrow("POS counters");

    repositories.setCounterStatus(counter.id, "ARCHIVED");
    const archived = await changeBranchStatus(repositories.branches, {
      branchId: branch.id,
      expectedVersion: branch.version,
      organizationId: branch.organizationId,
      status: "ARCHIVED",
    });

    expect(archived.status).toBe("ARCHIVED");
    expect(repositories.getLocation(location.id)?.status).toBe("ARCHIVED");
    expect(repositories.getCounter(counter.id)?.status).toBe("ARCHIVED");
  });

  it("keeps branch code immutable and supports optional field clearing", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch({
      email: "old@example.test",
      phone: "+880 1700-000000",
    });

    const updated = await updateBranchMetadata(repositories.branches, {
      branchId: branch.id,
      code: "NEW-CODE",
      email: null,
      expectedVersion: branch.version,
      name: " Main   Renamed ",
      organizationId: branch.organizationId,
    } as Parameters<typeof updateBranchMetadata>[1] & { code: string });

    expect(updated).toMatchObject({
      code: "MAIN",
      email: null,
      name: "Main Renamed",
      phone: "+880 1700-000000",
      version: 2,
    });
  });

  it("applies stock-location sellability rules and does not restore sellability on reactivation", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch();
    const location = repositories.seedLocation(branch.id, "ACTIVE", {
      isSellable: true,
      type: "SHOWROOM",
    });

    const inactive = await changeStockLocationStatus(
      repositories.stockLocations,
      {
        expectedVersion: location.version,
        organizationId: location.organizationId,
        status: "INACTIVE",
        stockLocationId: location.id,
      },
    );
    expect(inactive).toMatchObject({ isSellable: false, status: "INACTIVE" });

    const reactivated = await changeStockLocationStatus(
      repositories.stockLocations,
      {
        expectedVersion: inactive.version,
        organizationId: location.organizationId,
        status: "ACTIVE",
        stockLocationId: location.id,
      },
    );
    expect(reactivated).toMatchObject({ isSellable: false, status: "ACTIVE" });

    await expect(
      updateStockLocationMetadata(repositories.stockLocations, {
        expectedVersion: reactivated.version,
        isSellable: true,
        organizationId: location.organizationId,
        stockLocationId: location.id,
        type: "QC_HOLD",
      }),
    ).rejects.toThrow("cannot be sellable");

    const hold = await updateStockLocationMetadata(
      repositories.stockLocations,
      {
        expectedVersion: reactivated.version,
        organizationId: location.organizationId,
        stockLocationId: location.id,
        type: "TRANSIT",
      },
    );
    expect(hold).toMatchObject({ isSellable: false, type: "TRANSIT" });
  });

  it("keeps stock-location branch and POS-counter code immutable", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch();
    const location = repositories.seedLocation(branch.id, "ACTIVE");
    const counter = repositories.seedCounter(branch.id, "ACTIVE");

    const updatedLocation = await updateStockLocationMetadata(
      repositories.stockLocations,
      {
        branchId: "branch_other",
        expectedVersion: location.version,
        name: "Floor Renamed",
        organizationId: location.organizationId,
        stockLocationId: location.id,
      } as Parameters<typeof updateStockLocationMetadata>[1] & {
        branchId: string;
      },
    );
    const updatedCounter = await updatePosCounterMetadata(
      repositories.posCounters,
      {
        code: "COUNTER-2",
        expectedVersion: counter.version,
        name: "Counter Renamed",
        organizationId: counter.organizationId,
        posCounterId: counter.id,
      } as Parameters<typeof updatePosCounterMetadata>[1] & { code: string },
    );

    expect(updatedLocation).toMatchObject({
      branchId: branch.id,
      code: "FLOOR",
      name: "Floor Renamed",
    });
    expect(updatedCounter).toMatchObject({
      branchId: branch.id,
      code: "COUNTER-1",
      name: "Counter Renamed",
    });
  });

  it("rejects stale expected versions and cross-organization updates", async () => {
    const repositories = createInMemoryRepositories();
    const branch = repositories.seedBranch();
    const location = repositories.seedLocation(branch.id, "ACTIVE");
    const counter = repositories.seedCounter(branch.id, "ACTIVE");
    const originalBranchVersion = branch.version;

    await updateBranchMetadata(repositories.branches, {
      branchId: branch.id,
      expectedVersion: originalBranchVersion,
      name: "Updated Once",
      organizationId: branch.organizationId,
    });
    await expect(
      updateBranchMetadata(repositories.branches, {
        branchId: branch.id,
        expectedVersion: originalBranchVersion,
        name: "Stale Update",
        organizationId: branch.organizationId,
      }),
    ).rejects.toThrow("Expected version");

    await expect(
      updateStockLocationMetadata(repositories.stockLocations, {
        expectedVersion: location.version,
        name: "Wrong Org",
        organizationId: "org_other",
        stockLocationId: location.id,
      }),
    ).rejects.toThrow("same organization");

    await expect(
      changePosCounterStatus(repositories.posCounters, {
        expectedVersion: counter.version,
        organizationId: "org_other",
        posCounterId: counter.id,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("same organization");
  });
});

function createInMemoryRepositories() {
  const now = () => new Date("2026-07-02T00:00:00.000Z");
  let nextId = 1;
  const branches: Branch[] = [];
  const stockLocations: StockLocation[] = [];
  const posCounters: PosCounter[] = [];
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  const branchesRepository: BranchRepository = {
    create: async (record: CreateBranchRecord) => {
      const branch = {
        ...record,
        createdAt: now(),
        id: id("branch"),
        updatedAt: now(),
        version: 1,
      };
      branches.push(branch);
      return branch;
    },
    countChildrenByStatuses: async (
      organizationId: string,
      branchId: string,
      statuses: readonly Branch["status"][],
    ) => ({
      posCounters: posCounters.filter(
        (counter) =>
          counter.branchId === branchId &&
          counter.organizationId === organizationId &&
          statuses.includes(counter.status),
      ).length,
      stockLocations: stockLocations.filter(
        (location) =>
          location.branchId === branchId &&
          location.organizationId === organizationId &&
          statuses.includes(location.status),
      ).length,
    }),
    findByCode: async (organizationId: string, code: string) =>
      branches.find(
        (branch) =>
          branch.organizationId === organizationId && branch.code === code,
      ) ?? null,
    findById: async (branchId: string) =>
      branches.find((branch) => branch.id === branchId) ?? null,
    changeStatus: async (record) =>
      updateVersioned(branches, record, (branch) => {
        branch.status = record.status;
      }),
    updateMetadata: async (record) =>
      updateVersioned(branches, record, (branch) => {
        Object.assign(branch, record.metadata);
      }),
  };

  const stockLocationsRepository: StockLocationRepository = {
    create: async (record: CreateStockLocationRecord) => {
      const location = {
        ...record,
        createdAt: now(),
        id: id("location"),
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
    findById: async (locationId: string) =>
      stockLocations.find((location) => location.id === locationId) ?? null,
    changeStatus: async (record) =>
      updateVersioned(stockLocations, record, (location) => {
        location.isSellable = record.isSellable;
        location.status = record.status;
      }),
    updateMetadata: async (record) =>
      updateVersioned(stockLocations, record, (location) => {
        Object.assign(location, record.metadata);
      }),
  };

  const posCountersRepository: PosCounterRepository = {
    create: async (record: CreatePosCounterRecord) => {
      const counter = {
        ...record,
        createdAt: now(),
        id: id("counter"),
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
    findById: async (counterId: string) =>
      posCounters.find((counter) => counter.id === counterId) ?? null,
    changeStatus: async (record) =>
      updateVersioned(posCounters, record, (counter) => {
        counter.status = record.status;
      }),
    updateMetadata: async (record) =>
      updateVersioned(posCounters, record, (counter) => {
        Object.assign(counter, record.metadata);
      }),
  };

  return {
    branches: branchesRepository,
    getCounter: (counterId: string) =>
      posCounters.find((counter) => counter.id === counterId),
    getLocation: (locationId: string) =>
      stockLocations.find((location) => location.id === locationId),
    posCounters: posCountersRepository,
    seedBranch: (overrides: Partial<Branch> = {}) => {
      const branch = {
        addressLine1: null,
        addressLine2: null,
        city: null,
        code: "MAIN",
        countryCode: "BD",
        createdAt: now(),
        district: null,
        email: null,
        id: id("branch"),
        name: "Main",
        organizationId: "org_1",
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
    seedCounter: (
      branchId: string,
      status: PosCounter["status"],
      overrides: Partial<PosCounter> = {},
    ) => {
      const counter = {
        branchId,
        code: "COUNTER-1",
        createdAt: now(),
        id: id("counter"),
        name: "Counter 1",
        organizationId: "org_1",
        status,
        updatedAt: now(),
        version: 1,
        ...overrides,
      } satisfies PosCounter;
      posCounters.push(counter);
      return counter;
    },
    seedLocation: (
      branchId: string,
      status: StockLocation["status"],
      overrides: Partial<StockLocation> = {},
    ) => {
      const location = {
        branchId,
        code: "FLOOR",
        createdAt: now(),
        id: id("location"),
        isSellable: false,
        name: "Floor",
        organizationId: "org_1",
        status,
        type: "WAREHOUSE",
        updatedAt: now(),
        version: 1,
        ...overrides,
      } satisfies StockLocation;
      stockLocations.push(location);
      return location;
    },
    setCounterStatus: (counterId: string, status: PosCounter["status"]) => {
      const counter = posCounters.find((record) => record.id === counterId);
      if (counter) {
        counter.status = status;
      }
    },
    setLocationStatus: (
      locationId: string,
      status: StockLocation["status"],
    ) => {
      const location = stockLocations.find(
        (record) => record.id === locationId,
      );
      if (location) {
        location.status = status;
      }
    },
    stockLocations: stockLocationsRepository,
  };
}

function updateVersioned<
  T extends {
    id: string;
    organizationId: string;
    updatedAt: Date;
    version: number;
  },
>(
  records: T[],
  input: { expectedVersion: number; id: string; organizationId: string },
  apply: (record: T) => void,
): T | null {
  const record = records.find(
    (item) =>
      item.id === input.id &&
      item.organizationId === input.organizationId &&
      item.version === input.expectedVersion,
  );
  if (!record) {
    return null;
  }
  apply(record);
  record.updatedAt = new Date(record.updatedAt.getTime() + 1000);
  record.version += 1;
  return record;
}

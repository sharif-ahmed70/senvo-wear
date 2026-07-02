/* eslint-disable @typescript-eslint/require-await -- In-memory test repositories mirror async production repository contracts. */
import { describe, expect, it } from "vitest";
import { createOrganization } from "../../catalog/application/create-use-cases.js";
import type { Organization } from "../../catalog/domain/models.js";
import type {
  CreateOrganizationRecord,
  OrganizationRepository,
} from "../../catalog/repositories/catalog-repositories.js";
import {
  createBranch,
  createPosCounter,
  createStockLocation,
} from "../application/create-use-cases.js";
import type { Branch, PosCounter, StockLocation } from "../domain/models.js";
import type {
  BranchRepository,
  CreateBranchRecord,
  CreatePosCounterRecord,
  CreateStockLocationRecord,
  PosCounterRepository,
  StockLocationRepository,
} from "../repositories/organization-repositories.js";

describe("organization operation create use cases", () => {
  it("creates branch identity with normalized values and explicit defaults", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });

    const branch = await createBranch(repositories, {
      code: " main ",
      email: " ops@senvo.test ",
      name: " Main   Showroom ",
      organizationId: organization.id,
      phone: "+880 1700-000000",
    });

    expect(branch).toMatchObject({
      code: "MAIN",
      countryCode: "BD",
      email: "ops@senvo.test",
      name: "Main Showroom",
      status: "ACTIVE",
      timezone: "Asia/Dhaka",
      type: "SHOWROOM",
    });
  });

  it("rejects duplicate branch, stock location, and POS counter codes", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    const branch = await createBranch(repositories, {
      code: "MAIN",
      name: "Main",
      organizationId: organization.id,
    });

    await expect(
      createBranch(repositories, {
        code: "main",
        name: "Main Duplicate",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("Branch code already exists");

    await createStockLocation(repositories, {
      branchId: branch.id,
      code: "FLOOR",
      name: "Showroom Floor",
      organizationId: organization.id,
      type: "SHOWROOM",
    });
    await expect(
      createStockLocation(repositories, {
        branchId: branch.id,
        code: "floor",
        name: "Duplicate Floor",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("Stock location code already exists");

    await createPosCounter(repositories, {
      branchId: branch.id,
      code: "COUNTER-1",
      name: "Counter 1",
      organizationId: organization.id,
    });
    await expect(
      createPosCounter(repositories, {
        branchId: branch.id,
        code: "counter-1",
        name: "Duplicate Counter",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("POS counter code already exists");
  });

  it("rejects missing organization and missing branch references", async () => {
    const repositories = createInMemoryRepositories();

    await expect(
      createBranch(repositories, {
        code: "MAIN",
        name: "Main",
        organizationId: "missing-org",
      }),
    ).rejects.toThrow("Organization was not found");

    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });

    await expect(
      createStockLocation(repositories, {
        branchId: "missing-branch",
        code: "FLOOR",
        name: "Floor",
        organizationId: organization.id,
      }),
    ).rejects.toThrow("Branch was not found");
  });

  it("rejects cross-organization location and counter creation", async () => {
    const repositories = createInMemoryRepositories();
    const first = await createOrganization(repositories.organizations, {
      code: "ORG-A",
      name: "Org A",
    });
    const second = await createOrganization(repositories.organizations, {
      code: "ORG-B",
      name: "Org B",
    });
    const firstBranch = await createBranch(repositories, {
      code: "MAIN",
      name: "Main",
      organizationId: first.id,
    });

    await expect(
      createStockLocation(repositories, {
        branchId: firstBranch.id,
        code: "SECOND-FLOOR",
        name: "Second Floor",
        organizationId: second.id,
      }),
    ).rejects.toThrow("same organization");

    await expect(
      createPosCounter(repositories, {
        branchId: firstBranch.id,
        code: "SECOND-COUNTER",
        name: "Second Counter",
        organizationId: second.id,
      }),
    ).rejects.toThrow("same organization");
  });

  it("applies and validates stock location sellable defaults", async () => {
    const repositories = createInMemoryRepositories();
    const organization = await createOrganization(repositories.organizations, {
      code: "SENVO",
      name: "SENVO Wear",
    });
    const branch = await createBranch(repositories, {
      code: "MAIN",
      name: "Main",
      organizationId: organization.id,
    });

    const showroom = await createStockLocation(repositories, {
      branchId: branch.id,
      code: "FLOOR",
      name: "Showroom Floor",
      organizationId: organization.id,
      type: "SHOWROOM",
    });
    const qcHold = await createStockLocation(repositories, {
      branchId: branch.id,
      code: "QC-HOLD",
      name: "QC Hold",
      organizationId: organization.id,
      type: "QC_HOLD",
    });

    expect(showroom.isSellable).toBe(true);
    expect(qcHold.isSellable).toBe(false);
    await expect(
      createStockLocation(repositories, {
        branchId: branch.id,
        code: "DAMAGE",
        isSellable: true,
        name: "Damage Hold",
        organizationId: organization.id,
        type: "DAMAGE_HOLD",
      }),
    ).rejects.toThrow("cannot be sellable");
  });
});

function createInMemoryRepositories(): {
  branches: BranchRepository;
  organizations: OrganizationRepository;
  posCounters: PosCounterRepository;
  stockLocations: StockLocationRepository;
} {
  const now = () => new Date("2026-07-02T00:00:00.000Z");
  const organizations: Organization[] = [];
  const branches: Branch[] = [];
  const stockLocations: StockLocation[] = [];
  const posCounters: PosCounter[] = [];
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  return {
    branches: {
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
      findByCode: async (organizationId: string, code: string) =>
        branches.find(
          (branch) =>
            branch.organizationId === organizationId && branch.code === code,
        ) ?? null,
      findById: async (branchId: string) =>
        branches.find((branch) => branch.id === branchId) ?? null,
      list: async () => ({ hasMore: false, items: [], nextCursor: null }),
      changeStatus: async () => null,
      countChildrenByStatuses: async () => ({
        posCounters: 0,
        stockLocations: 0,
      }),
      updateMetadata: async () => null,
    },
    organizations: {
      create: async (record: CreateOrganizationRecord) => {
        const organization = {
          ...record,
          createdAt: now(),
          id: id("org"),
          updatedAt: now(),
        };
        organizations.push(organization);
        return organization;
      },
      findByCode: async (code: string) =>
        organizations.find((organization) => organization.code === code) ??
        null,
      findById: async (organizationId: string) =>
        organizations.find(
          (organization) => organization.id === organizationId,
        ) ?? null,
    },
    posCounters: {
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
      list: async () => ({ hasMore: false, items: [], nextCursor: null }),
      changeStatus: async () => null,
      updateMetadata: async () => null,
    },
    stockLocations: {
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
            location.organizationId === organizationId &&
            location.code === code,
        ) ?? null,
      findById: async (locationId: string) =>
        stockLocations.find((location) => location.id === locationId) ?? null,
      list: async () => ({ hasMore: false, items: [], nextCursor: null }),
      changeStatus: async () => null,
      updateMetadata: async () => null,
    },
  };
}

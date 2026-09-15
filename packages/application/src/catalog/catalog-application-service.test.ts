import { describe, expect, it } from "vitest";
import { colorContractSchema } from "@senvo/contracts";
import type {
  CatalogColorManagementRepository,
  CatalogListFilter,
  Color,
} from "@senvo/domain";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import { CatalogApplicationService } from "./catalog-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";

const context: ApplicationExecutionContext = {
  actorId: "77777777-7777-4777-8777-777777777777",
  actorType: "INTERNAL",
  authenticationState: "AUTHENTICATED",
  organizationId,
  role: "ADMIN",
  requestId: "req_catalog_test_1",
  source: "ADMIN",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

class InMemoryColorRepository implements CatalogColorManagementRepository {
  public receivedFilter: CatalogListFilter | null = null;
  public records: Color[] = [];

  list(filter: CatalogListFilter): Promise<Color[]> {
    this.receivedFilter = filter;
    return Promise.resolve(this.records);
  }

  create(): Promise<Color> {
    throw new Error("create is not implemented in stub");
  }

  findByCode(): Promise<Color | null> {
    throw new Error("findByCode is not implemented in stub");
  }

  findById(): Promise<Color | null> {
    throw new Error("findById is not implemented in stub");
  }

  findByNormalizedName(): Promise<Color | null> {
    throw new Error("findByNormalizedName is not implemented in stub");
  }

  updateStatus(): Promise<Color | null> {
    throw new Error("updateStatus is not implemented in stub");
  }
}

function createFailFastStub<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      throw new Error(`Unexpected call to ${name}.${String(prop)}`);
    },
  });
}

function createService(colorsRepo: CatalogColorManagementRepository) {
  return new CatalogApplicationService({
    barcodes: createFailFastStub("barcodes"),
    categories: createFailFastStub("categories"),
    collections: createFailFastStub("collections"),
    colors: colorsRepo,
    organizations: createFailFastStub("organizations"),
    products: createFailFastStub("products"),
    productVariants: createFailFastStub("productVariants"),
    sizes: createFailFastStub("sizes"),
  });
}

describe("CatalogApplicationService colors", () => {
  it("persisted color with hex #112233", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    const fixtureRecord: Color = {
      code: "CLR-HEX",
      createdAt: new Date("2026-09-15T12:00:00.000Z"),
      hexValue: "#112233",
      id: "10000000-0000-4000-8000-000000000001",
      name: "Test Color Hex",
      normalizedName: "test color",
      organizationId,
      status: "ACTIVE",
      updatedAt: new Date("2026-09-15T12:30:00.000Z"),
    };

    colorRepo.records = [fixtureRecord];
    const fixtureSnapshot = JSON.stringify(fixtureRecord);

    const result = await service.listColors(context, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected listColors to succeed");

    expect(result.data).toHaveLength(1);
    const color = result.data[0];
    expect(color).toBeDefined();
    if (!color) throw new Error("Expected color to be defined");

    const parsed = colorContractSchema.parse(color);

    const publicKeys = Object.keys(color).sort();
    const expectedKeys = [
      "code",
      "createdAt",
      "hexValue",
      "id",
      "name",
      "organizationId",
      "status",
      "updatedAt",
    ].sort();
    expect(publicKeys).toEqual(expectedKeys);

    expect(color).not.toHaveProperty("normalizedName");
    expect("normalizedName" in (color as Record<string, unknown>)).toBe(false);

    expect(parsed.hexValue).toBe("#112233");
    expect(typeof parsed.createdAt).toBe("string");
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(typeof parsed.updatedAt).toBe("string");
    expect(new Date(parsed.updatedAt).toISOString()).toBe(parsed.updatedAt);

    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
    expect(JSON.stringify(fixtureRecord)).toBe(fixtureSnapshot);
    expect(fixtureRecord.normalizedName).toBe("test color");
  });

  it("persisted color with hexValue null", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    const fixtureRecord: Color = {
      code: "CLR-NULL",
      createdAt: new Date("2026-09-15T12:00:00.000Z"),
      hexValue: null,
      id: "10000000-0000-4000-8000-000000000002",
      name: "Test Color Null Hex",
      normalizedName: "test color",
      organizationId,
      status: "ACTIVE",
      updatedAt: new Date("2026-09-15T12:30:00.000Z"),
    };

    colorRepo.records = [fixtureRecord];
    const fixtureSnapshot = JSON.stringify(fixtureRecord);

    const result = await service.listColors(context, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected listColors to succeed");

    expect(result.data).toHaveLength(1);
    const color = result.data[0];
    expect(color).toBeDefined();
    if (!color) throw new Error("Expected color to be defined");

    const parsed = colorContractSchema.parse(color);

    const publicKeys = Object.keys(color).sort();
    const expectedKeys = [
      "code",
      "createdAt",
      "hexValue",
      "id",
      "name",
      "organizationId",
      "status",
      "updatedAt",
    ].sort();
    expect(publicKeys).toEqual(expectedKeys);

    expect(color).not.toHaveProperty("normalizedName");
    expect("normalizedName" in (color as Record<string, unknown>)).toBe(false);

    expect(parsed.hexValue).toBeNull();
    expect(typeof parsed.createdAt).toBe("string");
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(typeof parsed.updatedAt).toBe("string");
    expect(new Date(parsed.updatedAt).toISOString()).toBe(parsed.updatedAt);

    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
    expect(JSON.stringify(fixtureRecord)).toBe(fixtureSnapshot);
    expect(fixtureRecord.normalizedName).toBe("test color");
  });

  it("empty repository list", async () => {
    const colorRepo = new InMemoryColorRepository();
    const service = createService(colorRepo);

    colorRepo.records = [];

    const result = await service.listColors(context, {});

    expect(result).toEqual({ ok: true, data: [] });
    expect(colorRepo.receivedFilter?.organizationId).toBe(organizationId);
  });
});

import { ConflictError, type Supplier } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  PrismaSupplierRepository,
  type SupplierPrismaClient,
} from "./supplier-repository.js";

class MockPrismaKnownError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("PrismaSupplierRepository", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const supplierId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  function createMockSupplier(overrides?: Partial<Supplier>): Supplier {
    return {
      address: "123 Commercial Area, Babubazar, Dhaka",
      code: "SUP-001",
      contactPerson: "Rahim Chowdhury",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      email: "rahim@babubazartextiles.com",
      id: supplierId,
      name: "Babubazar Textiles",
      notes: "Wholesale denim fabric supplier",
      organizationId: orgA,
      phone: "+8801711000000",
      status: "ACTIVE",
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      ...overrides,
    };
  }

  function createMockPrismaClient(): {
    client: SupplierPrismaClient;
    supplier: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  } {
    const supplier = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    };

    const client = {
      supplier: supplier as unknown as SupplierPrismaClient["supplier"],
    };

    return { client, supplier };
  }

  describe("create supplier", () => {
    it("successfully creates an active supplier with all provided fields", async () => {
      const mockRecord = createMockSupplier();
      const { client, supplier } = createMockPrismaClient();
      supplier.create.mockResolvedValue(mockRecord);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.create({
        address: "123 Commercial Area, Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@babubazartextiles.com",
        name: "Babubazar Textiles",
        notes: "Wholesale denim fabric supplier",
        organizationId: orgA,
        phone: "+8801711000000",
      });

      expect(supplier.create).toHaveBeenCalledWith({
        data: {
          address: "123 Commercial Area, Babubazar, Dhaka",
          code: "SUP-001",
          contactPerson: "Rahim Chowdhury",
          email: "rahim@babubazartextiles.com",
          name: "Babubazar Textiles",
          notes: "Wholesale denim fabric supplier",
          organizationId: orgA,
          phone: "+8801711000000",
          status: "ACTIVE",
        },
      });
      expect(result.id).toBe(supplierId);
      expect(result.status).toBe("ACTIVE");
      expect(result.code).toBe("SUP-001");
    });
  });

  describe("update supplier", () => {
    it("updates only provided fields scoped to the organization", async () => {
      const updatedRecord = createMockSupplier({
        name: "Babubazar Textiles Ltd.",
        phone: "+8801799999999",
      });
      const { client, supplier } = createMockPrismaClient();
      supplier.update.mockResolvedValue(updatedRecord);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.update({
        id: supplierId,
        name: "Babubazar Textiles Ltd.",
        organizationId: orgA,
        phone: "+8801799999999",
      });

      expect(supplier.update).toHaveBeenCalledWith({
        data: {
          name: "Babubazar Textiles Ltd.",
          phone: "+8801799999999",
        },
        where: {
          id_organizationId: {
            id: supplierId,
            organizationId: orgA,
          },
        },
      });
      expect(result?.name).toBe("Babubazar Textiles Ltd.");
      expect(result?.phone).toBe("+8801799999999");
    });

    it("returns null when supplier record does not exist (P2025)", async () => {
      const p2025Error = new MockPrismaKnownError(
        "Record to update not found.",
        "P2025",
      );
      const { client, supplier } = createMockPrismaClient();
      supplier.update.mockRejectedValue(p2025Error);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.update({
        id: "non-existent-id",
        name: "Updated Name",
        organizationId: orgA,
      });

      expect(result).toBeNull();
    });
  });

  describe("deactivate supplier", () => {
    it("soft-deactivates the supplier by setting status to INACTIVE without hard deleting", async () => {
      const deactivatedRecord = createMockSupplier({ status: "INACTIVE" });
      const { client, supplier } = createMockPrismaClient();
      supplier.update.mockResolvedValue(deactivatedRecord);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.deactivate(supplierId, orgA);

      expect(supplier.update).toHaveBeenCalledWith({
        data: {
          status: "INACTIVE",
        },
        where: {
          id_organizationId: {
            id: supplierId,
            organizationId: orgA,
          },
        },
      });
      expect(result?.status).toBe("INACTIVE");
    });
  });

  describe("tenant isolation", () => {
    it("prevents finding supplier belonging to another organization by id", async () => {
      const { client, supplier } = createMockPrismaClient();
      supplier.findFirst.mockResolvedValue(null);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.findById(supplierId, orgB);

      expect(supplier.findFirst).toHaveBeenCalledWith({
        where: { id: supplierId, organizationId: orgB },
      });
      expect(result).toBeNull();
    });

    it("prevents finding supplier belonging to another organization by code", async () => {
      const { client, supplier } = createMockPrismaClient();
      supplier.findUnique.mockResolvedValue(null);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.findByCode(orgB, "SUP-001");

      expect(supplier.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_code: {
            code: "SUP-001",
            organizationId: orgB,
          },
        },
      });
      expect(result).toBeNull();
    });

    it("scopes list queries strictly to the requested organization", async () => {
      const { client, supplier } = createMockPrismaClient();
      supplier.findMany.mockResolvedValue([createMockSupplier()]);

      const repository = new PrismaSupplierRepository(client);
      const result = await repository.list({
        organizationId: orgA,
        search: "Babubazar",
        status: "ACTIVE",
      });

      expect(supplier.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
        where: {
          OR: [
            { name: { contains: "Babubazar", mode: "insensitive" } },
            { code: { contains: "Babubazar", mode: "insensitive" } },
          ],
          organizationId: orgA,
          status: "ACTIVE",
        },
      });
      expect(result).toHaveLength(1);
    });

    it("prevents updating or deactivating a supplier from another organization", async () => {
      const p2025Error = new MockPrismaKnownError(
        "Record not found for target org.",
        "P2025",
      );
      const { client, supplier } = createMockPrismaClient();
      supplier.update.mockRejectedValue(p2025Error);

      const repository = new PrismaSupplierRepository(client);
      const updateResult = await repository.update({
        id: supplierId,
        name: "Hacked Name",
        organizationId: orgB,
      });

      expect(updateResult).toBeNull();

      const deactivateResult = await repository.deactivate(supplierId, orgB);
      expect(deactivateResult).toBeNull();
    });
  });

  describe("duplicate handling", () => {
    it("maps Prisma P2002 unique constraint error on create to ConflictError", async () => {
      const p2002Error = new MockPrismaKnownError(
        "Unique constraint failed on organizationId, code",
        "P2002",
      );
      const { client, supplier } = createMockPrismaClient();
      supplier.create.mockRejectedValue(p2002Error);

      const repository = new PrismaSupplierRepository(client);

      await expect(
        repository.create({
          code: "SUP-001",
          name: "Duplicate Supplier",
          organizationId: orgA,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("maps Prisma P2002 unique constraint error on update to ConflictError", async () => {
      const p2002Error = new MockPrismaKnownError(
        "Unique constraint failed on organizationId, code",
        "P2002",
      );
      const { client, supplier } = createMockPrismaClient();
      supplier.update.mockRejectedValue(p2002Error);

      const repository = new PrismaSupplierRepository(client);

      await expect(
        repository.update({
          code: "SUP-EXISTING",
          id: supplierId,
          organizationId: orgA,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});

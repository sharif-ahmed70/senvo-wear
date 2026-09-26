import {
  AuthorizationError,
  ConflictError,
  type Supplier,
  type SupplierRepository,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import { ProcurementApplicationService } from "./procurement-application-service.js";

describe("ProcurementApplicationService", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const otherOrgId = "22222222-2222-4222-8222-222222222222";
  const supplierId = "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa";

  const validContext: ApplicationExecutionContext = {
    organizationId: orgId,
    permissions: [
      { action: "CREATE", resource: "PROCUREMENT" },
      { action: "READ", resource: "PROCUREMENT" },
      { action: "UPDATE", resource: "PROCUREMENT" },
    ],
    requestId: "req-12345678",
    userId: "99999999-9999-4999-8999-999999999999",
  };

  function createMockSupplier(overrides?: Partial<Supplier>): Supplier {
    return {
      address: "Babubazar, Dhaka",
      code: "SUP-001",
      contactPerson: "Rahim Chowdhury",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      email: "rahim@supplier.test",
      id: supplierId,
      name: "Babubazar Textiles",
      notes: "Denim supplier",
      organizationId: orgId,
      phone: "+8801711000000",
      status: "ACTIVE",
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      ...overrides,
    };
  }

  function createMockRepository(): {
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } {
    return {
      create: vi.fn(),
      deactivate: vi.fn(),
      findByCode: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
    };
  }

  describe("createSupplier", () => {
    it("authorizes and creates a supplier for the organization", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.create.mockResolvedValue(mockSupplier);

      const authorizeMock = vi.fn().mockResolvedValue(undefined);
      const service = new ProcurementApplicationService({
        authorizationService: { authorize: authorizeMock },
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        address: "Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@supplier.test",
        name: "Babubazar Textiles",
        notes: "Denim supplier",
        phone: "+8801711000000",
      });

      expect(authorizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
        { action: "CREATE", resource: "PROCUREMENT" },
      );
      expect(repository.create).toHaveBeenCalledWith({
        address: "Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@supplier.test",
        name: "Babubazar Textiles",
        notes: "Denim supplier",
        organizationId: orgId,
        phone: "+8801711000000",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(supplierId);
        expect(result.data.code).toBe("SUP-001");
        expect(result.data.name).toBe("Babubazar Textiles");
      }
    });

    it("rejects when authorization fails", async () => {
      const repository = createMockRepository();
      const service = new ProcurementApplicationService({
        authorizationService: {
          authorize: vi
            .fn()
            .mockRejectedValue(new AuthorizationError("Denied")),
        },
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        code: "SUP-001",
        name: "Babubazar Textiles",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN");
      }
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("handles conflict error on duplicate supplier code", async () => {
      const repository = createMockRepository();
      repository.create.mockRejectedValue(
        new ConflictError("Supplier with this code already exists."),
      );

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        code: "SUP-001",
        name: "Babubazar Textiles",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CONFLICT");
      }
    });
  });

  describe("getSupplier", () => {
    it("returns supplier details when found", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(mockSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(validContext, {
        supplierId,
      });

      expect(repository.findById).toHaveBeenCalledWith(supplierId, orgId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(supplierId);
        expect(result.data.name).toBe("Babubazar Textiles");
      }
    });

    it("returns NOT_FOUND when supplier does not exist", async () => {
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("enforces tenant isolation by querying only the context organization", async () => {
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(
        { ...validContext, organizationId: otherOrgId },
        { supplierId },
      );

      expect(repository.findById).toHaveBeenCalledWith(supplierId, otherOrgId);
      expect(result.ok).toBe(false);
    });
  });

  describe("listSuppliers", () => {
    it("lists suppliers scoped to the organization with filters", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.list.mockResolvedValue([mockSupplier]);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.listSuppliers(validContext, {
        search: "Babubazar",
        status: "ACTIVE",
      });

      expect(repository.list).toHaveBeenCalledWith({
        organizationId: orgId,
        search: "Babubazar",
        status: "ACTIVE",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.name).toBe("Babubazar Textiles");
      }
    });
  });

  describe("updateSupplier", () => {
    it("updates supplier fields and returns updated contract", async () => {
      const updatedSupplier = createMockSupplier({
        name: "Babubazar Textiles Ltd.",
        phone: "+8801799999999",
      });
      const repository = createMockRepository();
      repository.update.mockResolvedValue(updatedSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.updateSupplier(validContext, {
        name: "Babubazar Textiles Ltd.",
        phone: "+8801799999999",
        supplierId,
      });

      expect(repository.update).toHaveBeenCalledWith({
        address: undefined,
        code: undefined,
        contactPerson: undefined,
        email: undefined,
        id: supplierId,
        name: "Babubazar Textiles Ltd.",
        notes: undefined,
        organizationId: orgId,
        phone: "+8801799999999",
        status: undefined,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe("Babubazar Textiles Ltd.");
        expect(result.data.phone).toBe("+8801799999999");
      }
    });

    it("returns NOT_FOUND when updating non-existent supplier", async () => {
      const repository = createMockRepository();
      repository.update.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.updateSupplier(validContext, {
        name: "Babubazar Textiles Ltd.",
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("deactivateSupplier", () => {
    it("soft-deactivates supplier and returns updated contract", async () => {
      const deactivatedSupplier = createMockSupplier({ status: "INACTIVE" });
      const repository = createMockRepository();
      repository.deactivate.mockResolvedValue(deactivatedSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.deactivateSupplier(validContext, {
        supplierId,
      });

      expect(repository.deactivate).toHaveBeenCalledWith(supplierId, orgId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("INACTIVE");
      }
    });

    it("returns NOT_FOUND when deactivating non-existent supplier", async () => {
      const repository = createMockRepository();
      repository.deactivate.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.deactivateSupplier(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });
});

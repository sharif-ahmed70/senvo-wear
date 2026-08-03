import {
  assignRolePermission,
  authorize,
  createPermission,
} from "@senvo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../index.js";
import {
  PrismaPermissionRepository,
  PrismaRolePermissionRepository,
} from "./repositories.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("Prisma authorization repositories", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: ReturnType<typeof createPrismaClient>;
  let permissions: PrismaPermissionRepository;
  let rolePermissions: PrismaRolePermissionRepository;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    prisma = createPrismaClient();
    permissions = new PrismaPermissionRepository(prisma);
    rolePermissions = new PrismaRolePermissionRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.posCheckoutRecord.deleteMany();
    await prisma.posCartLine.deleteMany();
    await prisma.posCart.deleteMany();
    await prisma.salesSession.deleteMany();
    await prisma.salesCounter.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.inventoryReservationLine.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovementLine.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryAllocationPolicyLocation.deleteMany();
    await prisma.inventoryAllocationPolicy.deleteMany();
    await prisma.productCollection.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.category.deleteMany();
    await prisma.color.deleteMany();
    await prisma.size.deleteMany();
    await prisma.posCounter.deleteMany();
    await prisma.stockLocation.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.auditEntry.deleteMany();
    await prisma.userCredential.deleteMany();
    await prisma.organizationMembership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("enforces unique permissions and role mappings", async () => {
    const permission = await createPermission(permissions, {
      action: "CREATE",
      resource: "SALES_ORDER",
    });
    expect(permission).toMatchObject({
      action: "CREATE",
      resource: "SALES_ORDER",
      status: "ACTIVE",
    });

    await expect(
      createPermission(permissions, {
        action: "CREATE",
        resource: "SALES_ORDER",
      }),
    ).rejects.toThrow("Permission already exists");

    const mapping = await assignRolePermission(
      { permissions, rolePermissions },
      { permissionId: permission.id, role: "ADMIN" },
    );
    expect(mapping).toMatchObject({
      permissionId: permission.id,
      role: "ADMIN",
      status: "ACTIVE",
    });
    await expect(
      assignRolePermission(
        { permissions, rolePermissions },
        { permissionId: permission.id, role: "ADMIN" },
      ),
    ).rejects.toThrow("Role permission already exists");
  });

  it("lists active permissions by role for authorization", async () => {
    const permission = await createPermission(permissions, {
      action: "FULFILL",
      resource: "INVENTORY",
    });
    await assignRolePermission(
      { permissions, rolePermissions },
      { permissionId: permission.id, role: "MANAGER" },
    );

    await expect(
      rolePermissions.listActivePermissionsByRole("MANAGER"),
    ).resolves.toEqual([expect.objectContaining({ action: "FULFILL" })]);
  });

  it("keeps restrictive deletes for mapped permissions", async () => {
    const permission = await createPermission(permissions, {
      action: "READ",
      resource: "REPORT",
    });
    const mapping = await assignRolePermission(
      { permissions, rolePermissions },
      { permissionId: permission.id, role: "OWNER" },
    );

    await expect(
      prisma.permission.delete({ where: { id: permission.id } }),
    ).rejects.toThrow();

    await prisma.rolePermission.delete({ where: { id: mapping.id } });
    await prisma.permission.delete({ where: { id: permission.id } });
  });

  it("can supply data-driven role permissions to authorization", async () => {
    const organization = await prisma.organization.create({
      data: { code: "ORG-A", name: "Org A" },
    });
    const user = await prisma.user.create({
      data: { email: "manager@senvo.test" },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        role: "MANAGER",
        userId: user.id,
      },
    });
    const permission = await createPermission(permissions, {
      action: "FULFILL",
      resource: "INVENTORY",
    });
    await assignRolePermission(
      { permissions, rolePermissions },
      { permissionId: permission.id, role: "MANAGER" },
    );

    await expect(
      authorize(
        {
          memberships: {
            assignRole: () => Promise.resolve(null),
            changeStatus: () => Promise.resolve(null),
            create: () => Promise.reject(new Error("not needed")),
            findById: () => Promise.resolve(null),
            findByUserAndOrganization: async (id, orgId) => {
              const record = await prisma.organizationMembership.findUnique({
                where: {
                  userId_organizationId: {
                    organizationId: orgId,
                    userId: id,
                  },
                },
              });
              return record;
            },
          },
          rolePermissions,
          users: {
            create: () => Promise.reject(new Error("not needed")),
            findByEmail: () => Promise.resolve(null),
            findById: async (id) => prisma.user.findUnique({ where: { id } }),
          },
        },
        {
          context: {
            organizationId: organization.id,
            role: "MANAGER",
            userId: user.id,
          },
          permission: { action: "FULFILL", resource: "INVENTORY" },
        },
      ),
    ).resolves.toMatchObject({ allowed: true, role: "MANAGER" });
  });
});

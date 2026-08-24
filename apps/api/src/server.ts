import {
  createCatalogApiHandlers,
  createCommerceApiHandlers,
  createInventoryReadApiHandlers,
  createOnlinePaymentApiHandlers,
  createOrganizationManagementApiHandlers,
  createPosApiHandlers,
  createReportingApiHandlers,
  createPostInventoryMovementApiHandler,
  createSalesOrderApiHandler,
  createSalesOrderManagementApiHandlers,
  createSalesSourceApiHandlers,
  createStorefrontApiHandlers,
} from "@senvo/api";
import {
  AuthenticationSessionApplicationService,
  createApplicationServices,
  type ApplicationAuthenticationService,
  type ApplicationAuthorizationService,
} from "@senvo/application";
import {
  PrismaAuthenticationSessionRepository,
  PrismaOrganizationMembershipRepository,
  PrismaOrganizationRepository,
  PrismaRolePermissionRepository,
  PrismaUserCredentialRepository,
  PrismaUserRepository,
  createPrismaClient,
} from "@senvo/database";
import { AuthenticationError, authorize } from "@senvo/domain";
import {
  ProductionSessionRequestContextFactory,
  ScryptPasswordHasher,
  createSenvoHttpServer,
} from "@senvo/http";
import {
  LocalFileObjectStorageProvider,
  S3CompatibleObjectStorageProvider,
  loadS3CompatibleStorageConfig,
} from "@senvo/storage";

const prisma = createPrismaClient();
const users = new PrismaUserRepository(prisma);
const memberships = new PrismaOrganizationMembershipRepository(prisma);
const organizations = new PrismaOrganizationRepository(prisma);
const rolePermissions = new PrismaRolePermissionRepository(prisma);
const sessionService = new AuthenticationSessionApplicationService({
  credentials: new PrismaUserCredentialRepository(prisma),
  memberships,
  organizations,
  passwordHasher: new ScryptPasswordHasher(),
  rolePermissions,
  sessions: new PrismaAuthenticationSessionRepository(prisma),
  users,
});

const authenticationService: ApplicationAuthenticationService = {
  authenticate(request) {
    if (!request.userId) {
      return Promise.reject(
        new AuthenticationError("Authentication is required."),
      );
    }
    return Promise.resolve({
      authenticatedUserId: request.userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    });
  },
};

const authorizationService: ApplicationAuthorizationService = {
  async authorize(context, permission) {
    await authorize(
      { memberships, rolePermissions, users },
      {
        context: {
          organizationId: context.organizationId,
          permissions: context.permissions,
          role: context.role ?? undefined,
          userId: context.userId ?? "",
        },
        permission,
      },
    );
  },
};

const services = createApplicationServices({
  authenticationService,
  authorizationService,
  prismaClient: prisma,
  storageProvider:
    process.env.NODE_ENV === "production"
      ? new S3CompatibleObjectStorageProvider(
          loadS3CompatibleStorageConfig(process.env),
        )
      : new LocalFileObjectStorageProvider(
          process.env.MEDIA_STORAGE_ROOT ?? ".senvo-media",
        ),
});

const security = { authenticationService, authorizationService };
const handlers = {
  catalog: createCatalogApiHandlers({ catalog: services.catalog, ...security }),
  commerce: createCommerceApiHandlers({
    application: services.commerce,
    ...security,
  }),
  createSalesOrder: createSalesOrderApiHandler({
    sales: services.sales,
    ...security,
  }),
  inventoryRead: createInventoryReadApiHandlers({
    inventory: services.inventory,
    ...security,
  }),
  organizationManagement: createOrganizationManagementApiHandlers({
    organization: services.organization,
    ...security,
  }),
  onlinePayments: services.onlinePayments
    ? createOnlinePaymentApiHandlers({
        application: services.onlinePayments,
        ...security,
      })
    : undefined,
  reporting: createReportingApiHandlers({
    application: services.reporting,
    ...security,
  }),
  pos: createPosApiHandlers({ pos: services.pos, ...security }),
  postInventoryMovement: createPostInventoryMovementApiHandler({
    inventory: services.inventory,
    ...security,
  }),
  salesManagement: createSalesOrderManagementApiHandlers({
    sales: services.sales,
    ...security,
  }),
  salesSource: createSalesSourceApiHandlers({
    sales: services.sales,
    ...security,
  }),
  storefront: createStorefrontApiHandlers(services.storefront),
};

const port = positivePort(process.env.PORT ?? "4000");
const allowedOrigins = (process.env.SENVO_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("SENVO_ALLOWED_ORIGINS is required in production.");
}

const server = createSenvoHttpServer({
  allowedOrigins,
  contextFactory: new ProductionSessionRequestContextFactory(sessionService),
  handlers,
  sessions: sessionService,
  secureSessionCookie: process.env.NODE_ENV === "production",
});

server.listen(port, () => {
  process.stdout.write(`SENVO API listening on port ${port}.\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void Promise.all([services.disconnect(), prisma.$disconnect()]).finally(
        () => process.exit(0),
      );
    });
  });
}

function positivePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  return parsed;
}

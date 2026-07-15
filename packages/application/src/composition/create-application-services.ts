import {
  PrismaAuditEntryRepository,
  PrismaInventoryMovementRepository,
  PrismaSalesOrderRepository,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import {
  RepositoryAuditWriter,
  type AuditWriter,
  type InventoryMovementRepository,
  type SalesOrderRepository,
} from "@senvo/domain";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import type { ApplicationAuthenticationService } from "../context/authentication.js";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import { InventoryApplicationService } from "../inventory/inventory-application-service.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";

type PrismaClientHandle = ReturnType<typeof createPrismaClient>;

export type CreateApplicationServicesOptions = {
  auditWriter?: AuditWriter;
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  inventoryMovementRepository?: InventoryMovementRepository;
  logger?: Logger;
  prismaClient?: PrismaClientHandle;
  requestIdGenerator?: () => string;
  salesOrderRepository?: SalesOrderRepository;
  useSharedPrismaClient?: boolean;
};

export type ApplicationServices = {
  disconnect(): Promise<void>;
  inventory: InventoryApplicationService;
  sales: SalesApplicationService;
};

export function createApplicationServices(
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  const logger = options.logger ?? createConsoleLogger("application");
  const clock = options.clock ?? systemClock;
  let ownsPrismaClient = false;
  let prismaClient = options.prismaClient;
  let inventoryMovementRepository = options.inventoryMovementRepository;
  let salesOrderRepository = options.salesOrderRepository;
  let auditWriter = options.auditWriter;

  if (!salesOrderRepository || !inventoryMovementRepository || !auditWriter) {
    if (!prismaClient) {
      const useSharedPrismaClient =
        options.useSharedPrismaClient ?? process.env.NODE_ENV !== "production";
      prismaClient = useSharedPrismaClient
        ? getPrismaClient()
        : createPrismaClient();
      ownsPrismaClient = !useSharedPrismaClient;
    }
  }

  if (!inventoryMovementRepository) {
    inventoryMovementRepository = new PrismaInventoryMovementRepository(
      requirePrismaClient(prismaClient),
    );
  }

  if (!salesOrderRepository) {
    salesOrderRepository = new PrismaSalesOrderRepository(
      requirePrismaClient(prismaClient),
    );
  }

  if (!auditWriter && prismaClient) {
    auditWriter = new RepositoryAuditWriter(
      new PrismaAuditEntryRepository(requirePrismaClient(prismaClient)),
    );
  }

  if (!auditWriter) {
    throw new Error("Audit writer is required for application services.");
  }

  return {
    disconnect: async () => {
      if (ownsPrismaClient) {
        await prismaClient?.$disconnect();
      }
    },
    inventory: new InventoryApplicationService({
      auditWriter,
      authorizationService: options.authorizationService,
      clock,
      inventoryMovementRepository,
      logger,
      requestIdGenerator: options.requestIdGenerator,
    }),
    sales: new SalesApplicationService({
      auditWriter,
      authenticationService: options.authenticationService,
      authorizationService: options.authorizationService,
      clock,
      logger,
      requestIdGenerator: options.requestIdGenerator,
      salesOrderRepository,
    }),
  };
}

function requirePrismaClient(
  prismaClient: PrismaClientHandle | undefined,
): PrismaClientHandle {
  if (!prismaClient) {
    throw new Error("Prisma client is required for default repositories.");
  }
  return prismaClient;
}

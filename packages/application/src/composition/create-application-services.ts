import {
  PrismaInventoryMovementRepository,
  PrismaSalesOrderRepository,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import type {
  InventoryMovementRepository,
  SalesOrderRepository,
} from "@senvo/domain";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import { InventoryApplicationService } from "../inventory/inventory-application-service.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";

type PrismaClientHandle = ReturnType<typeof createPrismaClient>;

export type CreateApplicationServicesOptions = {
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

  if (!salesOrderRepository || !inventoryMovementRepository) {
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

  return {
    disconnect: async () => {
      if (ownsPrismaClient) {
        await prismaClient?.$disconnect();
      }
    },
    inventory: new InventoryApplicationService({
      authorizationService: options.authorizationService,
      clock,
      inventoryMovementRepository,
      logger,
      requestIdGenerator: options.requestIdGenerator,
    }),
    sales: new SalesApplicationService({
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

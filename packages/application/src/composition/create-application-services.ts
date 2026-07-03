import {
  PrismaSalesOrderRepository,
  createPrismaClient,
  getPrismaClient,
} from "@senvo/database";
import type { SalesOrderRepository } from "@senvo/domain";
import { createConsoleLogger, type Logger } from "@senvo/logger";
import { systemClock, type Clock } from "../context/clock.js";
import { SalesApplicationService } from "../sales/sales-application-service.js";

type PrismaClientHandle = ReturnType<typeof createPrismaClient>;

export type CreateApplicationServicesOptions = {
  clock?: Clock;
  logger?: Logger;
  prismaClient?: PrismaClientHandle;
  requestIdGenerator?: () => string;
  salesOrderRepository?: SalesOrderRepository;
  useSharedPrismaClient?: boolean;
};

export type ApplicationServices = {
  disconnect(): Promise<void>;
  sales: SalesApplicationService;
};

export function createApplicationServices(
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  const logger = options.logger ?? createConsoleLogger("application");
  const clock = options.clock ?? systemClock;
  let ownsPrismaClient = false;
  let prismaClient = options.prismaClient;
  let salesOrderRepository = options.salesOrderRepository;

  if (!salesOrderRepository) {
    if (!prismaClient) {
      const useSharedPrismaClient =
        options.useSharedPrismaClient ?? process.env.NODE_ENV !== "production";
      prismaClient = useSharedPrismaClient
        ? getPrismaClient()
        : createPrismaClient();
      ownsPrismaClient = !useSharedPrismaClient;
    }
    salesOrderRepository = new PrismaSalesOrderRepository(prismaClient);
  }

  return {
    disconnect: async () => {
      if (ownsPrismaClient) {
        await prismaClient?.$disconnect();
      }
    },
    sales: new SalesApplicationService({
      clock,
      logger,
      requestIdGenerator: options.requestIdGenerator,
      salesOrderRepository,
    }),
  };
}

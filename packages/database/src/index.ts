import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getRuntimeDatabaseUrl } from "./environment.js";

type GlobalWithPrisma = typeof globalThis & {
  __senvoPrisma?: PrismaClient;
};

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getRuntimeDatabaseUrl(process.env),
  });

  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as GlobalWithPrisma;

  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  globalForPrisma.__senvoPrisma ??= createPrismaClient();
  return globalForPrisma.__senvoPrisma;
}

export {
  PrismaCategoryRepository,
  PrismaCollectionRepository,
  PrismaColorRepository,
  PrismaOrganizationRepository,
  PrismaProductRepository,
  PrismaProductVariantRepository,
  PrismaSizeRepository,
} from "./catalog/repositories.js";
export {
  PrismaBranchRepository,
  PrismaPosCounterRepository,
  PrismaStockLocationRepository,
} from "./organization/repositories.js";
export {
  PrismaInventoryAvailabilityQueryRepository,
  PrismaInventoryBalanceQueryRepository,
  PrismaInventoryMovementRepository,
  PrismaInventoryReservationRepository,
} from "./inventory/repositories.js";

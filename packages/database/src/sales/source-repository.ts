import {
  ConcurrencyError,
  type CreateSalesBoothRecord,
  type SalesBooth,
  type SalesChannel,
  type SalesSourceRepository,
  type SalesSourceSummary,
} from "@senvo/domain";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type SalesSourcePrismaClient = Pick<PrismaClient, "salesBooth" | "salesOrder">;
type BoothRecord = Prisma.SalesBoothGetPayload<{
  include: { responsibleStaff: { select: { name: true } } };
}>;

const boothInclude = {
  responsibleStaff: { select: { name: true } },
} as const;

const canonicalChannels: readonly SalesChannel[] = [
  "ONLINE",
  "OFFLINE_STORE",
  "EVENT_BOOTH",
];

export class PrismaSalesSourceRepository implements SalesSourceRepository {
  constructor(private readonly prisma: SalesSourcePrismaClient) {}

  async createBooth(record: CreateSalesBoothRecord): Promise<SalesBooth> {
    return mapBooth(
      await this.prisma.salesBooth.create({
        data: record,
        include: boothInclude,
      }),
    );
  }

  async findBoothById(
    id: string,
    organizationId: string,
  ): Promise<SalesBooth | null> {
    const booth = await this.prisma.salesBooth.findFirst({
      include: boothInclude,
      where: { id, organizationId },
    });
    return booth ? mapBooth(booth) : null;
  }

  async listBooths(organizationId: string): Promise<SalesBooth[]> {
    const booths = await this.prisma.salesBooth.findMany({
      include: boothInclude,
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      where: { organizationId },
    });
    return booths.map(mapBooth);
  }

  async updateBoothStatus(
    record: Parameters<SalesSourceRepository["updateBoothStatus"]>[0],
  ): Promise<SalesBooth | null> {
    const result = await this.prisma.salesBooth.updateMany({
      data: { status: record.status, version: { increment: 1 } },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        version: record.expectedVersion,
      },
    });
    if (result.count === 0) {
      return null;
    }
    const booth = await this.findBoothById(record.id, record.organizationId);
    if (!booth) {
      throw new ConcurrencyError("Sales booth disappeared after update.");
    }
    return booth;
  }

  async getSummary(organizationId: string): Promise<SalesSourceSummary> {
    const [booths, channelRows, boothRows, legacyOrderCount] =
      await Promise.all([
        this.listBooths(organizationId),
        this.prisma.salesOrder.groupBy({
          _count: { _all: true },
          _sum: { totalMinor: true },
          by: ["channel"],
          where: {
            channel: { in: [...canonicalChannels] },
            organizationId,
          },
        }),
        this.prisma.salesOrder.groupBy({
          _count: { _all: true },
          _sum: { totalMinor: true },
          by: ["boothId"],
          where: { boothId: { not: null }, organizationId },
        }),
        this.prisma.salesOrder.count({
          where: { channel: { in: ["POS", "MANUAL"] }, organizationId },
        }),
      ]);
    const channels = canonicalChannels.map((salesChannel) => {
      const row = channelRows.find((item) => item.channel === salesChannel);
      return {
        orderCount: row?._count._all ?? 0,
        salesChannel,
        totalMinor: row?._sum.totalMinor ?? 0,
      };
    });
    const boothTotals = new Map(
      boothRows.map((row) => [
        row.boothId,
        { orderCount: row._count._all, totalMinor: row._sum.totalMinor ?? 0 },
      ]),
    );
    return {
      booths: booths.map((booth) => ({
        booth,
        ...(boothTotals.get(booth.id) ?? { orderCount: 0, totalMinor: 0 }),
      })),
      channels,
      legacyOrderCount,
    };
  }
}

function mapBooth(record: BoothRecord): SalesBooth {
  return {
    createdAt: record.createdAt,
    endDate: record.endDate,
    id: record.id,
    location: record.location,
    name: record.name,
    organizationId: record.organizationId,
    responsibleStaffId: record.responsibleStaffId,
    responsibleStaffName: record.responsibleStaff.name,
    startDate: record.startDate,
    status: record.status,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

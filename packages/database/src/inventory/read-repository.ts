import {
  ValidationApplicationError,
  type InventoryAvailabilityReadItem,
  type InventoryMovementHistoryItem,
  type InventoryReadPage,
  type InventoryReadRepository,
  type InventoryVariantReadItem,
  type StockLocationReadItem,
  type VariantInventoryAvailability,
} from "@senvo/domain";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

type InventoryReadPrismaClient = Pick<
  PrismaClient,
  "$queryRaw" | "productVariant"
>;

type AvailabilityRow = {
  available_to_sell: bigint | number;
  color_name: string;
  location_code: string;
  location_id: string;
  location_name: string;
  on_hand: bigint | number;
  product_id: string;
  product_name: string;
  reserved: bigint | number;
  size_name: string;
  sku: string;
  variant_id: string;
};

type LocationRow = {
  branch_id: string;
  branch_name: string;
  branch_status: StockLocationReadItem["branch"]["status"];
  id: string;
  is_sellable: boolean;
  name: string;
  status: StockLocationReadItem["status"];
  type: StockLocationReadItem["type"];
};

type MovementRow = {
  color_name: string;
  destination_location_id: string | null;
  destination_location_name: string | null;
  line_number: number;
  movement_id: string;
  occurred_at: Date;
  product_id: string;
  product_name: string;
  quantity: number;
  size_name: string;
  sku: string;
  source_location_id: string | null;
  source_location_name: string | null;
  status: InventoryMovementHistoryItem["status"];
  type: InventoryMovementHistoryItem["type"];
  variant_id: string;
};

type AvailabilityCursor = {
  locationCode: string;
  locationId: string;
  sku: string;
  variantId: string;
};

type LocationCursor = {
  branchName: string;
  id: string;
  locationName: string;
};

type MovementCursor = {
  lineNumber: number;
  movementId: string;
  occurredAt: Date;
};

export class PrismaInventoryReadRepository implements InventoryReadRepository {
  constructor(private readonly prisma: InventoryReadPrismaClient) {}

  async listAvailability(
    filter: Parameters<InventoryReadRepository["listAvailability"]>[0],
  ): Promise<InventoryReadPage<InventoryAvailabilityReadItem>> {
    const cursor = filter.cursor
      ? parseAvailabilityCursor(filter.cursor)
      : undefined;
    const rows = await queryAvailability(this.prisma, {
      ...filter,
      cursor,
      limit: filter.pageSize + 1,
    });
    const items = rows.slice(0, filter.pageSize).map(mapAvailability);
    const hasMore = rows.length > filter.pageSize;
    const last = rows.at(Math.min(rows.length, filter.pageSize) - 1);
    return {
      hasMore,
      items,
      nextCursor:
        hasMore && last
          ? encodeAvailabilityCursor({
              locationCode: last.location_code,
              locationId: last.location_id,
              sku: last.sku,
              variantId: last.variant_id,
            })
          : null,
    };
  }

  async listLocations(
    filter: Parameters<InventoryReadRepository["listLocations"]>[0],
  ): Promise<InventoryReadPage<StockLocationReadItem>> {
    const cursor = filter.cursor
      ? parseLocationCursor(filter.cursor)
      : undefined;
    const afterCursor = cursor
      ? Prisma.sql`AND (
          branch.name > ${cursor.branchName}
          OR (branch.name = ${cursor.branchName} AND location.name > ${cursor.locationName})
          OR (
            branch.name = ${cursor.branchName}
            AND location.name = ${cursor.locationName}
            AND location.id > ${cursor.id}::uuid
          )
        )`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<LocationRow[]>`
      SELECT
        location.id,
        location.name,
        location.type,
        location.status,
        location.is_sellable,
        branch.id AS branch_id,
        branch.name AS branch_name,
        branch.status AS branch_status
      FROM stock_locations location
      INNER JOIN branches branch
        ON branch.id = location.branch_id
       AND branch.organization_id = location.organization_id
      WHERE location.organization_id = ${filter.organizationId}::uuid
      ${afterCursor}
      ORDER BY branch.name ASC, location.name ASC, location.id ASC
      LIMIT ${filter.pageSize + 1}
    `;
    const pageRows = rows.slice(0, filter.pageSize);
    const hasMore = rows.length > filter.pageSize;
    const last = pageRows.at(-1);
    return {
      hasMore,
      items: pageRows.map(mapLocation),
      nextCursor:
        hasMore && last
          ? encodeLocationCursor({
              branchName: last.branch_name,
              id: last.id,
              locationName: last.name,
            })
          : null,
    };
  }

  async listMovements(
    filter: Parameters<InventoryReadRepository["listMovements"]>[0],
  ): Promise<InventoryReadPage<InventoryMovementHistoryItem>> {
    const cursor = filter.cursor
      ? parseMovementCursor(filter.cursor)
      : undefined;
    const locationFilter = filter.locationId
      ? Prisma.sql`AND (
          movement.source_location_id = ${filter.locationId}::uuid
          OR movement.destination_location_id = ${filter.locationId}::uuid
        )`
      : Prisma.empty;
    const statusFilter = filter.status
      ? Prisma.sql`AND movement.status = ${filter.status}::"InventoryMovementStatus"`
      : Prisma.empty;
    const typeFilter = filter.type
      ? Prisma.sql`AND movement.type = ${filter.type}::"InventoryMovementType"`
      : Prisma.empty;
    const afterCursor = cursor
      ? Prisma.sql`AND (
          movement.occurred_at < ${cursor.occurredAt}
          OR (
            movement.occurred_at = ${cursor.occurredAt}
            AND movement.id < ${cursor.movementId}::uuid
          )
          OR (
            movement.occurred_at = ${cursor.occurredAt}
            AND movement.id = ${cursor.movementId}::uuid
            AND line.line_number > ${cursor.lineNumber}
          )
        )`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<MovementRow[]>`
      SELECT
        movement.id AS movement_id,
        movement.type,
        movement.status,
        movement.occurred_at,
        line.line_number,
        line.quantity,
        variant.id AS variant_id,
        variant.sku,
        product.id AS product_id,
        product.name AS product_name,
        color.name AS color_name,
        size.name AS size_name,
        source.id AS source_location_id,
        source.name AS source_location_name,
        destination.id AS destination_location_id,
        destination.name AS destination_location_name
      FROM inventory_movement_lines line
      INNER JOIN inventory_movements movement
        ON movement.id = line.movement_id
       AND movement.organization_id = line.organization_id
      INNER JOIN product_variants variant
        ON variant.id = line.product_variant_id
       AND variant.organization_id = line.organization_id
      INNER JOIN products product
        ON product.id = variant.product_id
       AND product.organization_id = variant.organization_id
      INNER JOIN colors color
        ON color.id = variant.color_id
       AND color.organization_id = variant.organization_id
      INNER JOIN sizes size
        ON size.id = variant.size_id
       AND size.organization_id = variant.organization_id
      LEFT JOIN stock_locations source
        ON source.id = movement.source_location_id
       AND source.organization_id = movement.organization_id
      LEFT JOIN stock_locations destination
        ON destination.id = movement.destination_location_id
       AND destination.organization_id = movement.organization_id
      WHERE movement.organization_id = ${filter.organizationId}::uuid
      ${locationFilter}
      ${statusFilter}
      ${typeFilter}
      ${afterCursor}
      ORDER BY
        movement.occurred_at DESC,
        movement.id DESC,
        line.line_number ASC
      LIMIT ${filter.pageSize + 1}
    `;
    const pageRows = rows.slice(0, filter.pageSize);
    const hasMore = rows.length > filter.pageSize;
    const last = pageRows.at(-1);
    return {
      hasMore,
      items: pageRows.map(mapMovement),
      nextCursor:
        hasMore && last
          ? encodeMovementCursor({
              lineNumber: last.line_number,
              movementId: last.movement_id,
              occurredAt: new Date(last.occurred_at),
            })
          : null,
    };
  }

  async getVariantAvailability(input: {
    organizationId: string;
    variantId: string;
  }): Promise<VariantInventoryAvailability | null> {
    const variant = await this.prisma.productVariant.findFirst({
      include: { color: true, product: true, size: true },
      where: {
        id: input.variantId,
        organizationId: input.organizationId,
      },
    });
    if (!variant) return null;

    const rows = await queryAvailability(this.prisma, {
      organizationId: input.organizationId,
      variantId: input.variantId,
    });
    return {
      locations: rows.map((row) => ({
        availableToSell: Number(row.available_to_sell),
        location: { id: row.location_id, name: row.location_name },
        onHand: Number(row.on_hand),
        reserved: Number(row.reserved),
      })),
      variant: {
        color: variant.color.name,
        id: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        size: variant.size.name,
        sku: variant.sku,
      },
    };
  }
}

async function queryAvailability(
  prisma: Pick<InventoryReadPrismaClient, "$queryRaw">,
  input: {
    cursor?: AvailabilityCursor;
    limit?: number;
    locationId?: string;
    organizationId: string;
    search?: string;
    variantId?: string;
  },
): Promise<AvailabilityRow[]> {
  const locationFilter = input.locationId
    ? Prisma.sql`AND availability.location_id = ${input.locationId}::uuid`
    : Prisma.empty;
  const variantFilter = input.variantId
    ? Prisma.sql`AND availability.variant_id = ${input.variantId}::uuid`
    : Prisma.empty;
  const searchFilter = input.search
    ? Prisma.sql`AND (
        variant.sku ILIKE ${`%${input.search}%`}
        OR product.name ILIKE ${`%${input.search}%`}
      )`
    : Prisma.empty;
  const afterCursor = input.cursor
    ? Prisma.sql`AND (
        variant.sku > ${input.cursor.sku}
        OR (variant.sku = ${input.cursor.sku} AND location.code > ${input.cursor.locationCode})
        OR (
          variant.sku = ${input.cursor.sku}
          AND location.code = ${input.cursor.locationCode}
          AND variant.id > ${input.cursor.variantId}::uuid
        )
        OR (
          variant.sku = ${input.cursor.sku}
          AND location.code = ${input.cursor.locationCode}
          AND variant.id = ${input.cursor.variantId}::uuid
          AND location.id > ${input.cursor.locationId}::uuid
        )
      )`
    : Prisma.empty;
  const limit = input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty;
  return prisma.$queryRaw<AvailabilityRow[]>`
    WITH on_hand AS (
      SELECT
        balance.organization_id,
        balance.variant_id,
        balance.location_id,
        SUM(balance.quantity_delta)::bigint AS on_hand
      FROM (
        SELECT
          line.organization_id,
          line.product_variant_id AS variant_id,
          movement.destination_location_id AS location_id,
          line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${input.organizationId}::uuid
          AND movement.destination_location_id IS NOT NULL
        UNION ALL
        SELECT
          line.organization_id,
          line.product_variant_id AS variant_id,
          movement.source_location_id AS location_id,
          -line.quantity AS quantity_delta
        FROM inventory_movement_lines line
        INNER JOIN inventory_movements movement
          ON movement.id = line.movement_id
         AND movement.organization_id = line.organization_id
        WHERE movement.status = 'POSTED'
          AND line.organization_id = ${input.organizationId}::uuid
          AND movement.source_location_id IS NOT NULL
      ) balance
      GROUP BY balance.organization_id, balance.variant_id, balance.location_id
    ),
    reserved AS (
      SELECT
        line.organization_id,
        line.product_variant_id AS variant_id,
        reservation.stock_location_id AS location_id,
        SUM(line.quantity)::bigint AS reserved
      FROM inventory_reservation_lines line
      INNER JOIN inventory_reservations reservation
        ON reservation.id = line.reservation_id
       AND reservation.organization_id = line.organization_id
      WHERE reservation.status = 'ACTIVE'
        AND line.organization_id = ${input.organizationId}::uuid
      GROUP BY
        line.organization_id,
        line.product_variant_id,
        reservation.stock_location_id
    ),
    availability AS (
      SELECT
        COALESCE(on_hand.organization_id, reserved.organization_id) AS organization_id,
        COALESCE(on_hand.variant_id, reserved.variant_id) AS variant_id,
        COALESCE(on_hand.location_id, reserved.location_id) AS location_id,
        COALESCE(on_hand.on_hand, 0)::bigint AS on_hand,
        COALESCE(reserved.reserved, 0)::bigint AS reserved
      FROM on_hand
      FULL OUTER JOIN reserved
        ON reserved.organization_id = on_hand.organization_id
       AND reserved.variant_id = on_hand.variant_id
       AND reserved.location_id = on_hand.location_id
    )
    SELECT
      variant.id AS variant_id,
      variant.sku,
      product.id AS product_id,
      product.name AS product_name,
      color.name AS color_name,
      size.name AS size_name,
      location.id AS location_id,
      location.name AS location_name,
      location.code AS location_code,
      availability.on_hand,
      availability.reserved,
      (availability.on_hand - availability.reserved)::bigint AS available_to_sell
    FROM availability
    INNER JOIN product_variants variant
      ON variant.id = availability.variant_id
     AND variant.organization_id = availability.organization_id
    INNER JOIN products product
      ON product.id = variant.product_id
     AND product.organization_id = variant.organization_id
    INNER JOIN colors color
      ON color.id = variant.color_id
     AND color.organization_id = variant.organization_id
    INNER JOIN sizes size
      ON size.id = variant.size_id
     AND size.organization_id = variant.organization_id
    INNER JOIN stock_locations location
      ON location.id = availability.location_id
     AND location.organization_id = availability.organization_id
    WHERE availability.organization_id = ${input.organizationId}::uuid
    ${locationFilter}
    ${variantFilter}
    ${searchFilter}
    ${afterCursor}
    ORDER BY variant.sku ASC, location.code ASC, variant.id ASC, location.id ASC
    ${limit}
  `;
}

function mapAvailability(row: AvailabilityRow): InventoryAvailabilityReadItem {
  return {
    availableToSell: Number(row.available_to_sell),
    location: { id: row.location_id, name: row.location_name },
    onHand: Number(row.on_hand),
    reserved: Number(row.reserved),
    variant: mapVariant(row),
  };
}

function mapVariant(row: {
  color_name: string;
  product_id: string;
  product_name: string;
  size_name: string;
  sku: string;
  variant_id: string;
}): InventoryVariantReadItem {
  return {
    color: row.color_name,
    id: row.variant_id,
    productId: row.product_id,
    productName: row.product_name,
    size: row.size_name,
    sku: row.sku,
  };
}

function mapLocation(row: LocationRow): StockLocationReadItem {
  return {
    branch: {
      id: row.branch_id,
      name: row.branch_name,
      status: row.branch_status,
    },
    id: row.id,
    isSellable: row.is_sellable,
    name: row.name,
    status: row.status,
    type: row.type,
  };
}

function mapMovement(row: MovementRow): InventoryMovementHistoryItem {
  return {
    destinationLocation:
      row.destination_location_id && row.destination_location_name
        ? {
            id: row.destination_location_id,
            name: row.destination_location_name,
          }
        : null,
    id: row.movement_id,
    occurredAt: new Date(row.occurred_at),
    quantity: row.quantity,
    sourceLocation:
      row.source_location_id && row.source_location_name
        ? { id: row.source_location_id, name: row.source_location_name }
        : null,
    status: row.status,
    type: row.type,
    variant: mapVariant(row),
  };
}

function encodeAvailabilityCursor(cursor: AvailabilityCursor): string {
  return [
    "inventory-availability-v1",
    encodeURIComponent(cursor.sku),
    encodeURIComponent(cursor.locationCode),
    cursor.variantId,
    cursor.locationId,
  ].join("|");
}

function parseAvailabilityCursor(value: string): AvailabilityCursor {
  const [version, sku, locationCode, variantId, locationId, extra] =
    value.split("|");
  if (
    version !== "inventory-availability-v1" ||
    !sku ||
    !locationCode ||
    !isUuid(variantId) ||
    !isUuid(locationId) ||
    extra !== undefined
  ) {
    throw invalidCursor();
  }
  return {
    locationCode: decodeURIComponent(locationCode),
    locationId,
    sku: decodeURIComponent(sku),
    variantId,
  };
}

function encodeLocationCursor(cursor: LocationCursor): string {
  return [
    "inventory-location-v1",
    encodeURIComponent(cursor.branchName),
    encodeURIComponent(cursor.locationName),
    cursor.id,
  ].join("|");
}

function parseLocationCursor(value: string): LocationCursor {
  const [version, branchName, locationName, id, extra] = value.split("|");
  if (
    version !== "inventory-location-v1" ||
    !branchName ||
    !locationName ||
    !isUuid(id) ||
    extra !== undefined
  ) {
    throw invalidCursor();
  }
  return {
    branchName: decodeURIComponent(branchName),
    id,
    locationName: decodeURIComponent(locationName),
  };
}

function encodeMovementCursor(cursor: MovementCursor): string {
  return [
    "inventory-movement-read-v1",
    encodeURIComponent(cursor.occurredAt.toISOString()),
    cursor.movementId,
    cursor.lineNumber,
  ].join("|");
}

function parseMovementCursor(value: string): MovementCursor {
  const [version, occurredAtValue, movementId, lineNumberValue, extra] =
    value.split("|");
  const occurredAt = new Date(decodeURIComponent(occurredAtValue ?? ""));
  const lineNumber = Number(lineNumberValue);
  if (
    version !== "inventory-movement-read-v1" ||
    !isUuid(movementId) ||
    !Number.isInteger(lineNumber) ||
    lineNumber < 1 ||
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== decodeURIComponent(occurredAtValue ?? "") ||
    extra !== undefined
  ) {
    throw invalidCursor();
  }
  return { lineNumber, movementId, occurredAt };
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    ),
  );
}

function invalidCursor(): ValidationApplicationError {
  return new ValidationApplicationError("cursor is invalid.");
}

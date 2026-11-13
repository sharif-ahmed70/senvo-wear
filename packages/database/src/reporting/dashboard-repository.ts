import {
  DASHBOARD_RECENT_ORDER_LIMIT,
  DASHBOARD_TOP_PRODUCT_LIMIT,
  DASHBOARD_TIME_ZONE,
  LOW_STOCK_MAX_AVAILABLE,
  PENDING_ORDER_STATUSES,
  SALE_ORDER_STATUSES,
  type DashboardPeriodReadModel,
  type DashboardRange,
  type DashboardReadModel,
  type DashboardReadRepository,
  type DashboardWindows,
} from "@senvo/domain";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { availabilityCtes } from "../inventory/read-repository.js";

type DashboardPrismaClient = Pick<
  PrismaClient,
  "$queryRaw" | "organizationMembership" | "salesOrder" | "salesSession"
>;

const statusList = (statuses: readonly string[]) =>
  Prisma.join(statuses.map((status) => Prisma.sql`${status}`));

const toNumber = (value: bigint | number | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value);

/**
 * Cost of a returned quantity: the sale line's cost snapshot per piece, else
 * the variant's current moving average; NULL when neither is known. Expects
 * `return_line`, `snap` and `cost_state` in scope.
 */
const returnedCostSql = Prisma.sql`CASE
  WHEN snap.is_cost_known AND snap.unit_cost_minor IS NOT NULL
    THEN return_line.quantity::bigint * snap.unit_cost_minor
  WHEN cost_state.is_cost_known AND cost_state.average_cost_minor IS NOT NULL
    THEN return_line.quantity::bigint * cost_state.average_cost_minor
  ELSE NULL
END`;

/**
 * The Asia/Dhaka business date of a stored timestamp. The app sends times
 * as UTC wall-clock text, which PostgreSQL reads in the server's TimeZone
 * (the shop laptop's server runs America/Los_Angeles), and Prisma reads them
 * back the same way, so they look right in the app but are shifted inside
 * SQL. Undoing the session zone first gives the real moment; on a UTC
 * server this changes nothing. Window bounds need no fix: they are sent the
 * same way, so they are shifted alike.
 */
const businessDateSql = (column: string) =>
  Prisma.sql`to_char(((${Prisma.raw(column)} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC') AT TIME ZONE ${DASHBOARD_TIME_ZONE}, 'YYYY-MM-DD')`;

/**
 * Net sales entries of [start, end), as the CTEs `exchange_orders` and
 * `sales_entries` (at, channel, amount, counted):
 * - each confirmed sale adds its total and counts as one sale, except the
 *   new bill of an exchange, which is not a new sale (counted = 0);
 * - each POS return takes its credit off on the day it came back, under the
 *   sale's channel.
 * An exchange is recognised by the refund the POS writes for its credit,
 * keyed `exchange-<new checkout id>`. So an even exchange adds nothing and
 * only a price difference moves the day's sales.
 */
function salesEntriesSql(organizationId: string, start: Date, end: Date) {
  return Prisma.sql`
    exchange_orders AS (
      SELECT checkout.sales_order_id
      FROM payment_refunds refund
      INNER JOIN pos_checkout_records checkout
        ON checkout.organization_id = refund.organization_id
       AND refund.idempotency_key = 'exchange-' || checkout.id::text
      WHERE refund.organization_id = ${organizationId}::uuid
    ),
    sales_entries AS (
      SELECT
        sale.confirmed_at AS at,
        sale.channel::text AS channel,
        sale.total_minor::bigint AS amount,
        CASE WHEN exchange.sales_order_id IS NULL THEN 1 ELSE 0 END AS counted
      FROM sales_orders sale
      LEFT JOIN exchange_orders exchange
        ON exchange.sales_order_id = sale.id
      WHERE sale.organization_id = ${organizationId}::uuid
        AND sale.status::text IN (${statusList(SALE_ORDER_STATUSES)})
        AND sale.confirmed_at >= ${start}
        AND sale.confirmed_at < ${end}
      UNION ALL
      SELECT
        sale_return.returned_at AS at,
        sale.channel::text AS channel,
        -sale_return.total_credit_minor::bigint AS amount,
        0 AS counted
      FROM pos_sale_returns sale_return
      INNER JOIN sales_orders sale
        ON sale.id = sale_return.sales_order_id
       AND sale.organization_id = sale_return.organization_id
      WHERE sale_return.organization_id = ${organizationId}::uuid
        AND sale_return.returned_at >= ${start}
        AND sale_return.returned_at < ${end}
    )`;
}

/**
 * Money actually given back to customers in [start, end). An exchange's
 * refund only moves the credit onto the new bill, so just the part above
 * the new bill's total (cash handed back) counts.
 */
function moneyBackSql(organizationId: string, start: Date, end: Date) {
  return Prisma.sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN exchange.id IS NULL THEN refund.amount_minor
        ELSE GREATEST(refund.amount_minor - exchange.total_minor, 0)
      END
    ), 0)::bigint AS refunds_minor
    FROM payment_refunds refund
    LEFT JOIN pos_checkout_records exchange
      ON exchange.organization_id = refund.organization_id
     AND refund.idempotency_key = 'exchange-' || exchange.id::text
    WHERE refund.organization_id = ${organizationId}::uuid
      AND refund.issued_at >= ${start}
      AND refund.issued_at < ${end}`;
}

/**
 * Read-only dashboard aggregates. Every query filters on organization_id;
 * see packages/domain/src/reporting/dashboard.ts for the definitions.
 */
export class PrismaDashboardReadRepository implements DashboardReadRepository {
  constructor(private readonly prisma: DashboardPrismaClient) {}

  async readDashboard(input: {
    includeFinancials: boolean;
    organizationId: string;
    windows: DashboardWindows;
  }): Promise<DashboardReadModel> {
    const { organizationId, windows } = input;
    const [pendingOrders, inventory, openSessions, recentOrders, financials] =
      await Promise.all([
        this.countPendingOrders(organizationId),
        this.inventoryCounts(organizationId),
        this.openSessions(organizationId),
        this.recentOrders(organizationId),
        input.includeFinancials
          ? this.financials(organizationId, windows)
          : Promise.resolve(null),
      ]);
    return { financials, inventory, openSessions, pendingOrders, recentOrders };
  }

  async actorRole(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      select: { role: true },
      where: { organizationId, status: "ACTIVE", userId },
    });
    return membership?.role ?? null;
  }

  private async countPendingOrders(organizationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM sales_orders
      WHERE organization_id = ${organizationId}::uuid
        AND status::text IN (${statusList(PENDING_ORDER_STATUSES)})`;
    return toNumber(rows[0]?.count);
  }

  private async inventoryCounts(organizationId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        in_stock: bigint;
        inactive: bigint;
        low_stock: bigint;
        out_of_stock: bigint;
        total: bigint;
      }>
    >`
      WITH ${availabilityCtes(organizationId)},
      per_variant AS (
        SELECT variant_id, SUM(available_to_sell)::bigint AS available
        FROM availability
        GROUP BY variant_id
      )
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE variant.status::text = 'INACTIVE')::bigint AS inactive,
        COUNT(*) FILTER (
          WHERE variant.status::text = 'ACTIVE'
            AND COALESCE(stock.available, 0) <= 0
        )::bigint AS out_of_stock,
        COUNT(*) FILTER (
          WHERE variant.status::text = 'ACTIVE'
            AND COALESCE(stock.available, 0) BETWEEN 1 AND ${LOW_STOCK_MAX_AVAILABLE}
        )::bigint AS low_stock,
        COUNT(*) FILTER (
          WHERE variant.status::text = 'ACTIVE'
            AND COALESCE(stock.available, 0) > ${LOW_STOCK_MAX_AVAILABLE}
        )::bigint AS in_stock
      FROM product_variants variant
      LEFT JOIN per_variant stock ON stock.variant_id = variant.id
      WHERE variant.organization_id = ${organizationId}::uuid
        AND variant.status::text IN ('ACTIVE', 'INACTIVE')`;
    const row = rows[0];
    return {
      inStock: toNumber(row?.in_stock),
      inactive: toNumber(row?.inactive),
      lowStock: toNumber(row?.low_stock),
      outOfStock: toNumber(row?.out_of_stock),
      total: toNumber(row?.total),
    };
  }

  private async openSessions(organizationId: string) {
    const sessions = await this.prisma.salesSession.findMany({
      orderBy: { openedAt: "asc" },
      select: {
        counter: { select: { name: true } },
        openedAt: true,
        openedBy: { select: { email: true, name: true } },
        openingFloatMinor: true,
      },
      where: { organizationId, status: "OPEN" },
    });
    return sessions.map((session) => ({
      counterName: session.counter.name,
      openedAt: session.openedAt,
      openedByName: session.openedBy.name ?? session.openedBy.email,
      openingFloatMinor: session.openingFloatMinor,
    }));
  }

  private async recentOrders(organizationId: string) {
    const orders = await this.prisma.salesOrder.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        channel: true,
        createdAt: true,
        customerName: true,
        id: true,
        orderNumber: true,
        status: true,
        totalMinor: true,
      },
      take: DASHBOARD_RECENT_ORDER_LIMIT,
      where: { organizationId, status: { not: "DRAFT" } },
    });
    return orders;
  }

  private async financials(
    organizationId: string,
    windows: DashboardWindows,
  ): Promise<NonNullable<DashboardReadModel["financials"]>> {
    const saleStatuses = statusList(SALE_ORDER_STATUSES);
    const [daily, channels, refunds, topProducts, period, stock] =
      await Promise.all([
      this.prisma.$queryRaw<
        Array<{ date: string; sale_count: bigint; sales_minor: bigint }>
      >`
        WITH ${salesEntriesSql(organizationId, windows.last7Start, windows.tomorrowStart)}
        SELECT
          ${businessDateSql("at")} AS date,
          SUM(counted)::bigint AS sale_count,
          COALESCE(SUM(amount), 0)::bigint AS sales_minor
        FROM sales_entries
        GROUP BY 1`,
      this.prisma.$queryRaw<
        Array<{
          channel: string;
          previous_minor: bigint;
          sales_minor: bigint;
        }>
      >`
        WITH ${salesEntriesSql(organizationId, windows.previous7Start, windows.tomorrowStart)}
        SELECT
          channel,
          COALESCE(SUM(amount) FILTER (WHERE at >= ${windows.last7Start}), 0)::bigint AS sales_minor,
          COALESCE(SUM(amount) FILTER (WHERE at < ${windows.last7Start}), 0)::bigint AS previous_minor
        FROM sales_entries
        GROUP BY channel`,
      this.prisma.$queryRaw<Array<{ refunds_minor: bigint }>>(
        moneyBackSql(organizationId, windows.todayStart, windows.tomorrowStart),
      ),
      this.prisma.$queryRaw<
        Array<{
          name: string;
          product_id: string;
          quantity: bigint;
          revenue_minor: bigint;
        }>
      >`
        SELECT
          product.id::text AS product_id,
          product.name AS name,
          SUM(line.quantity)::bigint AS quantity,
          SUM(line.line_total_minor)::bigint AS revenue_minor
        FROM sales_order_lines line
        INNER JOIN sales_orders sale
          ON sale.id = line.sales_order_id
         AND sale.organization_id = line.organization_id
        INNER JOIN product_variants variant
          ON variant.id = line.product_variant_id
         AND variant.organization_id = line.organization_id
        INNER JOIN products product
          ON product.id = variant.product_id
         AND product.organization_id = variant.organization_id
        WHERE line.organization_id = ${organizationId}::uuid
          AND sale.status::text IN (${saleStatuses})
          AND sale.confirmed_at >= ${windows.last7Start}
          AND sale.confirmed_at < ${windows.tomorrowStart}
        GROUP BY product.id, product.name
        ORDER BY revenue_minor DESC, quantity DESC, product.id
        LIMIT ${DASHBOARD_TOP_PRODUCT_LIMIT}`,
      this.period(organizationId, windows.range),
      this.stockValue(organizationId),
    ]);
    return {
      channels: channels.map((row) => ({
        channel: row.channel,
        previousPeriodMinor: toNumber(row.previous_minor),
        salesMinor: toNumber(row.sales_minor),
      })),
      dailySales: daily.map((row) => ({
        date: row.date,
        saleCount: toNumber(row.sale_count),
        salesMinor: toNumber(row.sales_minor),
      })),
      period,
      refundsTodayMinor: toNumber(refunds[0]?.refunds_minor),
      stock,
      topProducts: topProducts.map((row) => ({
        name: row.name,
        productId: row.product_id,
        quantity: toNumber(row.quantity),
        revenueMinor: toNumber(row.revenue_minor),
      })),
    };
  }

  /** On-hand stock at moving average cost (see the domain definitions). */
  private async stockValue(organizationId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ cost_minor: bigint; uncosted_units: bigint }>
    >`
      WITH ${availabilityCtes(organizationId)},
      per_variant AS (
        SELECT variant_id, GREATEST(SUM(on_hand), 0)::bigint AS on_hand
        FROM availability
        GROUP BY variant_id
      )
      SELECT
        COALESCE(SUM(stock.on_hand * cost_state.average_cost_minor) FILTER (
          WHERE cost_state.is_cost_known AND cost_state.average_cost_minor IS NOT NULL
        ), 0)::bigint AS cost_minor,
        COALESCE(SUM(stock.on_hand) FILTER (
          WHERE cost_state.id IS NULL
             OR NOT cost_state.is_cost_known
             OR cost_state.average_cost_minor IS NULL
        ), 0)::bigint AS uncosted_units
      FROM per_variant stock
      INNER JOIN product_variants variant
        ON variant.id = stock.variant_id
       AND variant.organization_id = ${organizationId}::uuid
      LEFT JOIN variant_cost_states cost_state
        ON cost_state.product_variant_id = variant.id
       AND cost_state.organization_id = variant.organization_id
      WHERE variant.status::text IN ('ACTIVE', 'INACTIVE')`;
    return {
      costMinor: toNumber(rows[0]?.cost_minor),
      uncostedUnits: toNumber(rows[0]?.uncosted_units),
    };
  }

  /** Aggregates for the picked business dates (see the domain definitions). */
  private async period(
    organizationId: string,
    range: DashboardRange,
  ): Promise<DashboardPeriodReadModel> {
    const saleStatuses = statusList(SALE_ORDER_STATUSES);
    const [orders, lines, channels, refunds, topProducts, productProfits] =
      await Promise.all([
      this.prisma.$queryRaw<
        Array<{ date: string; sale_count: bigint; sales_minor: bigint }>
      >`
        WITH ${salesEntriesSql(organizationId, range.start, range.end)}
        SELECT
          ${businessDateSql("at")} AS date,
          SUM(counted)::bigint AS sale_count,
          COALESCE(SUM(amount), 0)::bigint AS sales_minor
        FROM sales_entries
        GROUP BY 1`,
      this.prisma.$queryRaw<
        Array<{
          cost_minor: bigint;
          costed_sales_minor: bigint;
          date: string;
          uncosted_sales_minor: bigint;
        }>
      >`
        WITH sale_lines AS (
          SELECT
            ${businessDateSql("sale.confirmed_at")} AS date,
            line.line_total_minor::bigint AS revenue,
            CASE
              WHEN snap.is_cost_known AND snap.total_cost_minor IS NOT NULL
                THEN snap.total_cost_minor
              WHEN cost_state.is_cost_known AND cost_state.average_cost_minor IS NOT NULL
                THEN line.quantity::bigint * cost_state.average_cost_minor
              ELSE NULL
            END AS cost
          FROM sales_order_lines line
          INNER JOIN sales_orders sale
            ON sale.id = line.sales_order_id
           AND sale.organization_id = line.organization_id
          LEFT JOIN sale_line_cost_snapshots snap
            ON snap.sales_order_line_id = line.id
           AND snap.organization_id = line.organization_id
          LEFT JOIN variant_cost_states cost_state
            ON cost_state.product_variant_id = line.product_variant_id
           AND cost_state.organization_id = line.organization_id
          WHERE line.organization_id = ${organizationId}::uuid
            AND sale.status::text IN (${saleStatuses})
            AND sale.confirmed_at >= ${range.start}
            AND sale.confirmed_at < ${range.end}
          UNION ALL
          -- Returns count against the day they came back (negative).
          SELECT
            ${businessDateSql("sale_return.returned_at")} AS date,
            -return_line.line_credit_minor::bigint AS revenue,
            -(${returnedCostSql})
          FROM pos_sale_return_lines return_line
          INNER JOIN pos_sale_returns sale_return
            ON sale_return.id = return_line.return_id
           AND sale_return.organization_id = return_line.organization_id
          LEFT JOIN sale_line_cost_snapshots snap
            ON snap.sales_order_line_id = return_line.sales_order_line_id
           AND snap.organization_id = return_line.organization_id
          LEFT JOIN variant_cost_states cost_state
            ON cost_state.product_variant_id = return_line.product_variant_id
           AND cost_state.organization_id = return_line.organization_id
          WHERE return_line.organization_id = ${organizationId}::uuid
            AND sale_return.returned_at >= ${range.start}
            AND sale_return.returned_at < ${range.end}
        )
        SELECT
          date,
          COALESCE(SUM(cost), 0)::bigint AS cost_minor,
          COALESCE(SUM(revenue) FILTER (WHERE cost IS NOT NULL), 0)::bigint AS costed_sales_minor,
          COALESCE(SUM(revenue) FILTER (WHERE cost IS NULL), 0)::bigint AS uncosted_sales_minor
        FROM sale_lines
        GROUP BY date`,
      this.prisma.$queryRaw<
        Array<{ channel: string; previous_minor: bigint; sales_minor: bigint }>
      >`
        WITH ${salesEntriesSql(organizationId, range.previousStart, range.end)}
        SELECT
          channel,
          COALESCE(SUM(amount) FILTER (WHERE at >= ${range.start}), 0)::bigint AS sales_minor,
          COALESCE(SUM(amount) FILTER (WHERE at < ${range.start}), 0)::bigint AS previous_minor
        FROM sales_entries
        GROUP BY channel`,
      this.prisma.$queryRaw<Array<{ refunds_minor: bigint }>>(
        moneyBackSql(organizationId, range.start, range.end),
      ),
      this.prisma.$queryRaw<
        Array<{
          name: string;
          product_id: string;
          quantity: bigint;
          revenue_minor: bigint;
        }>
      >`
        SELECT
          product.id::text AS product_id,
          product.name AS name,
          SUM(line.quantity)::bigint AS quantity,
          SUM(line.line_total_minor)::bigint AS revenue_minor
        FROM sales_order_lines line
        INNER JOIN sales_orders sale
          ON sale.id = line.sales_order_id
         AND sale.organization_id = line.organization_id
        INNER JOIN product_variants variant
          ON variant.id = line.product_variant_id
         AND variant.organization_id = line.organization_id
        INNER JOIN products product
          ON product.id = variant.product_id
         AND product.organization_id = variant.organization_id
        WHERE line.organization_id = ${organizationId}::uuid
          AND sale.status::text IN (${saleStatuses})
          AND sale.confirmed_at >= ${range.start}
          AND sale.confirmed_at < ${range.end}
        GROUP BY product.id, product.name
        ORDER BY revenue_minor DESC, quantity DESC, product.id
        LIMIT ${DASHBOARD_TOP_PRODUCT_LIMIT}`,
      // Same lines and cost rule as the period profit above, per product.
      this.prisma.$queryRaw<
        Array<{
          cost_minor: bigint;
          costed_revenue_minor: bigint;
          extra_cost_minor: bigint;
          name: string;
          product_code: string;
          product_id: string;
          quantity: bigint;
          returned_quantity: bigint;
          revenue_minor: bigint;
          uncosted_revenue_minor: bigint;
        }>
      >`
        WITH extra_share AS (
          -- Share of transport/labour in each variant's landed purchase cost.
          SELECT
            pl.product_variant_id AS variant_id,
            SUM(pl.quantity::numeric * COALESCE(pl.extra_cost_per_unit_minor, 0))
              / NULLIF(SUM(pl.quantity::numeric * pl.unit_cost_minor), 0) AS ratio
          FROM purchase_lines pl
          INNER JOIN purchases purchase
            ON purchase.id = pl.purchase_id
           AND purchase.organization_id = pl.organization_id
          WHERE pl.organization_id = ${organizationId}::uuid
            AND purchase.status::text = 'POSTED'
          GROUP BY pl.product_variant_id
        ),
        sale_lines AS (
          SELECT
            product.id AS product_id,
            product.name AS name,
            product.product_code AS product_code,
            line.quantity::bigint AS quantity,
            line.line_total_minor::bigint AS revenue,
            COALESCE(share.ratio, 0) AS extra_ratio,
            CASE
              WHEN snap.is_cost_known AND snap.total_cost_minor IS NOT NULL
                THEN snap.total_cost_minor
              WHEN cost_state.is_cost_known AND cost_state.average_cost_minor IS NOT NULL
                THEN line.quantity::bigint * cost_state.average_cost_minor
              ELSE NULL
            END AS cost,
            0::bigint AS returned
          FROM sales_order_lines line
          LEFT JOIN extra_share share
            ON share.variant_id = line.product_variant_id
          INNER JOIN sales_orders sale
            ON sale.id = line.sales_order_id
           AND sale.organization_id = line.organization_id
          INNER JOIN product_variants variant
            ON variant.id = line.product_variant_id
           AND variant.organization_id = line.organization_id
          INNER JOIN products product
            ON product.id = variant.product_id
           AND product.organization_id = variant.organization_id
          LEFT JOIN sale_line_cost_snapshots snap
            ON snap.sales_order_line_id = line.id
           AND snap.organization_id = line.organization_id
          LEFT JOIN variant_cost_states cost_state
            ON cost_state.product_variant_id = line.product_variant_id
           AND cost_state.organization_id = line.organization_id
          WHERE line.organization_id = ${organizationId}::uuid
            AND sale.status::text IN (${saleStatuses})
            AND sale.confirmed_at >= ${range.start}
            AND sale.confirmed_at < ${range.end}
          UNION ALL
          -- Returns in the period, as negative sales (see the daily query).
          SELECT
            product.id,
            product.name,
            product.product_code,
            -return_line.quantity::bigint,
            -return_line.line_credit_minor::bigint,
            COALESCE(share.ratio, 0),
            -(${returnedCostSql}),
            return_line.quantity::bigint
          FROM pos_sale_return_lines return_line
          INNER JOIN pos_sale_returns sale_return
            ON sale_return.id = return_line.return_id
           AND sale_return.organization_id = return_line.organization_id
          LEFT JOIN extra_share share
            ON share.variant_id = return_line.product_variant_id
          INNER JOIN product_variants variant
            ON variant.id = return_line.product_variant_id
           AND variant.organization_id = return_line.organization_id
          INNER JOIN products product
            ON product.id = variant.product_id
           AND product.organization_id = variant.organization_id
          LEFT JOIN sale_line_cost_snapshots snap
            ON snap.sales_order_line_id = return_line.sales_order_line_id
           AND snap.organization_id = return_line.organization_id
          LEFT JOIN variant_cost_states cost_state
            ON cost_state.product_variant_id = return_line.product_variant_id
           AND cost_state.organization_id = return_line.organization_id
          WHERE return_line.organization_id = ${organizationId}::uuid
            AND sale_return.returned_at >= ${range.start}
            AND sale_return.returned_at < ${range.end}
        ),
        per_product AS (
          SELECT
            product_id,
            name,
            product_code,
            SUM(quantity) AS quantity,
            SUM(returned) AS returned,
            COALESCE(SUM(revenue), 0) AS revenue,
            COALESCE(SUM(cost), 0) AS cost,
            COALESCE(SUM(ROUND(cost * extra_ratio)), 0) AS extra,
            COALESCE(SUM(revenue) FILTER (WHERE cost IS NOT NULL), 0) AS costed_revenue,
            COALESCE(SUM(revenue) FILTER (WHERE cost IS NULL), 0) AS uncosted_revenue
          FROM sale_lines
          GROUP BY product_id, name, product_code
        )
        SELECT
          product_id::text AS product_id,
          name,
          product_code,
          quantity::bigint AS quantity,
          returned::bigint AS returned_quantity,
          revenue::bigint AS revenue_minor,
          cost::bigint AS cost_minor,
          -- Rounding never makes the extra cost bigger than the cost itself.
          (CASE WHEN cost >= 0 THEN LEAST(extra, cost) ELSE GREATEST(extra, cost) END)::bigint AS extra_cost_minor,
          costed_revenue::bigint AS costed_revenue_minor,
          uncosted_revenue::bigint AS uncosted_revenue_minor
        FROM per_product`,
    ]);
    const lineByDate = new Map(lines.map((row) => [row.date, row]));
    const orderByDate = new Map(orders.map((row) => [row.date, row]));
    // A day with only returns has no orders but still changes the profit.
    const dates = [...new Set([...orderByDate.keys(), ...lineByDate.keys()])];
    return {
      channels: channels.map((row) => ({
        channel: row.channel,
        previousPeriodMinor: toNumber(row.previous_minor),
        salesMinor: toNumber(row.sales_minor),
      })),
      daily: dates.map((date) => {
        const line = lineByDate.get(date);
        const order = orderByDate.get(date);
        return {
          costMinor: toNumber(line?.cost_minor),
          costedSalesMinor: toNumber(line?.costed_sales_minor),
          date,
          saleCount: toNumber(order?.sale_count),
          salesMinor: toNumber(order?.sales_minor),
        };
      }),
      productProfits: productProfits.map((row) => ({
        costMinor: toNumber(row.cost_minor),
        costedRevenueMinor: toNumber(row.costed_revenue_minor),
        extraCostMinor: toNumber(row.extra_cost_minor),
        name: row.name,
        productCode: row.product_code,
        productId: row.product_id,
        quantity: toNumber(row.quantity),
        returnedQuantity: toNumber(row.returned_quantity),
        revenueMinor: toNumber(row.revenue_minor),
        uncostedRevenueMinor: toNumber(row.uncosted_revenue_minor),
      })),
      refundsMinor: toNumber(refunds[0]?.refunds_minor),
      topProducts: topProducts.map((row) => ({
        name: row.name,
        productId: row.product_id,
        quantity: toNumber(row.quantity),
        revenueMinor: toNumber(row.revenue_minor),
      })),
      uncostedSalesMinor: lines.reduce(
        (sum, row) => sum + toNumber(row.uncosted_sales_minor),
        0,
      ),
    };
  }
}

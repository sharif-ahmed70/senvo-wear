import type {
  OperationalReport,
  OperationalReportRepository,
  PaymentMethod,
} from "@senvo/domain";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";

type ReportClient = Pick<PrismaClient, "$queryRaw">;
type NumberValue = bigint | number;

export class PrismaOperationalReportRepository implements OperationalReportRepository {
  constructor(private readonly prisma: ReportClient) {}

  async get(input: {
    from: string;
    organizationId: string;
    to: string;
  }): Promise<OperationalReport> {
    const bounds = Prisma.sql`
      WITH report_bounds AS (
        SELECT
          organization.timezone,
          ${input.from}::date AT TIME ZONE organization.timezone AS starts_at,
          (${input.to}::date + 1) AT TIME ZONE organization.timezone AS ends_at
        FROM organizations organization
        WHERE organization.id = ${input.organizationId}::uuid
      )
    `;
    const [
      salesRows,
      paymentRows,
      productRows,
      inventoryRows,
      returnRows,
      reasonRows,
      staffRows,
      financialRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        {
          collected_minor: NumberValue;
          gross_minor: NumberValue;
          order_count: NumberValue;
          outstanding_minor: NumberValue;
          refund_minor: NumberValue;
          return_credit_minor: NumberValue;
          timezone: string;
        }[]
      >`${bounds}
          SELECT
            bounds.timezone,
            COUNT(receipt.id)::bigint AS order_count,
            COALESCE(SUM(receipt.total_minor), 0)::bigint AS gross_minor,
            COALESCE(SUM(batch.paid_minor), 0)::bigint
              + COALESCE(SUM(collections.collected_minor), 0)::bigint AS collected_minor,
            COALESCE(SUM(GREATEST(
              batch.payable_minor - batch.paid_minor
              - COALESCE(collections.collected_minor, 0)
              - COALESCE(returns.return_credit_minor, 0),
              0
            )), 0)::bigint AS outstanding_minor,
            COALESCE(SUM(returns.return_credit_minor), 0)::bigint AS return_credit_minor,
            COALESCE(SUM(refunds.refund_minor), 0)::bigint AS refund_minor
          FROM report_bounds bounds
          LEFT JOIN sales_receipts receipt
            ON receipt.organization_id = ${input.organizationId}::uuid
           AND receipt.issued_at >= bounds.starts_at
           AND receipt.issued_at < bounds.ends_at
          LEFT JOIN payment_batches batch
            ON batch.id = receipt.payment_batch_id
           AND batch.organization_id = receipt.organization_id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(collection.amount_minor), 0)::bigint AS collected_minor
            FROM payment_collections collection
            WHERE collection.payment_batch_id = batch.id
              AND collection.organization_id = batch.organization_id
          ) collections ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(sale_return.total_credit_minor), 0)::bigint AS return_credit_minor
            FROM pos_sale_returns sale_return
            WHERE sale_return.sales_order_id = receipt.sales_order_id
              AND sale_return.organization_id = receipt.organization_id
          ) returns ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(refund.amount_minor), 0)::bigint AS refund_minor
            FROM payment_refunds refund
            WHERE refund.sales_order_id = receipt.sales_order_id
              AND refund.organization_id = receipt.organization_id
          ) refunds ON true
          GROUP BY bounds.timezone`,
      this.prisma.$queryRaw<
        { amount_minor: NumberValue; method: PaymentMethod }[]
      >`${bounds},
          payment_events AS (
            SELECT line.method, line.amount_minor, line.created_at
            FROM payment_lines line
            WHERE line.organization_id = ${input.organizationId}::uuid
            UNION ALL
            SELECT line.method, line.amount_minor, line.created_at
            FROM payment_collection_lines line
            WHERE line.organization_id = ${input.organizationId}::uuid
          )
          SELECT event.method, SUM(event.amount_minor)::bigint AS amount_minor
          FROM payment_events event
          CROSS JOIN report_bounds bounds
          WHERE event.created_at >= bounds.starts_at
            AND event.created_at < bounds.ends_at
          GROUP BY event.method
          ORDER BY event.method::text`,
      this.prisma.$queryRaw<
        {
          product_name: string;
          quantity: NumberValue;
          sales_minor: NumberValue;
          sku: string;
        }[]
      >`${bounds}
          SELECT
            line.product_name,
            line.sku,
            SUM(line.quantity)::bigint AS quantity,
            SUM(line.line_total_minor)::bigint AS sales_minor
          FROM sales_receipt_lines line
          INNER JOIN sales_receipts receipt
            ON receipt.id = line.receipt_id
           AND receipt.organization_id = line.organization_id
          CROSS JOIN report_bounds bounds
          WHERE line.organization_id = ${input.organizationId}::uuid
            AND receipt.issued_at >= bounds.starts_at
            AND receipt.issued_at < bounds.ends_at
          GROUP BY line.product_name, line.sku
          ORDER BY sales_minor DESC, quantity DESC, line.sku ASC
          LIMIT 10`,
      this.prisma.$queryRaw<
        {
          available_to_sell: NumberValue;
          on_hand: NumberValue;
          out_of_stock_positions: NumberValue;
          reserved: NumberValue;
          inventory_value_minor: NumberValue;
          low_stock_positions: NumberValue;
        }[]
      >`
          WITH on_hand AS (
            SELECT movement_line.product_variant_id AS variant_id,
              movement.destination_location_id AS location_id,
              SUM(movement_line.quantity)::bigint AS quantity
            FROM inventory_movement_lines movement_line
            INNER JOIN inventory_movements movement
              ON movement.id = movement_line.movement_id
             AND movement.organization_id = movement_line.organization_id
            WHERE movement_line.organization_id = ${input.organizationId}::uuid
              AND movement.status = 'POSTED'
              AND movement.destination_location_id IS NOT NULL
            GROUP BY movement_line.product_variant_id, movement.destination_location_id
          ),
          issued AS (
            SELECT movement_line.product_variant_id AS variant_id,
              movement.source_location_id AS location_id,
              SUM(movement_line.quantity)::bigint AS quantity
            FROM inventory_movement_lines movement_line
            INNER JOIN inventory_movements movement
              ON movement.id = movement_line.movement_id
             AND movement.organization_id = movement_line.organization_id
            WHERE movement_line.organization_id = ${input.organizationId}::uuid
              AND movement.status = 'POSTED'
              AND movement.source_location_id IS NOT NULL
            GROUP BY movement_line.product_variant_id, movement.source_location_id
          ),
          reserved AS (
            SELECT line.product_variant_id AS variant_id,
              reservation.stock_location_id AS location_id,
              SUM(line.quantity)::bigint AS quantity
            FROM inventory_reservation_lines line
            INNER JOIN inventory_reservations reservation
              ON reservation.id = line.reservation_id
             AND reservation.organization_id = line.organization_id
            WHERE line.organization_id = ${input.organizationId}::uuid
              AND reservation.status = 'ACTIVE'
            GROUP BY line.product_variant_id, reservation.stock_location_id
          ),
          positions AS (
            SELECT COALESCE(on_hand.variant_id, issued.variant_id, reserved.variant_id) AS variant_id,
              COALESCE(on_hand.location_id, issued.location_id, reserved.location_id) AS location_id,
              COALESCE(on_hand.quantity, 0) - COALESCE(issued.quantity, 0) AS on_hand,
              COALESCE(reserved.quantity, 0) AS reserved
            FROM on_hand
            FULL OUTER JOIN issued
              ON issued.variant_id = on_hand.variant_id AND issued.location_id = on_hand.location_id
            FULL OUTER JOIN reserved
              ON reserved.variant_id = COALESCE(on_hand.variant_id, issued.variant_id)
             AND reserved.location_id = COALESCE(on_hand.location_id, issued.location_id)
          )
          SELECT
            COALESCE(SUM(on_hand), 0)::bigint AS on_hand,
            COALESCE(SUM(reserved), 0)::bigint AS reserved,
            COALESCE(SUM(on_hand - reserved), 0)::bigint AS available_to_sell,
            COUNT(*) FILTER (WHERE on_hand - reserved <= 0)::bigint AS out_of_stock_positions,
            COUNT(*) FILTER (WHERE on_hand - reserved BETWEEN 1 AND 5)::bigint AS low_stock_positions,
            COALESCE(SUM(on_hand * variant.cost_price_minor), 0)::bigint AS inventory_value_minor
          FROM positions
          INNER JOIN product_variants variant
            ON variant.id = positions.variant_id
           AND variant.organization_id = ${input.organizationId}::uuid`,
      this.prisma.$queryRaw<
        {
          credit_minor: NumberValue;
          refund_count: NumberValue;
          refund_minor: NumberValue;
          return_count: NumberValue;
        }[]
      >`${bounds}
          SELECT
            COALESCE(return_totals.return_count, 0)::bigint AS return_count,
            COALESCE(return_totals.credit_minor, 0)::bigint AS credit_minor,
            COALESCE(refund_totals.refund_count, 0)::bigint AS refund_count,
            COALESCE(refund_totals.refund_minor, 0)::bigint AS refund_minor
          FROM report_bounds bounds
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::bigint AS return_count,
              COALESCE(SUM(sale_return.total_credit_minor), 0)::bigint AS credit_minor
            FROM pos_sale_returns sale_return
            WHERE sale_return.organization_id = ${input.organizationId}::uuid
              AND sale_return.returned_at >= bounds.starts_at
              AND sale_return.returned_at < bounds.ends_at
          ) return_totals ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::bigint AS refund_count,
              COALESCE(SUM(refund.amount_minor), 0)::bigint AS refund_minor
            FROM payment_refunds refund
            WHERE refund.organization_id = ${input.organizationId}::uuid
              AND refund.issued_at >= bounds.starts_at
              AND refund.issued_at < bounds.ends_at
          ) refund_totals ON true`,
      this.prisma.$queryRaw<{ count: NumberValue; reason: string }[]>`${bounds}
          SELECT sale_return.reason_code::text AS reason, COUNT(*)::bigint AS count
          FROM pos_sale_returns sale_return
          CROSS JOIN report_bounds bounds
          WHERE sale_return.organization_id = ${input.organizationId}::uuid
            AND sale_return.returned_at >= bounds.starts_at
            AND sale_return.returned_at < bounds.ends_at
          GROUP BY sale_return.reason_code
          ORDER BY count DESC`,
      this.prisma.$queryRaw<
        {
          collected_minor: NumberValue;
          name: string;
          order_count: NumberValue;
          sales_minor: NumberValue;
        }[]
      >`${bounds}
          SELECT receipt.staff_name AS name,
            COUNT(*)::bigint AS order_count,
            SUM(receipt.total_minor)::bigint AS sales_minor,
            SUM(receipt.paid_minor)::bigint AS collected_minor
          FROM sales_receipts receipt
          CROSS JOIN report_bounds bounds
          WHERE receipt.organization_id = ${input.organizationId}::uuid
            AND receipt.issued_at >= bounds.starts_at
            AND receipt.issued_at < bounds.ends_at
          GROUP BY receipt.staff_name
          ORDER BY sales_minor DESC, receipt.staff_name ASC`,
      this.prisma.$queryRaw<
        {
          customer_due_minor: NumberValue;
          profit_estimate_minor: NumberValue;
          vendor_payable_minor: NumberValue;
        }[]
      >`${bounds}
          SELECT
            COALESCE((
              SELECT SUM(GREATEST(
                batch.payable_minor - batch.paid_minor
                - COALESCE(collections.amount_minor, 0)
                - COALESCE(credits.amount_minor, 0),
                0
              ))
              FROM payment_batches batch
              LEFT JOIN LATERAL (
                SELECT SUM(collection.amount_minor)::bigint AS amount_minor
                FROM payment_collections collection
                WHERE collection.payment_batch_id = batch.id
                  AND collection.organization_id = batch.organization_id
              ) collections ON true
              LEFT JOIN LATERAL (
                SELECT SUM(sale_return.total_credit_minor)::bigint AS amount_minor
                FROM pos_sale_returns sale_return
                WHERE sale_return.sales_order_id = batch.sales_order_id
                  AND sale_return.organization_id = batch.organization_id
              ) credits ON true
              WHERE batch.organization_id = ${input.organizationId}::uuid
            ), 0)::bigint AS customer_due_minor,
            COALESCE((
              SELECT SUM(line.line_total_minor - line.quantity * variant.cost_price_minor)
              FROM sales_receipt_lines line
              INNER JOIN sales_receipts receipt
                ON receipt.id = line.receipt_id
               AND receipt.organization_id = line.organization_id
              INNER JOIN product_variants variant
                ON variant.organization_id = line.organization_id
               AND variant.sku = line.sku
              CROSS JOIN report_bounds period
              WHERE line.organization_id = ${input.organizationId}::uuid
                AND receipt.issued_at >= period.starts_at
                AND receipt.issued_at < period.ends_at
            ), 0)::bigint AS profit_estimate_minor,
            GREATEST(
              COALESCE((
                SELECT SUM(purchase.total_minor)
                FROM purchase_orders purchase
                WHERE purchase.organization_id = ${input.organizationId}::uuid
                  AND purchase.status = 'RECEIVED'
              ), 0) -
              COALESCE((
                SELECT SUM(payment.amount_minor)
                FROM vendor_payments payment
                WHERE payment.organization_id = ${input.organizationId}::uuid
              ), 0),
              0
            )::bigint AS vendor_payable_minor
          FROM report_bounds`,
    ]);
    const sales = salesRows[0];
    const inventory = inventoryRows[0];
    const returns = returnRows[0];
    const financials = financialRows[0];
    return {
      inventory: {
        availableToSell: number(inventory?.available_to_sell),
        onHand: number(inventory?.on_hand),
        outOfStockPositions: number(inventory?.out_of_stock_positions),
        reserved: number(inventory?.reserved),
        inventoryValueMinor: number(inventory?.inventory_value_minor),
        lowStockPositions: number(inventory?.low_stock_positions),
      },
      payments: paymentRows.map((row) => ({
        amountMinor: number(row.amount_minor),
        method: row.method,
      })),
      period: {
        from: input.from,
        timezone: sales?.timezone ?? "Asia/Dhaka",
        to: input.to,
      },
      products: productRows.map((row) => ({
        productName: row.product_name,
        quantity: number(row.quantity),
        salesMinor: number(row.sales_minor),
        sku: row.sku,
      })),
      returns: {
        count: number(returns?.return_count),
        creditMinor: number(returns?.credit_minor),
        refundCount: number(returns?.refund_count),
        refundMinor: number(returns?.refund_minor),
        reasons: reasonRows.map((row) => ({
          count: number(row.count),
          reason: row.reason,
        })),
      },
      sales: {
        collectedMinor: number(sales?.collected_minor),
        grossMinor: number(sales?.gross_minor),
        orderCount: number(sales?.order_count),
        outstandingMinor: number(sales?.outstanding_minor),
        refundMinor: number(sales?.refund_minor),
        returnCreditMinor: number(sales?.return_credit_minor),
        customerDueMinor: number(financials?.customer_due_minor),
        profitEstimateMinor: number(financials?.profit_estimate_minor),
        vendorPayableMinor: number(financials?.vendor_payable_minor),
      },
      staff: staffRows.map((row) => ({
        collectedMinor: number(row.collected_minor),
        name: row.name,
        orderCount: number(row.order_count),
        salesMinor: number(row.sales_minor),
      })),
    };
  }
}

function number(value: NumberValue | undefined): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result)) throw new Error("Report value is unsafe.");
  return result;
}

import { CheckCircle2, Printer, ReceiptText, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { PosCheckoutContract } from "@senvo/contracts";
import { formatBdt } from "../_lib/money";

const statusLabels = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Payment due",
  UNRECORDED: "Payment not recorded",
} as const;

export function SaleSuccess({
  canReadReceipt,
  checkout,
  onNextSale,
  preparingNext,
}: {
  canReadReceipt: boolean;
  checkout: PosCheckoutContract;
  onNextSale: () => void;
  preparingNext: boolean;
}) {
  const receiptUrl = `/pos/checkouts/${checkout.id}/receipt`;
  return (
    <main className="pos-sale-page">
      <section className="pos-sale-success" aria-live="polite">
        <CheckCircle2 aria-hidden="true" size={38} />
        <span>Sale completed</span>
        <h1>{checkout.orderNumber}</h1>
        <dl>
          <div>
            <dt>Total</dt>
            <dd>{formatBdt(checkout.totalMinor)}</dd>
          </div>
          <div>
            <dt>Amount paid</dt>
            <dd>{formatBdt(checkout.paidMinor ?? 0)}</dd>
          </div>
          <div>
            <dt>Remaining due</dt>
            <dd>{formatBdt(checkout.outstandingMinor ?? 0)}</dd>
          </div>
          <div>
            <dt>Payment status</dt>
            <dd>{statusLabels[checkout.paymentStatus]}</dd>
          </div>
          <div>
            <dt>Sales counter</dt>
            <dd>{checkout.counterName}</dd>
          </div>
        </dl>
        <div className="pos-sale-success__actions">
          {canReadReceipt && checkout.receiptId ? (
            <>
              <Link href={receiptUrl}>
                <ReceiptText size={18} />
                View receipt
              </Link>
              <Link href={receiptUrl}>
                <Printer size={18} />
                Print receipt
              </Link>
            </>
          ) : (
            <p>Receipt actions are not available for your role.</p>
          )}
          <button disabled={preparingNext} onClick={onNextSale} type="button">
            <RotateCcw size={18} />
            {preparingNext ? "Preparing..." : "Start new sale"}
          </button>
        </div>
      </section>
    </main>
  );
}

import {
  CheckCircle2,
  Clock3,
  Printer,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Store,
} from "lucide-react";
import Link from "next/link";
import type { PosCheckoutContract } from "@senvo/contracts";
import type { FriendlyPosError } from "../_lib/pos-error-messages";
import { formatBdt } from "../_lib/money";

const statusLabels = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  REFUND_DUE: "Refund due",
  SETTLED: "Settled by return",
  UNPAID: "Payment due",
  UNRECORDED: "Payment not recorded",
} as const;

export function SaleSuccess({
  canReadReceipt,
  checkout,
  onNextSale,
  preparationError,
  preparingNext,
}: {
  canReadReceipt: boolean;
  checkout: PosCheckoutContract;
  onNextSale: () => void;
  preparationError: FriendlyPosError | null;
  preparingNext: boolean;
}) {
  const receiptUrl = `/pos/checkouts/${checkout.id}/receipt`;
  const outstandingMinor = checkout.outstandingMinor ?? 0;
  const paidMinor = checkout.paidMinor ?? 0;

  return (
    <main className="pos-sale-page pos-sale-success-page">
      <section className="pos-success-shell" aria-live="polite">
        <header className="pos-success-hero">
          <div className="pos-success-mark" aria-hidden="true">
            <CheckCircle2 size={34} />
          </div>
          <div className="pos-success-copy">
            <span>Sale completed</span>
            <h1>{checkout.orderNumber}</h1>
            <p>
              The sale is recorded. Payment, order, inventory consumption and
              receipt records are now part of the transaction history.
            </p>
          </div>
          <div className="pos-success-total">
            <span>Total</span>
            <strong>{formatBdt(checkout.totalMinor)}</strong>
            <small>{statusLabels[checkout.paymentStatus]}</small>
          </div>
        </header>

        <section className="pos-success-facts" aria-label="Completed sale details">
          <article>
            <ShoppingBag aria-hidden="true" size={18} />
            <div>
              <span>Paid</span>
              <strong>{formatBdt(paidMinor)}</strong>
            </div>
          </article>
          <article className={outstandingMinor > 0 ? "pos-success-fact--due" : undefined}>
            <Clock3 aria-hidden="true" size={18} />
            <div>
              <span>Remaining due</span>
              <strong>{formatBdt(outstandingMinor)}</strong>
            </div>
          </article>
          <article>
            <Store aria-hidden="true" size={18} />
            <div>
              <span>Sales counter</span>
              <strong>{checkout.counterName}</strong>
            </div>
          </article>
        </section>

        <section className="pos-success-actions" aria-label="Next actions">
          <div>
            <span>Next step</span>
            <h2>Receipt or next customer</h2>
            <p>
              Keep the counter moving. Open the receipt when needed, or start
              the next sale immediately.
            </p>
          </div>
          <div className="pos-success-actions__buttons">
            {canReadReceipt && checkout.receiptId ? (
              <>
                <Link className="pos-success-secondary" href={receiptUrl}>
                  <ReceiptText aria-hidden="true" size={18} />
                  View receipt
                </Link>
                <Link
                  className="pos-success-secondary"
                  href={`${receiptUrl}?print=1`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Printer aria-hidden="true" size={18} />
                  Print receipt
                </Link>
              </>
            ) : (
              <span className="pos-success-restricted">
                Receipt actions are restricted for this role.
              </span>
            )}
            <button
              className="pos-success-primary"
              disabled={preparingNext}
              onClick={onNextSale}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={18} />
              {preparingNext ? "Preparing next sale..." : "Start new sale"}
            </button>
          </div>
        </section>

        {preparationError ? (
          <div className="pos-success-retry" role="alert">
            <strong>The completed sale is safe.</strong>
            <span>{preparationError.message}</span>
            {preparationError.requestId ? (
              <small>Support reference: {preparationError.requestId}</small>
            ) : null}
            <span>Use Start new sale again to retry only the next-sale preparation.</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}

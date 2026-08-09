"use client";

import type {
  PosReturnAccountContract,
  PosReturnReasonCode,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  CircleAlert,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { formatBdt } from "../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
const reasonLabels: Record<PosReturnReasonCode, string> = {
  CHANGED_MIND: "Changed mind",
  DEFECTIVE: "Defective item",
  OTHER: "Other",
  SIZE_OR_FIT: "Size or fit",
  WRONG_ITEM: "Wrong item",
};

export function CheckoutReturnWorkspace({
  checkoutId,
  permissions,
}: {
  checkoutId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead =
    permissions.includes("POS:READ") &&
    permissions.includes("SALES:READ") &&
    permissions.includes("PAYMENT:READ");
  const canCreate =
    permissions.includes("POS:UPDATE") &&
    permissions.includes("SALES:UPDATE") &&
    permissions.includes("INVENTORY:CREATE") &&
    permissions.includes("PAYMENT:APPROVE");
  const canReadLocations = permissions.includes("INVENTORY:READ");
  const canReadReceipt =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ") &&
    permissions.includes("SALES:READ");
  const [account, setAccount] = useState<PosReturnAccountContract | null>(null);
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [reasonCode, setReasonCode] =
    useState<PosReturnReasonCode>("SIZE_OR_FIT");
  const [reasonNote, setReasonNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(canRead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: string;
    receiptNumber: string;
    totalCreditMinor: number;
  } | null>(null);
  const attemptKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const [returnsResult, locationsResult] = await Promise.all([
        client.getPosReturns(checkoutId),
        canReadLocations
          ? client.listStockLocations({ pageSize: 100 })
          : Promise.resolve({
              data: { hasMore: false, items: [], nextCursor: null },
              requestId: "local",
            }),
      ]);
      setAccount(returnsResult.data);
      const returnHolds = locationsResult.data.items.filter(
        (location) =>
          location.status === "ACTIVE" &&
          location.type === "RETURN_HOLD" &&
          !location.isSellable,
      );
      setLocations(returnHolds);
      setDestinationLocationId(
        (current) => current || returnHolds.at(0)?.id || "",
      );
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, [canRead, canReadLocations, checkoutId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const lines = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([salesOrderLineId, quantity]) => ({ quantity, salesOrderLineId }));
    if (!destinationLocationId || lines.length === 0) {
      setError("Choose a Return hold location and at least one item quantity.");
      return;
    }
    attemptKey.current ??= `pos-return-${crypto.randomUUID()}`;
    setSaving(true);
    setError(null);
    try {
      const result = await client.createPosReturn({
        checkoutId,
        destinationLocationId,
        idempotencyKey: attemptKey.current,
        lines,
        reasonCode,
        ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
      });
      setAccount(result.data.account);
      setSuccess({
        id: result.data.saleReturn.id,
        receiptNumber: result.data.saleReturn.receiptNumber,
        totalCreditMinor: result.data.saleReturn.totalCreditMinor,
      });
      setQuantities({});
      setReasonNote("");
      attemptKey.current = null;
    } catch (reason) {
      setError(messageFor(reason));
      if (
        reason instanceof AdminApiError &&
        ["BUSINESS_RULE.VIOLATION", "CONCURRENCY.CONFLICT"].includes(
          reason.code,
        )
      ) {
        try {
          setAccount((await client.getPosReturns(checkoutId)).data);
        } catch {
          // Keep the original actionable error visible.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canRead)
    return (
      <State
        title="Return access unavailable"
        text="Your role does not include sales return history access."
      />
    );
  if (loading)
    return (
      <State
        loading
        title="Loading returns"
        text="Checking this sale and its return history."
      />
    );
  if (!account)
    return (
      <State
        title="Return information unavailable"
        text={error ?? "This sale could not be loaded."}
      />
    );
  const hasReturnable = account.lines.some(
    (line) => line.returnableQuantity > 0,
  );
  const previewTotalMinor = account.lines.reduce(
    (total, line) =>
      total +
      previewCredit(
        line.originalLineTotalMinor,
        line.soldQuantity,
        line.returnedQuantity,
        quantities[line.salesOrderLineId] ?? 0,
      ),
    0,
  );

  return (
    <section className="pos-payment-page" aria-labelledby="return-heading">
      <header className="pos-page-heading">
        <div>
          <span>Sales return</span>
          <h2 id="return-heading">Return items from {account.orderNumber}</h2>
          <p>
            Returned stock goes to Return hold for review. No cash refund is
            recorded here.
          </p>
        </div>
        <button
          className="pos-secondary-button"
          onClick={() => void load()}
          type="button"
        >
          <RotateCcw size={16} /> Refresh
        </button>
      </header>

      <section className="pos-payment-summary">
        <div>
          <span>Original total</span>
          <strong>{formatBdt(account.originalTotalMinor)}</strong>
        </div>
        <div>
          <span>Return credit</span>
          <strong>{formatBdt(account.returnCreditMinor)}</strong>
        </div>
        <div>
          <span>Adjusted sale</span>
          <strong>
            {account.adjustedPayableMinor === null
              ? "Not recorded"
              : formatBdt(account.adjustedPayableMinor)}
          </strong>
        </div>
        <div>
          <span>Amount received</span>
          <strong>
            {account.cumulativeReceivedMinor === null
              ? "Not recorded"
              : formatBdt(account.cumulativeReceivedMinor)}
          </strong>
        </div>
        <div>
          <span>Amount due</span>
          <strong>
            {account.outstandingMinor === null
              ? "Not recorded"
              : formatBdt(account.outstandingMinor)}
          </strong>
        </div>
        <div>
          <span>Refund due</span>
          <strong>
            {account.refundableMinor === null
              ? "Not recorded"
              : formatBdt(account.refundableMinor)}
          </strong>
        </div>
      </section>

      {error ? (
        <p className="pos-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <ReturnSuccessState
          account={account}
          canReadReceipt={canReadReceipt}
          checkoutId={checkoutId}
          hasReturnable={hasReturnable}
          onReturnMore={() => setSuccess(null)}
          success={success}
        />
      ) : null}

      {!account.legacyPaymentRecorded ? (
        <State
          title="Returns unavailable for this sale"
          text="Returns are not available for this older sale yet."
        />
      ) : canCreate && hasReturnable ? (
        <form
          className="pos-payment-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="pos-form-grid">
            <label>
              Return hold location
              <select
                required
                value={destinationLocationId}
                onChange={(event) =>
                  setDestinationLocationId(event.target.value)
                }
              >
                <option value="">Choose location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <select
                value={reasonCode}
                onChange={(event) =>
                  setReasonCode(event.target.value as PosReturnReasonCode)
                }
              >
                {Object.entries(reasonLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note
              <input
                maxLength={500}
                value={reasonNote}
                onChange={(event) => setReasonNote(event.target.value)}
                placeholder="Optional details"
              />
            </label>
          </div>
          <div className="pos-table-wrap">
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sold</th>
                  <th>Returned</th>
                  <th>Available</th>
                  <th>Return now</th>
                  <th>Credit preview</th>
                </tr>
              </thead>
              <tbody>
                {account.lines.map((line) => (
                  <tr key={line.salesOrderLineId}>
                    <td data-label="Item">
                      <strong>{line.productNameSnapshot}</strong>
                      <br />
                      <span className="pos-muted">
                        {line.skuSnapshot} |{" "}
                        {[line.colorSnapshot, line.sizeSnapshot]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    </td>
                    <td data-label="Sold">{line.soldQuantity}</td>
                    <td data-label="Returned">{line.returnedQuantity}</td>
                    <td data-label="Available">{line.returnableQuantity}</td>
                    <td data-label="Return now">
                      <input
                        aria-label={`Return quantity for ${line.productNameSnapshot}`}
                        disabled={line.returnableQuantity === 0}
                        min={0}
                        max={line.returnableQuantity}
                        step={1}
                        type="number"
                        value={quantities[line.salesOrderLineId] ?? 0}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [line.salesOrderLineId]: Number(event.target.value),
                          }))
                        }
                      />
                    </td>
                    <td data-label="Credit preview">
                      {formatBdt(
                        previewCredit(
                          line.originalLineTotalMinor,
                          line.soldQuantity,
                          line.returnedQuantity,
                          quantities[line.salesOrderLineId] ?? 0,
                        ),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {locations.length === 0 ? (
            <p className="pos-inline-error">
              An active, non-sellable Return hold location is required before
              recording a return.
            </p>
          ) : null}
          <p className="pos-muted">
            Credit preview: {formatBdt(previewTotalMinor)}. The recorded amount
            is calculated again by the server.
          </p>
          <button
            className="pos-primary-button"
            disabled={saving || locations.length === 0}
            type="submit"
          >
            {saving ? (
              <LoaderCircle className="barcode-spin" size={17} />
            ) : (
              <RotateCcw size={17} />
            )}{" "}
            Record return
          </button>
        </form>
      ) : canCreate ? (
        <State
          title="All items returned"
          text="There are no remaining items available to return from this sale."
        />
      ) : (
        <State
          title="Return entry unavailable"
          text="Your role can view return history but cannot record a return."
        />
      )}

      <h2>Return history</h2>
      {account.returns.length === 0 ? (
        <p className="pos-muted">No items have been returned from this sale.</p>
      ) : (
        <section className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>Returned</th>
                <th>Team member</th>
                <th>Reason</th>
                <th>Items</th>
                <th>Credit</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {account.returns.map((item) => (
                <tr key={item.id}>
                  <td data-label="Returned">
                    {new Date(item.returnedAt).toLocaleString("en-BD")}
                  </td>
                  <td data-label="Team member">{item.acceptedByName}</td>
                  <td data-label="Reason">{reasonLabels[item.reasonCode]}</td>
                  <td data-label="Items">
                    {item.lines.reduce((sum, line) => sum + line.quantity, 0)}
                  </td>
                  <td data-label="Credit">
                    {formatBdt(item.totalCreditMinor)}
                  </td>
                  <td data-label="Receipt">
                    {canReadReceipt ? (
                      <Link
                        className="pos-receipt-link"
                        href={`/pos/returns/${item.id}/receipt`}
                      >
                        View
                      </Link>
                    ) : (
                      "Restricted"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}

export function ReturnSuccessState({
  account,
  canReadReceipt,
  checkoutId,
  hasReturnable,
  onReturnMore,
  success,
}: {
  account: PosReturnAccountContract;
  canReadReceipt: boolean;
  checkoutId: string;
  hasReturnable: boolean;
  onReturnMore: () => void;
  success: {
    id: string;
    receiptNumber: string;
    totalCreditMinor: number;
  };
}) {
  return (
    <section className="pos-inline-success" aria-live="polite">
      <strong>Return recorded</strong>
      <span>Items received into Return hold | {success.receiptNumber}</span>
      <span>
        Return credit {formatBdt(success.totalCreditMinor)} | Adjusted total{" "}
        {formatBdt(account.adjustedPayableMinor ?? 0)}
      </span>
      <span>
        Amount due {formatBdt(account.outstandingMinor ?? 0)} | Refund due{" "}
        {formatBdt(account.refundableMinor ?? 0)}
      </span>
      {account.refundableMinor && account.refundableMinor > 0 ? (
        <p>
          Refund due: {formatBdt(account.refundableMinor)}. The return is
          recorded. The refund has not been issued yet.
        </p>
      ) : null}
      {canReadReceipt ? (
        <>
          <Link href={`/pos/returns/${success.id}/receipt`}>
            <ReceiptText size={16} /> View return receipt
          </Link>
          <Link href={`/pos/returns/${success.id}/receipt?print=1`}>
            <ReceiptText size={16} /> Print return receipt
          </Link>
        </>
      ) : null}
      <Link href={`/pos/checkouts/${checkoutId}`}>Back to sale</Link>
      {hasReturnable ? (
        <button
          className="pos-secondary-button"
          onClick={onReturnMore}
          type="button"
        >
          Return more items
        </button>
      ) : null}
    </section>
  );
}

function State({
  loading,
  text,
  title,
}: {
  loading?: boolean;
  text: string;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : CircleAlert;
  return (
    <section className="pos-state">
      <Icon className={loading ? "barcode-spin" : undefined} />
      <strong>{title}</strong>
      <p>{text}</p>
    </section>
  );
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError))
    return "We could not confirm the return result. Retry safely.";
  const messages: Partial<Record<string, string>> = {
    "AUTHORIZATION.FORBIDDEN": "You do not have access to record this return.",
    "BUSINESS_RULE.VIOLATION": reason.message,
    "CONFLICT.IDEMPOTENCY":
      "This return attempt was already used with different details.",
    "CONCURRENCY.CONFLICT":
      "Another update changed this sale. Review the latest details.",
    "INTEGRATION.NETWORK_FAILURE":
      "We could not confirm the return result. Retry safely.",
    "VALIDATION.INVALID_INPUT":
      "Review the location, reason, and item quantities.",
  };
  return `${messages[reason.code] ?? reason.message} (${reason.requestId})`;
}

function previewCredit(
  total: number,
  sold: number,
  returned: number,
  quantity: number,
) {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(sold) ||
    !Number.isSafeInteger(returned) ||
    !Number.isSafeInteger(quantity) ||
    sold <= 0
  )
    return 0;
  const safeQuantity = Math.max(0, Math.min(quantity, sold - returned));
  const totalBigInt = BigInt(total);
  const soldBigInt = BigInt(sold);
  return Number(
    (totalBigInt * BigInt(returned + safeQuantity)) / soldBigInt -
      (totalBigInt * BigInt(returned)) / soldBigInt,
  );
}

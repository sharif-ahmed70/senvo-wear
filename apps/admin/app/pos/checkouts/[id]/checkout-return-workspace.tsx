"use client";

import type {
  PosReturnAccountContract,
  PosReturnReasonCode,
  StockLocationReadContract,
} from "@senvo/contracts";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
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
import styles from "./checkout-return-workspace.module.css";

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
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: string;
    receiptNumber: string;
    totalCreditMinor: number;
  } | null>(null);
  const attemptKey = useRef<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
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
        setDestinationLocationId((current) =>
          returnHolds.some((location) => location.id === current)
            ? current
            : (returnHolds.at(0)?.id ?? ""),
        );
      } catch (reason) {
        setError(messageFor(reason));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canRead, canReadLocations, checkoutId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || saving) return;

    const selectedLines = account.lines.flatMap((line) => {
      const quantity = quantities[line.salesOrderLineId] ?? 0;
      if (quantity === 0) return [];
      return [{
        quantity,
        salesOrderLineId: line.salesOrderLineId,
        returnableQuantity: line.returnableQuantity,
      }];
    });

    if (!destinationLocationId || selectedLines.length === 0) {
      setError("Choose a Return hold location and at least one item quantity.");
      return;
    }

    if (
      selectedLines.some(
        (line) =>
          !Number.isSafeInteger(line.quantity) ||
          line.quantity <= 0 ||
          line.quantity > line.returnableQuantity,
      )
    ) {
      setError("Review the return quantities before recording this return.");
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
        lines: selectedLines.map(({ quantity, salesOrderLineId }) => ({
          quantity,
          salesOrderLineId,
        })),
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
      setUncertain(false);
      attemptKey.current = null;
    } catch (reason) {
      const uncertainResult =
        !(reason instanceof AdminApiError) ||
        reason.code === "INTEGRATION.NETWORK_FAILURE";
      setUncertain(uncertainResult);
      setError(messageFor(reason));

      if (!uncertainResult) {
        attemptKey.current = null;
      }

      if (
        reason instanceof AdminApiError &&
        ["BUSINESS_RULE.VIOLATION", "CONCURRENCY.CONFLICT"].includes(
          reason.code,
        )
      ) {
        try {
          setAccount((await client.getPosReturns(checkoutId)).data);
          setQuantities({});
        } catch {
          // Preserve the original actionable error if the refresh also fails.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className={styles.section}>
        <State
          title="Return access unavailable"
          text="Your role does not include sales return history access."
        />
      </section>
    );
  }

  if (loading) {
    return (
      <section className={styles.section}>
        <State
          loading
          title="Loading returns"
          text="Checking this sale, returnable quantities and return history."
        />
      </section>
    );
  }

  if (!account) {
    return (
      <section className={styles.section}>
        <State
          title="Return information unavailable"
          text={error ?? "This sale could not be loaded."}
        />
      </section>
    );
  }

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
    <section className={styles.section} aria-labelledby="return-heading">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.eyebrow}>Checkout · Sales return</span>
          <h2 id="return-heading">Return items from {account.orderNumber}</h2>
          <p>
            Receive returned items into a non-sellable Return hold location.
            This records return credit only; any refund due is handled separately.
          </p>
        </div>
        <button
          className={styles.refreshButton}
          disabled={refreshing || saving || uncertain}
          onClick={() => void load("refresh")}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={refreshing ? styles.spin : undefined}
            size={16}
          />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className={styles.summary} aria-label="Return account summary">
        <div>
          <span>Original total</span>
          <strong>{formatBdt(account.originalTotalMinor)}</strong>
        </div>
        <div>
          <span>Return credit</span>
          <strong>{formatBdt(account.returnCreditMinor)}</strong>
        </div>
        <div>
          <span>Adjusted payable</span>
          <strong>{formatNullableMoney(account.adjustedPayableMinor)}</strong>
        </div>
        <div>
          <span>Amount received</span>
          <strong>{formatNullableMoney(account.cumulativeReceivedMinor)}</strong>
        </div>
        <div className={styles.due}>
          <span>Amount due</span>
          <strong>{formatNullableMoney(account.outstandingMinor)}</strong>
        </div>
        <div className={styles.refund}>
          <span>Refund due</span>
          <strong>{formatNullableMoney(account.refundableMinor)}</strong>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <ReturnSuccessState
          account={account}
          canReadReceipt={canReadReceipt}
          hasReturnable={hasReturnable}
          onReturnMore={() => setSuccess(null)}
          success={success}
        />
      ) : null}

      {!success ? (
        !account.legacyPaymentRecorded ? (
          <State
            title="Returns unavailable for this sale"
            text="This older sale does not have recorded payment history, so a return cannot be posted safely."
          />
        ) : !hasReturnable ? (
          <State
            success
            title="All items returned"
            text="There are no remaining quantities available to return from this sale."
          />
        ) : !canCreate ? (
          <State
            title="Return entry unavailable"
            text="Your role can view return history but cannot record a return."
          />
        ) : !canReadLocations ? (
          <State
            title="Return hold access unavailable"
            text="Inventory read access is required to choose an approved Return hold location."
          />
        ) : (
          <form onSubmit={submit}>
            <div className={styles.workspace}>
              <section className={styles.itemsPanel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h3>Choose returned items</h3>
                    <p>Only quantities still available for return can be selected.</p>
                  </div>
                  <span className={styles.historyCount}>
                    {account.lines.filter((line) => line.returnableQuantity > 0).length} returnable lines
                  </span>
                </header>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
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
                      {account.lines.map((line) => {
                        const quantity = quantities[line.salesOrderLineId] ?? 0;
                        return (
                          <tr key={line.salesOrderLineId}>
                            <td data-label="Item">
                              <span className={styles.itemName}>
                                {line.productNameSnapshot}
                              </span>
                              <span className={styles.itemMeta}>
                                {line.skuSnapshot}
                                {[line.colorSnapshot, line.sizeSnapshot]
                                  .filter(Boolean)
                                  .map((value) => ` · ${value}`)
                                  .join("")}
                              </span>
                            </td>
                            <td data-label="Sold">{line.soldQuantity}</td>
                            <td data-label="Returned">{line.returnedQuantity}</td>
                            <td data-label="Available">
                              <span
                                className={
                                  line.returnableQuantity > 0
                                    ? styles.available
                                    : styles.zero
                                }
                              >
                                {line.returnableQuantity}
                              </span>
                            </td>
                            <td data-label="Return now">
                              <input
                                aria-label={`Return quantity for ${line.productNameSnapshot}`}
                                className={styles.quantityInput}
                                disabled={
                                  uncertain ||
                                  saving ||
                                  line.returnableQuantity === 0
                                }
                                min={0}
                                max={line.returnableQuantity}
                                step={1}
                                type="number"
                                value={quantity}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.salesOrderLineId]: Number.isFinite(next)
                                      ? next
                                      : 0,
                                  }));
                                  if (!uncertain) setError(null);
                                }}
                              />
                            </td>
                            <td data-label="Credit preview">
                              <span className={styles.preview}>
                                {formatBdt(
                                  previewCredit(
                                    line.originalLineTotalMinor,
                                    line.soldQuantity,
                                    line.returnedQuantity,
                                    quantity,
                                  ),
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className={styles.setupPanel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h3>Return setup</h3>
                    <p>Choose where the items go and why they were returned.</p>
                  </div>
                </header>

                <div className={styles.setupBody}>
                  {uncertain ? (
                    <div className={styles.uncertain} role="status">
                      <CircleAlert aria-hidden="true" size={17} />
                      <span>
                        We could not confirm the previous result. Details are
                        locked so the same idempotent attempt can be retried safely.
                      </span>
                    </div>
                  ) : null}

                  <label className={styles.field}>
                    <span>Return hold location</span>
                    <select
                      disabled={uncertain || saving}
                      required
                      value={destinationLocationId}
                      onChange={(event) => {
                        setDestinationLocationId(event.target.value);
                        setError(null);
                      }}
                    >
                      <option value="">Choose Return hold</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      Only active, non-sellable RETURN_HOLD locations are shown.
                    </small>
                  </label>

                  <label className={styles.field}>
                    <span>Reason</span>
                    <select
                      disabled={uncertain || saving}
                      value={reasonCode}
                      onChange={(event) => {
                        setReasonCode(event.target.value as PosReturnReasonCode);
                        setError(null);
                      }}
                    >
                      {Object.entries(reasonLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Optional note</span>
                    <input
                      disabled={uncertain || saving}
                      maxLength={500}
                      onChange={(event) => {
                        setReasonNote(event.target.value);
                        setError(null);
                      }}
                      placeholder="Add useful return details"
                      value={reasonNote}
                    />
                    <small>Up to 500 characters.</small>
                  </label>

                  {locations.length === 0 ? (
                    <div className={styles.locationWarning}>
                      <CircleAlert aria-hidden="true" size={17} />
                      <span>
                        An active, non-sellable Return hold location is required
                        before a return can be recorded.
                      </span>
                    </div>
                  ) : null}

                  <div className={styles.previewCard}>
                    <div>
                      <span>Credit preview</span>
                      <strong>{formatBdt(previewTotalMinor)}</strong>
                    </div>
                    <p>
                      Preview only. The server recalculates the final return
                      credit when the return is recorded.
                    </p>
                  </div>

                  <button
                    className={styles.primaryButton}
                    disabled={saving || locations.length === 0}
                    type="submit"
                  >
                    {saving ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className={styles.spin}
                        size={17}
                      />
                    ) : (
                      <RotateCcw aria-hidden="true" size={17} />
                    )}
                    {saving
                      ? "Recording return..."
                      : uncertain
                        ? "Retry return safely"
                        : "Record return"}
                  </button>
                </div>
              </aside>
            </div>
          </form>
        )
      ) : null}

      <section className={styles.historyPanel}>
        <header className={styles.historyHeader}>
          <div>
            <span>Recorded history</span>
            <h3>Return history</h3>
            <p>Append-only return records for this completed checkout.</p>
          </div>
          <span className={styles.historyCount}>
            {account.returns.length} return{account.returns.length === 1 ? "" : "s"}
          </span>
        </header>

        {account.returns.length === 0 ? (
          <div className={styles.emptyInline}>
            No items have been returned from this sale.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
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
                    <td data-label="Returned">{formatDate(item.returnedAt)}</td>
                    <td data-label="Team member">{item.acceptedByName}</td>
                    <td data-label="Reason">{reasonLabels[item.reasonCode]}</td>
                    <td data-label="Items">
                      {item.lines.reduce((sum, line) => sum + line.quantity, 0)}
                    </td>
                    <td data-label="Credit">
                      <strong>{formatBdt(item.totalCreditMinor)}</strong>
                    </td>
                    <td data-label="Receipt">
                      {canReadReceipt ? (
                        <Link
                          className={styles.tableLink}
                          href={`/pos/returns/${item.id}/receipt`}
                        >
                          View
                        </Link>
                      ) : (
                        <span className={styles.restricted}>Restricted</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function ReturnSuccessState({
  account,
  canReadReceipt,
  hasReturnable,
  onReturnMore,
  success,
}: {
  account: PosReturnAccountContract;
  canReadReceipt: boolean;
  hasReturnable: boolean;
  onReturnMore: () => void;
  success: {
    id: string;
    receiptNumber: string;
    totalCreditMinor: number;
  };
}) {
  return (
    <section className={styles.successCard} aria-live="polite">
      <div className={styles.successHeading}>
        <CheckCircle2 aria-hidden="true" size={22} />
        <div>
          <strong>Return recorded</strong>
          <span>
            Items moved into Return hold · {success.receiptNumber}
          </span>
        </div>
      </div>

      <div className={styles.successFacts}>
        <div>
          <span>Return credit</span>
          <strong>{formatBdt(success.totalCreditMinor)}</strong>
        </div>
        <div>
          <span>Amount due</span>
          <strong>{formatNullableMoney(account.outstandingMinor)}</strong>
        </div>
        <div>
          <span>Refund due</span>
          <strong>{formatNullableMoney(account.refundableMinor)}</strong>
        </div>
      </div>

      {account.refundableMinor && account.refundableMinor > 0 ? (
        <p className={styles.successNote}>
          This return created a refund due of {formatBdt(account.refundableMinor)}.
          The return is complete, but no refund has been issued from this workflow.
        </p>
      ) : null}

      <div className={styles.successActions}>
        {canReadReceipt ? (
          <>
            <Link
              className={styles.receiptLink}
              href={`/pos/returns/${success.id}/receipt`}
            >
              <ReceiptText aria-hidden="true" size={16} />
              View return receipt
            </Link>
            <Link
              className={styles.receiptLink}
              href={`/pos/returns/${success.id}/receipt?print=1`}
            >
              <ReceiptText aria-hidden="true" size={16} />
              Print receipt
            </Link>
          </>
        ) : null}
        {hasReturnable ? (
          <button
            className={styles.secondaryButton}
            onClick={onReturnMore}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Return more items
          </button>
        ) : null}
      </div>
    </section>
  );
}

function State({
  loading,
  success,
  text,
  title,
}: {
  loading?: boolean;
  success?: boolean;
  text: string;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : success ? CheckCircle2 : CircleAlert;
  return (
    <section
      className={`${styles.stateCard} ${success ? styles.stateSuccess : ""}`}
    >
      <Icon
        aria-hidden="true"
        className={loading ? styles.spin : undefined}
        size={21}
      />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "We could not confirm the return result. Retry safely with the same details.";
  }
  const messages: Partial<Record<string, string>> = {
    "AUTHORIZATION.FORBIDDEN": "You do not have access to record this return.",
    "BUSINESS_RULE.VIOLATION": reason.message,
    "CONFLICT.IDEMPOTENCY":
      "This return attempt was already used with different details.",
    "CONCURRENCY.CONFLICT":
      "Another update changed this sale. Review the latest returnable quantities.",
    "INTEGRATION.NETWORK_FAILURE":
      "We could not confirm the return result. Retry safely with the same details.",
    "VALIDATION.INVALID_INPUT":
      "Review the Return hold location, reason and item quantities.",
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
  ) {
    return 0;
  }
  const safeQuantity = Math.max(0, Math.min(quantity, sold - returned));
  const totalBigInt = BigInt(total);
  const soldBigInt = BigInt(sold);
  return Number(
    (totalBigInt * BigInt(returned + safeQuantity)) / soldBigInt -
      (totalBigInt * BigInt(returned)) / soldBigInt,
  );
}

function formatNullableMoney(value: number | null) {
  return value === null ? "Not recorded" : formatBdt(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

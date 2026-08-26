"use client";

import type {
  OnlinePaymentAdminResultContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleX,
  CreditCard,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "./sales-order-detail-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type SalesAction = "cancel" | "confirm" | "fulfill" | "reserve";

export function SalesOrderDetailWorkspace({
  orderId,
  permissions,
}: {
  orderId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("SALES_ORDER:READ");
  const canUpdate = permissions.includes("SALES_ORDER:UPDATE");
  const canReadPayment = permissions.includes("PAYMENT:READ");
  const canApprovePayment = permissions.includes("PAYMENT:APPROVE");
  const [order, setOrder] = useState<SalesOrderDetailsReadContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<SalesAction | "">("");
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<SalesAction | null>(null);

  const load = useCallback(async () => {
    if (!canRead || !orderId) return;
    setLoading(true);
    setError("");
    try {
      setOrder((await client.getSalesOrder(orderId)).data);
    } catch (caught) {
      setError(safeMessage(caught));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [canRead, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: SalesAction) {
    if (!order || busyAction) return;
    setBusyAction(action);
    setError("");
    setConfirmAction(null);
    try {
      const input = { expectedVersion: order.version, salesOrderId: order.id };
      if (action === "reserve") await client.reserveSalesOrder(input);
      if (action === "confirm") await client.confirmSalesOrder(input);
      if (action === "fulfill") await client.fulfillSalesOrder(input);
      if (action === "cancel") await client.cancelSalesOrder(input);
      await load();
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setBusyAction("");
    }
  }

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Sales order access is restricted"
        text="Your role does not include sales order read permission."
      />
    );
  }

  if (loading) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={28} />}
        title="Loading sales order"
        text="Reading the latest order, inventory and fulfillment state…"
      />
    );
  }

  if (!order) {
    return (
      <StatePanel
        action={<button onClick={() => void load()} type="button">Try again</button>}
        icon={<AlertCircle size={28} />}
        title="Sales order is unavailable"
        text={error || "This order could not be found."}
      />
    );
  }

  const actions = allowedActions(order.status);
  const channelLabel = channelName(order.channel);
  const paymentLabel = paymentPreference(order);
  const deliveryArea = [order.delivery.district, order.delivery.city].filter(Boolean).join(", ") || "Not provided";

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.breadcrumbs}>
            <Link href="/sales/orders"><ArrowLeft size={14} /> Sales Orders</Link>
            <span>/</span>
            <span>{order.orderNumber}</span>
          </div>
          <div className={styles.titleRow}>
            <h1>{order.orderNumber}</h1>
            <StatusBadge value={order.status} />
          </div>
          <p>{channelLabel} · Created {formatDateTime(order.timestamps.createdAt)}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={() => window.print()} type="button">
            <Printer size={16} /> Print order
          </button>
          {canUpdate
            ? actions.map((action) => (
                <button
                  className={action === "cancel" ? styles.dangerButton : styles.primaryButton}
                  disabled={Boolean(busyAction)}
                  key={action}
                  onClick={() => action === "cancel" ? setConfirmAction(action) : void runAction(action)}
                  type="button"
                >
                  {busyAction === action ? <LoaderCircle className={styles.spin} size={15} /> : actionIcon(action)}
                  {actionLabel(action)}
                </button>
              ))
            : null}
        </div>
      </header>

      {error ? (
        <div className={styles.feedback} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")} type="button">Dismiss</button>
        </div>
      ) : null}

      <section className={styles.contextStrip} aria-label="Order context">
        <ContextItem
          icon={<UserRound size={18} />}
          label="Customer"
          primary={order.customer.name ?? "Guest customer"}
          secondary={order.customer.phone ?? order.customer.email ?? "No contact supplied"}
        />
        <ContextItem
          icon={<ShoppingBag size={18} />}
          label="Sales source"
          primary={channelLabel}
          secondary={sourceContext(order)}
        />
        <ContextItem
          icon={<CreditCard size={18} />}
          label="Payment"
          primary={paymentLabel.primary}
          secondary={paymentLabel.secondary}
        />
        <ContextItem
          icon={<MapPin size={18} />}
          label="Delivery area"
          primary={deliveryArea}
          secondary={formatCompactAddress(order.delivery)}
        />
      </section>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.card}>
            <SectionHeader eyebrow="What was ordered" title={`Order Items (${order.lines.length})`} />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant / SKU</th>
                    <th className={styles.numeric}>Qty</th>
                    <th className={styles.numeric}>Unit price</th>
                    <th className={styles.numeric}>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <div className={styles.productCell}>
                          <span className={styles.productGlyph}>{initials(line.productName)}</span>
                          <strong>{line.productName}</strong>
                        </div>
                      </td>
                      <td>
                        <span className={styles.variantText}>{[line.color, line.size].filter(Boolean).join(" / ") || "Standard"}</span>
                        <code>{line.sku}</code>
                      </td>
                      <td className={styles.numeric}>{line.quantity}</td>
                      <td className={styles.numeric}>{formatMoney(line.unitPriceMinor, order.currencyCode)}</td>
                      <td className={`${styles.numeric} ${styles.strongNumber}`}>{formatMoney(line.lineTotalMinor, order.currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.totalPanel}>
              <MoneyRow label="Subtotal" value={formatMoney(order.totals.subtotalMinor, order.currencyCode)} />
              {order.totals.discountMinor ? <MoneyRow label="Discount" value={`−${formatMoney(order.totals.discountMinor, order.currencyCode)}`} /> : null}
              <MoneyRow label="Delivery" value={formatMoney(order.totals.deliveryMinor, order.currencyCode)} />
              <MoneyRow emphasis label="Total" value={formatMoney(order.totals.totalMinor, order.currencyCode)} />
            </div>
          </section>

          <section className={styles.card}>
            <SectionHeader eyebrow="Fulfillment destination" title="Delivery" />
            <div className={styles.deliveryGrid}>
              <InfoBlock label="Recipient" value={order.customer.name ?? "Not provided"} />
              <InfoBlock label="Phone" value={order.customer.phone ?? "Not provided"} />
              <InfoBlock label="Email" value={order.customer.email ?? "Not provided"} />
              <InfoBlock label="Address" value={formatAddress(order.delivery)} wide />
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.card}>
            <SectionHeader eyebrow="Lifecycle" title="Timeline" />
            <ol className={styles.timeline}>
              {timeline(order).map((item, index) => (
                <li key={item.label}>
                  <span className={styles.timelineDot}>{index === timeline(order).length - 1 ? <Check size={12} /> : null}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <time dateTime={item.value}>{formatDateTime(item.value)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.card}>
            <SectionHeader eyebrow="Stock execution" title="Inventory & Fulfillment" />
            <DefinitionList
              rows={[
                ["Reservation", order.inventory.reservation?.status ?? "Not reserved"],
                ["Stock location", order.inventory.reservation?.stockLocation.name ?? "Not assigned"],
                ["Fulfillment", order.inventory.fulfillment.status],
                ["Movement", order.inventory.fulfillment.movement?.movementNumber ?? "Not posted"],
              ]}
            />
          </section>

          {order.commerce ? (
            <PaymentCard
              canApprove={canApprovePayment}
              canRead={canReadPayment}
              order={order}
            />
          ) : null}
        </aside>
      </div>

      {canUpdate && actions.length === 0 ? (
        <div className={styles.readOnlyNote}>
          <CheckCircle2 size={17} />
          <span>No further order-state action is available from the current status.</span>
        </div>
      ) : null}

      {confirmAction === "cancel" ? (
        <ConfirmDialog
          busy={Boolean(busyAction)}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runAction("cancel")}
          orderNumber={order.orderNumber}
        />
      ) : null}
    </main>
  );
}

function PaymentCard({
  canApprove,
  canRead,
  order,
}: {
  canApprove: boolean;
  canRead: boolean;
  order: SalesOrderDetailsReadContract;
}) {
  const online = order.commerce?.paymentPreference === "ONLINE_PAYMENT";
  const [payment, setPayment] = useState<OnlinePaymentAdminResultContract | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const refundKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!online || !canRead) return;
    setError("");
    try {
      setPayment((await client.getOnlinePayment(order.id)).data);
    } catch (caught) {
      setError(safeMessage(caught));
    }
  }, [canRead, online, order.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile() {
    if (!payment || !canApprove) return;
    setBusy(true);
    setError("");
    try {
      setPayment((await client.reconcileOnlinePayment(payment.attempt.id)).data);
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment || !canApprove) return;
    const amountMinor = decimalToMinor(refundAmount);
    if (amountMinor === null) {
      setError("Enter a valid refund amount with no more than two decimal places.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      refundKey.current ??= `admin-refund:${crypto.randomUUID()}`;
      await client.createProviderRefund({
        amountMinor,
        idempotencyKey: refundKey.current,
        paymentAttemptId: payment.attempt.id,
        reason: refundReason.trim(),
      });
      refundKey.current = null;
      setRefundAmount("");
      setRefundReason("");
      await load();
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <SectionHeader eyebrow="Payment record" title="Payment" />
      {!online ? (
        <DefinitionList rows={[["Preference", "Cash on delivery"]]} />
      ) : !canRead ? (
        <p className={styles.helperText}>Your role cannot read provider payment details.</p>
      ) : error && !payment ? (
        <div className={styles.inlineError}><AlertCircle size={15} />{error}</div>
      ) : !payment ? (
        <div className={styles.inlineLoading}><LoaderCircle className={styles.spin} size={16} />Loading provider payment…</div>
      ) : (
        <>
          {error ? <div className={styles.inlineError}><AlertCircle size={15} />{error}</div> : null}
          <DefinitionList
            rows={[
              ["Provider", "SSLCOMMERZ"],
              ["Status", humanize(payment.attempt.status)],
              ["Amount", formatMoney(payment.attempt.amountMinor, payment.attempt.currencyCode)],
              ["Provider reference", payment.attempt.providerTransactionId ?? "Not assigned"],
              ["Resolution", humanize(payment.attempt.resolutionStatus)],
            ]}
          />
          {payment.refunds.length ? (
            <div className={styles.refundHistory}>
              <strong>Refunds</strong>
              {payment.refunds.map((item) => (
                <span key={item.id}>{formatMoney(item.amountMinor, payment.attempt.currencyCode)} · {humanize(item.status)}</span>
              ))}
            </div>
          ) : null}
          {canApprove ? (
            <button className={styles.secondaryButton} disabled={busy} onClick={() => void reconcile()} type="button">
              {busy ? <LoaderCircle className={styles.spin} size={15} /> : <RefreshCw size={15} />} Check provider status
            </button>
          ) : null}
          {canApprove && payment.attempt.status === "SUCCEEDED" ? (
            <form className={styles.refundForm} onSubmit={(event) => void refund(event)}>
              <strong>Provider refund</strong>
              <label>
                <span>Amount ({payment.attempt.currencyCode})</span>
                <input inputMode="decimal" onChange={(event) => setRefundAmount(event.target.value)} required value={refundAmount} />
              </label>
              <label>
                <span>Reason</span>
                <input maxLength={255} minLength={4} onChange={(event) => setRefundReason(event.target.value)} required value={refundReason} />
              </label>
              <button className={styles.dangerOutlineButton} disabled={busy} type="submit">Send refund</button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

function ContextItem({ icon, label, primary, secondary }: { icon: ReactNode; label: string; primary: string; secondary: string }) {
  return <div className={styles.contextItem}><span className={styles.contextIcon}>{icon}</span><div><small>{label}</small><strong>{primary}</strong><span>{secondary}</span></div></div>;
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className={styles.sectionHeader}><div><p>{eyebrow}</p><h2>{title}</h2></div></div>;
}

function MoneyRow({ emphasis, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return <div className={emphasis ? styles.moneyRowStrong : styles.moneyRow}><span>{label}</span><strong>{value}</strong></div>;
}

function InfoBlock({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? styles.infoWide : styles.infoBlock}><span>{label}</span><strong>{value}</strong></div>;
}

function DefinitionList({ rows }: { rows: Array<[string, string]> }) {
  return <dl className={styles.definitionList}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`${styles.statusBadge} ${styles[`status_${value}`] ?? ""}`}>{humanize(value)}</span>;
}

function ConfirmDialog({ busy, onCancel, onConfirm, orderNumber }: { busy: boolean; onCancel: () => void; onConfirm: () => void; orderNumber: string }) {
  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onCancel}>
      <section aria-labelledby="cancel-order-title" aria-modal="true" className={styles.dialog} onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <span className={styles.dialogIcon}><CircleX size={22} /></span>
        <h2 id="cancel-order-title">Cancel {orderNumber}?</h2>
        <p>This changes the real sales-order state. Continue only if the order should no longer proceed.</p>
        <div>
          <button className={styles.secondaryButton} disabled={busy} onClick={onCancel} type="button">Keep order</button>
          <button className={styles.dangerButton} disabled={busy} onClick={onConfirm} type="button">{busy ? <LoaderCircle className={styles.spin} size={15} /> : <CircleX size={15} />} Cancel order</button>
        </div>
      </section>
    </div>
  );
}

function StatePanel({ action, icon, text, title }: { action?: ReactNode; icon: ReactNode; text: string; title: string }) {
  return <main className={styles.page}><section className={styles.statePanel}><span>{icon}</span><h1>{title}</h1><p>{text}</p>{action}</section></main>;
}

function allowedActions(status: SalesOrderDetailsReadContract["status"]): SalesAction[] {
  if (status === "DRAFT") return ["reserve", "cancel"];
  if (status === "RESERVED") return ["confirm", "cancel"];
  if (status === "CONFIRMED") return ["fulfill"];
  return [];
}

function actionLabel(action: SalesAction) {
  if (action === "reserve") return "Reserve stock";
  if (action === "confirm") return "Confirm order";
  if (action === "fulfill") return "Fulfill order";
  return "Cancel order";
}

function actionIcon(action: SalesAction) {
  if (action === "reserve") return <ShieldCheck size={15} />;
  if (action === "confirm") return <CheckCircle2 size={15} />;
  if (action === "fulfill") return <PackageCheck size={15} />;
  return <CircleX size={15} />;
}

function timeline(order: SalesOrderDetailsReadContract) {
  return [
    { label: "Order placed", value: order.timestamps.createdAt },
    order.timestamps.reservedAt ? { label: "Stock reserved", value: order.timestamps.reservedAt } : null,
    order.timestamps.confirmedAt ? { label: "Order confirmed", value: order.timestamps.confirmedAt } : null,
    order.timestamps.fulfilledAt ? { label: "Order fulfilled", value: order.timestamps.fulfilledAt } : null,
    order.timestamps.cancelledAt ? { label: "Order cancelled", value: order.timestamps.cancelledAt } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
}

function paymentPreference(order: SalesOrderDetailsReadContract) {
  if (!order.commerce) return { primary: "Not recorded", secondary: "No commerce preference" };
  if (order.commerce.paymentPreference === "CASH_ON_DELIVERY") return { primary: "Cash on delivery", secondary: "Collect according to order flow" };
  return { primary: "Online payment", secondary: "Provider status available by permission" };
}

function sourceContext(order: SalesOrderDetailsReadContract) {
  if (order.channel === "ONLINE") return "Storefront order";
  if (order.channel === "EVENT_BOOTH") return "Event booth order";
  if (order.channel === "OFFLINE_STORE") return "Store-assisted order";
  if (order.channel === "POS") return "Point of sale";
  return "Manual order";
}

function channelName(value: string) {
  if (value === "ONLINE") return "Online";
  if (value === "OFFLINE_STORE") return "Store";
  if (value === "EVENT_BOOTH") return "Event Booth";
  if (value === "POS") return "POS";
  return humanize(value);
}

function formatAddress(delivery: SalesOrderDetailsReadContract["delivery"]) {
  return [delivery.addressLine1, delivery.addressLine2, delivery.city, delivery.district, delivery.postalCode].filter(Boolean).join(", ") || "No delivery address provided";
}

function formatCompactAddress(delivery: SalesOrderDetailsReadContract["delivery"]) {
  return [delivery.city, delivery.district].filter(Boolean).join(" · ") || "Address details unavailable";
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-BD", { currency, style: "currency" }).format(amountMinor / 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function decimalToMinor(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function initials(value: string) {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SW";
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
}

function safeMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.category === "AUTHENTICATION") return "Sign in is required.";
    if (error.category === "AUTHORIZATION") return "Sales access is restricted.";
    if (error.category === "CONCURRENCY") return "This order changed. Refresh and try again.";
    if (error.category === "NOT_FOUND") return "The sales order was not found.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "The sales service could not complete this request.";
}

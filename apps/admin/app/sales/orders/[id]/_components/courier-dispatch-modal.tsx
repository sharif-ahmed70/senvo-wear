"use client";

import type {
  CourierConsignmentContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import { AlertCircle, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "./courier-dispatch-modal.module.css";

const COURIER_PROVIDERS = [
  { label: "Steadfast Courier", value: "STEADFAST" },
  { label: "Pathao Courier", value: "PATHAO" },
  { label: "RedX", value: "REDX" },
  { label: "Paperfly", value: "PAPERFLY" },
  { label: "In-House Fleet", value: "IN_HOUSE" },
] as const;

export type CourierDispatchModalProps = {
  client: AdminApiClient;
  isOpen: boolean;
  onClose: () => void;
  onDispatched: (consignment: CourierConsignmentContract) => void;
  order: SalesOrderDetailsReadContract;
};

export function CourierDispatchModal({
  client,
  isOpen,
  onClose,
  onDispatched,
  order,
}: CourierDispatchModalProps) {
  const isPaidOnline = order.commerce?.paymentPreference === "ONLINE_PAYMENT";

  const initialCodAmount = isPaidOnline
    ? "0"
    : (order.totals.totalMinor / 100).toFixed(0);

  const initialDeliveryFee = (order.totals.deliveryMinor / 100).toFixed(0);

  const [courierProvider, setCourierProvider] =
    useState<(typeof COURIER_PROVIDERS)[number]["value"]>("STEADFAST");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(initialDeliveryFee);
  const [codAmount, setCodAmount] = useState(initialCodAmount);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const recipientAddress = [
    order.delivery.addressLine1,
    order.delivery.addressLine2,
    order.delivery.city,
    order.delivery.district,
    order.delivery.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;

    setSubmitting(true);
    setError("");

    try {
      const codMinor = (Number(codAmount || 0) * 100).toString();
      const feeMinor = (Number(deliveryFee || 0) * 100).toString();

      const response = await client.dispatchSalesOrder({
        codAmountMinor: codMinor,
        courierProvider,
        deliveryFeeMinor: feeMinor,
        note: note.trim() || undefined,
        salesOrderId: order.id,
        trackingCode: trackingCode.trim() || undefined,
        trackingUrl: trackingUrl.trim() || undefined,
      });

      onDispatched(response.data);
      onClose();
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
      } else {
        setError(
          "Failed to dispatch order. Please check inputs and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-labelledby="dispatch-modal-title"
      aria-modal="true"
      className={styles.overlay}
      role="dialog"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Courier Dispatch</span>
            <h2 className={styles.title} id="dispatch-modal-title">
              Dispatch Order #{order.orderNumber}
            </h2>
          </div>
          <button
            aria-label="Close dialog"
            className={styles.closeButton}
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error ? (
            <div className={styles.errorBanner} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className={styles.recipientPreview}>
            <div className={styles.previewLabel}>
              Recipient &amp; Delivery Destination:
            </div>
            <div className={styles.previewName}>
              {order.customer.name || "Customer"}
            </div>
            <div className={styles.previewPhone}>
              {order.customer.phone || "No phone"}
            </div>
            <div className={styles.previewAddress}>
              {recipientAddress || "No address specified"}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="courierProvider">Courier Partner *</label>
            <select
              disabled={submitting}
              id="courierProvider"
              onChange={(e) =>
                setCourierProvider(
                  e.target.value as (typeof COURIER_PROVIDERS)[number]["value"],
                )
              }
              required
              value={courierProvider}
            >
              {COURIER_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="trackingCode">Tracking / Consignment Code</label>
              <input
                disabled={submitting}
                id="trackingCode"
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder="e.g. STDF-123456"
                type="text"
                value={trackingCode}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="deliveryFee">Delivery Fee (BDT)</label>
              <input
                disabled={submitting}
                id="deliveryFee"
                min="0"
                onChange={(e) => setDeliveryFee(e.target.value)}
                step="1"
                type="number"
                value={deliveryFee}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="codAmount">
              Cash on Delivery (COD) Amount (BDT)
              {isPaidOnline ? (
                <span className={styles.helperText}>
                  {" "}
                  (Order was paid online, default is 0)
                </span>
              ) : null}
            </label>
            <input
              disabled={submitting}
              id="codAmount"
              min="0"
              onChange={(e) => setCodAmount(e.target.value)}
              step="1"
              type="number"
              value={codAmount}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="trackingUrl">Tracking URL (Optional)</label>
            <input
              disabled={submitting}
              id="trackingUrl"
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://steadfast.com.bd/track/..."
              type="url"
              value={trackingUrl}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="dispatchNote">Dispatch Notes (Optional)</label>
            <textarea
              disabled={submitting}
              id="dispatchNote"
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Fragile items, deliver before 5 PM"
              rows={2}
              value={note}
            />
          </div>

          <div className={styles.modalFooter}>
            <button
              className={styles.cancelButton}
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.submitButton}
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <LoaderCircle className={styles.spin} size={15} />
                  <span>Dispatching…</span>
                </>
              ) : (
                <span>Confirm Dispatch</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

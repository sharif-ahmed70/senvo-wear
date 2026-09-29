"use client";

import type {
  CourierConsignmentContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import {
  ExternalLink,
  LoaderCircle,
  Package,
  Printer,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "./shipment-tracking-card.module.css";

const STANDARD_STEPS = [
  { key: "BOOKED", label: "Booked" },
  { key: "PICKED_UP", label: "Picked Up" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

const COURIER_DISPLAY_NAMES: Record<string, string> = {
  STEADFAST: "Steadfast Courier",
  PATHAO: "Pathao Courier",
  REDX: "RedX",
  PAPERFLY: "Paperfly",
  IN_HOUSE: "In-House Fleet",
};

function formatTaka(minor: string | number): string {
  const num = typeof minor === "string" ? Number(minor) : minor;
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    maximumFractionDigits: 0,
    style: "currency",
  }).format((num || 0) / 100);
}

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export type ShipmentTrackingCardProps = {
  canUpdate: boolean;
  client: AdminApiClient;
  onStatusUpdated: (updated: CourierConsignmentContract) => void;
  order: SalesOrderDetailsReadContract;
  shipments: CourierConsignmentContract[];
};

export function ShipmentTrackingCard({
  canUpdate,
  client,
  onStatusUpdated,
  order,
  shipments,
}: ShipmentTrackingCardProps) {
  const activeConsignment = shipments[0];
  const [selectedStatus, setSelectedStatus] = useState<
    CourierConsignmentContract["status"] | ""
  >("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!activeConsignment) {
    return null;
  }

  const isTerminal = ["DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED"].includes(
    activeConsignment.status,
  );

  // Next possible statuses based on domain lifecycle
  const nextStatusOptions: Array<{
    label: string;
    value: CourierConsignmentContract["status"];
  }> = [];

  if (activeConsignment.status === "DRAFT") {
    nextStatusOptions.push({ label: "Book Consignment", value: "BOOKED" });
    nextStatusOptions.push({ label: "Cancel", value: "CANCELLED" });
  } else if (activeConsignment.status === "BOOKED") {
    nextStatusOptions.push({
      label: "Picked Up by Courier",
      value: "PICKED_UP",
    });
    nextStatusOptions.push({ label: "Cancel Consignment", value: "CANCELLED" });
  } else if (activeConsignment.status === "PICKED_UP") {
    nextStatusOptions.push({ label: "In Transit", value: "IN_TRANSIT" });
    nextStatusOptions.push({ label: "Cancel Consignment", value: "CANCELLED" });
  } else if (activeConsignment.status === "IN_TRANSIT") {
    nextStatusOptions.push({ label: "Mark as Delivered", value: "DELIVERED" });
    nextStatusOptions.push({
      label: "Returned to Origin (RTO)",
      value: "RETURNED_TO_ORIGIN",
    });
    nextStatusOptions.push({ label: "Cancel Consignment", value: "CANCELLED" });
  }

  async function handleUpdateStatus() {
    if (!selectedStatus || submitting || !activeConsignment) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await client.updateShipmentStatus({
        consignmentId: activeConsignment.id,
        expectedVersion: activeConsignment.version,
        status: selectedStatus,
      });

      onStatusUpdated(response.data);
      setSelectedStatus("");
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        setError(caught.message);
      } else {
        setError("Failed to update status. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const currentStepIndex = STANDARD_STEPS.findIndex(
    (s) => s.key === activeConsignment.status,
  );

  const courierLabel =
    COURIER_DISPLAY_NAMES[activeConsignment.courierProvider] ??
    activeConsignment.courierProvider;

  return (
    <section
      aria-label="Courier Shipment &amp; Tracking"
      className={styles.card}
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.eyebrow}>
            Courier Dispatch &amp; Tracking
          </span>
          <h2 className={styles.title}>{courierLabel} Consignment</h2>
        </div>
        <div className={styles.headerActions}>
          <Link
            className={styles.printButton}
            href={`/sales/orders/${order.id}/shipping-label`}
            target="_blank"
          >
            <Printer size={15} />
            <span>Print Label</span>
          </Link>
        </div>
      </div>

      <div className={styles.detailsGrid}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Consignment No</span>
          <span className={styles.detailValue}>
            {activeConsignment.consignmentNumber}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Tracking Code</span>
          <span className={styles.detailValue}>
            {activeConsignment.trackingCode ? (
              activeConsignment.trackingUrl ? (
                <a
                  className={styles.trackingLink}
                  href={activeConsignment.trackingUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {activeConsignment.trackingCode} <ExternalLink size={13} />
                </a>
              ) : (
                activeConsignment.trackingCode
              )
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>COD Collection</span>
          <span className={styles.detailValue}>
            {formatTaka(activeConsignment.codAmountMinor)}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Delivery Fee</span>
          <span className={styles.detailValue}>
            {formatTaka(activeConsignment.deliveryFeeMinor)}
          </span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Shipment Status</span>
          <span className={styles.detailValue}>
            <strong>{activeConsignment.status}</strong>
          </span>
        </div>
      </div>

      <div className={styles.timelineContainer}>
        <div className={styles.timelineTitle}>Shipment Lifecycle</div>

        {activeConsignment.status === "RETURNED_TO_ORIGIN" ? (
          <div className={styles.specialStatusBanner}>
            <span className={styles.rtoBadge}>Returned to Origin (RTO)</span>
            <p>
              Parcel delivery failed and package was returned to origin
              warehouse.
            </p>
          </div>
        ) : activeConsignment.status === "CANCELLED" ? (
          <div className={styles.specialStatusBanner}>
            <span className={styles.cancelledBadge}>Cancelled</span>
            <p>This courier consignment booking was cancelled.</p>
          </div>
        ) : (
          <div className={styles.timeline}>
            {STANDARD_STEPS.map((step, idx) => {
              const isCompleted =
                currentStepIndex > -1 && idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <div
                  className={`${styles.step} ${isCurrent ? styles.stepActive : ""} ${
                    isCompleted ? styles.stepCompleted : ""
                  }`}
                  key={step.key}
                >
                  {idx > 0 && (
                    <div
                      className={`${styles.stepConnector} ${
                        isCompleted ? styles.stepConnectorActive : ""
                      }`}
                    />
                  )}
                  <div className={styles.stepDot}>
                    {idx === 3 ? <Package size={14} /> : <Truck size={14} />}
                  </div>
                  <span className={styles.stepLabel}>{step.label}</span>
                  {isCurrent && (
                    <span className={styles.stepDate}>
                      {formatDate(activeConsignment.updatedAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canUpdate && !isTerminal && nextStatusOptions.length > 0 ? (
        <div className={styles.statusUpdateArea}>
          <label htmlFor="updateShipmentStatusSelect">
            Update Shipment Status:
          </label>
          <div className={styles.updateControls}>
            <select
              className={styles.statusSelect}
              disabled={submitting}
              id="updateShipmentStatusSelect"
              onChange={(e) =>
                setSelectedStatus(
                  e.target.value as CourierConsignmentContract["status"],
                )
              }
              value={selectedStatus}
            >
              <option value="">Select next status…</option>
              {nextStatusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className={styles.updateButton}
              disabled={!selectedStatus || submitting}
              onClick={() => void handleUpdateStatus()}
              type="button"
            >
              {submitting ? (
                <>
                  <LoaderCircle className={styles.spin} size={14} />
                  <span>Updating…</span>
                </>
              ) : (
                "Update Status"
              )}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.errorMessage} role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}

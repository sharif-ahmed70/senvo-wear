"use client";

import type { StorefrontOrderTrackingContract } from "@senvo/contracts";
import {
  AlertCircle,
  Check,
  ExternalLink,
  LoaderCircle,
  Package,
  Search,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  StorefrontApiError,
  storefrontApi,
  taka,
} from "../_lib/storefront-api";
import styles from "./track-order.module.css";

const TIMELINE_STEPS = [
  {
    key: "CONFIRMED",
    label: "Order Confirmed",
    desc: "Order received and verified",
  },
  {
    key: "BOOKED",
    label: "Courier Booked",
    desc: "Consignment registered with courier",
  },
  {
    key: "PICKED_UP",
    label: "Picked Up",
    desc: "Courier collected parcel from warehouse",
  },
  {
    key: "IN_TRANSIT",
    label: "In Transit",
    desc: "Parcel is on the way to delivery address",
  },
  {
    key: "DELIVERED",
    label: "Delivered",
    desc: "Package handed over to recipient",
  },
] as const;

function getCourierDisplayName(provider?: string): string {
  switch (provider) {
    case "STEADFAST":
      return "Steadfast Courier";
    case "PATHAO":
      return "Pathao Courier";
    case "REDX":
      return "RedX Logistics";
    case "PAPERFLY":
      return "Paperfly";
    case "IN_HOUSE":
      return "SENVO Fleet Express";
    default:
      return provider ?? "Express Courier";
  }
}

export function TrackOrderWorkspace() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trackingResult, setTrackingResult] =
    useState<StorefrontOrderTrackingContract | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await storefrontApi.trackOrder({
        orderNumber: orderNumber.trim(),
        phone: phone.trim(),
      });
      setTrackingResult(response);
    } catch (caught) {
      setTrackingResult(null);
      if (caught instanceof StorefrontApiError) {
        if (caught.code.includes("NOT_FOUND")) {
          setError(
            "We could not find an order matching that order number and phone. Please verify your details and try again.",
          );
        } else {
          setError(caught.message);
        }
      } else {
        setError(
          "An unexpected error occurred while looking up your order. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const shipment = trackingResult?.shipments?.[0];

  function getStepStatus(stepKey: string): "completed" | "current" | "pending" {
    if (!trackingResult) return "pending";

    const shipmentStatus = shipment?.status;

    if (stepKey === "CONFIRMED") {
      return "completed";
    }

    if (!shipmentStatus || shipmentStatus === "DRAFT") {
      return "pending";
    }

    if (
      shipmentStatus === "CANCELLED" ||
      shipmentStatus === "RETURNED_TO_ORIGIN"
    ) {
      return "pending";
    }

    const orderOfStatuses = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
    const currentIndex = orderOfStatuses.indexOf(shipmentStatus);
    const targetIndex = orderOfStatuses.indexOf(stepKey);

    if (targetIndex < 0) return "pending";

    if (targetIndex < currentIndex) return "completed";
    if (targetIndex === currentIndex) return "current";
    return "pending";
  }

  return (
    <div className={styles.container}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Live Order Tracking</p>
        <h1 className={styles.title}>Track Your SENVO Order</h1>
        <p className={styles.subtitle}>
          Enter your order number and mobile number to monitor parcel dispatch
          and delivery progress.
        </p>
      </header>

      <section className={styles.formCard}>
        <form onSubmit={handleSearch}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="track-order-number">
                Order Number *
              </label>
              <input
                aria-required="true"
                className={styles.input}
                id="track-order-number"
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. SO-2026-0001"
                required
                type="text"
                value={orderNumber}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="track-phone">
                Phone Number *
              </label>
              <input
                aria-required="true"
                className={styles.input}
                id="track-phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 01700000000"
                required
                type="tel"
                value={phone}
              />
            </div>
          </div>

          {error ? (
            <div className={styles.errorBanner} role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            className={styles.submitBtn}
            disabled={loading || !orderNumber.trim() || !phone.trim()}
            type="submit"
          >
            {loading ? (
              <>
                <LoaderCircle className="spin" size={18} /> Tracking Order…
              </>
            ) : (
              <>
                <Search size={18} /> Find Order Status
              </>
            )}
          </button>
        </form>
      </section>

      {trackingResult ? (
        <article aria-live="polite" className={styles.resultCard}>
          <div className={styles.orderHeader}>
            <div className={styles.orderMeta}>
              <h2>Order #{trackingResult.orderNumber}</h2>
              <p>
                Recipient: {trackingResult.customerName || "Customer"} ·{" "}
                {[trackingResult.deliveryCity, trackingResult.deliveryDistrict]
                  .filter(Boolean)
                  .join(", ") || "Bangladesh"}
              </p>
              <p style={{ marginTop: "0.25rem" }}>
                Total:{" "}
                <strong>{taka(Number(trackingResult.totalMinor))}</strong> ·
                Payment: {trackingResult.paymentStatus}
              </p>
            </div>
            <span
              className={`${styles.statusBadge} ${
                trackingResult.status === "FULFILLED"
                  ? styles.statusDelivered
                  : trackingResult.status === "CANCELLED"
                    ? styles.statusCancelled
                    : styles.statusConfirmed
              }`}
            >
              {trackingResult.status}
            </span>
          </div>

          <div className={styles.shipmentSection}>
            {shipment ? (
              <>
                <div className={styles.courierGrid}>
                  <div className={styles.courierItem}>
                    <span className={styles.courierLabel}>Courier Partner</span>
                    <span className={styles.courierValue}>
                      {getCourierDisplayName(shipment.courierProvider)}
                    </span>
                  </div>
                  <div className={styles.courierItem}>
                    <span className={styles.courierLabel}>Tracking Number</span>
                    <span className={styles.courierValue}>
                      {shipment.trackingCode || shipment.consignmentNumber}
                    </span>
                  </div>
                  <div className={styles.courierItem}>
                    <span className={styles.courierLabel}>Shipment Status</span>
                    <span className={styles.courierValue}>
                      {shipment.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {shipment.trackingUrl ? (
                    <div className={styles.courierItem}>
                      <span className={styles.courierLabel}>
                        Carrier Portal
                      </span>
                      <a
                        className={styles.trackingLink}
                        href={shipment.trackingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Live Tracking{" "}
                        <ExternalLink size={12} style={{ display: "inline" }} />
                      </a>
                    </div>
                  ) : null}
                </div>

                <h3 className={styles.timelineTitle}>Delivery Progress</h3>
                <ol className={styles.timeline}>
                  {TIMELINE_STEPS.map((step) => {
                    const stepStatus = getStepStatus(step.key);
                    const isCompleted = stepStatus === "completed";
                    const isCurrent = stepStatus === "current";

                    return (
                      <li
                        className={`${styles.timelineStep} ${
                          isCompleted
                            ? styles.timelineStepCompleted
                            : isCurrent
                              ? styles.timelineStepActive
                              : ""
                        }`}
                        key={step.key}
                      >
                        <span className={styles.timelineDot}>
                          {isCompleted ? (
                            <Check color="#ffffff" size={10} />
                          ) : null}
                        </span>
                        <div
                          className={`${styles.stepContent} ${
                            isCompleted || isCurrent
                              ? styles.stepCompleted
                              : styles.stepPending
                          }`}
                        >
                          <span className={styles.stepLabel}>{step.label}</span>
                          <span className={styles.stepSub}>{step.desc}</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {shipment.status === "RETURNED_TO_ORIGIN" ? (
                  <div
                    className={styles.errorBanner}
                    style={{ marginTop: "1.5rem" }}
                  >
                    <AlertCircle size={18} />
                    <span>
                      This shipment could not be delivered and has been marked
                      as Returned to Origin (RTO). Please contact customer care.
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.noShipmentNotice}>
                <Package
                  size={32}
                  style={{ marginBottom: "0.5rem", color: "#888" }}
                />
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Order is being processed
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                  Your items are being inspected and packaged for handover to
                  our courier partner.
                </p>
              </div>
            )}
          </div>
        </article>
      ) : null}
    </div>
  );
}

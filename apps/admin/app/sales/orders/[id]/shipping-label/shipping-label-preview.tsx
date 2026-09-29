"use client";

import type {
  CourierConsignmentContract,
  SalesOrderDetailsReadContract,
} from "@senvo/contracts";
import { ArrowLeft, LoaderCircle, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";
import styles from "./shipping-label.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

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
      year: "numeric",
    });
  } catch {
    return "";
  }
}

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

// Generates a decorative Code-128 inspired SVG barcode
function BarcodeSvg({ code }: { code: string }) {
  // Generate deterministic widths from input string
  const bars: { width: number; x: number }[] = [];
  let currentX = 10;
  const hashString = code || "SENVO12345";

  // Guard start bars
  bars.push({ x: currentX, width: 2 });
  currentX += 4;
  bars.push({ x: currentX, width: 1 });
  currentX += 3;

  for (let i = 0; i < hashString.length; i++) {
    const charCode = hashString.charCodeAt(i);
    const w1 = (charCode % 3) + 1;
    const w2 = ((charCode >> 1) % 2) + 1;
    const gap = (charCode % 2) + 2;

    bars.push({ x: currentX, width: w1 });
    currentX += w1 + gap;
    bars.push({ x: currentX, width: w2 });
    currentX += w2 + gap;
  }

  // Guard stop bars
  bars.push({ x: currentX, width: 2 });
  currentX += 4;
  bars.push({ x: currentX, width: 3 });
  currentX += 5;

  const totalWidth = currentX + 10;

  return (
    <svg
      aria-label={`Barcode for ${code}`}
      className={styles.barcodeSvg}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${totalWidth} 40`}
    >
      <rect fill="#ffffff" height="40" width={totalWidth} x="0" y="0" />
      {bars.map((bar, idx) => (
        <rect
          fill="#000000"
          height="40"
          key={idx}
          width={bar.width}
          x={bar.x}
          y="0"
        />
      ))}
    </svg>
  );
}

export type ShippingLabelPreviewProps = {
  orderId: string;
  permissions?: readonly AdminPermissionKey[];
};

export function ShippingLabelPreview({
  orderId,
  permissions: propsPermissions,
}: ShippingLabelPreviewProps) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead = permissions.includes("SALES_ORDER:READ");

  const [order, setOrder] = useState<SalesOrderDetailsReadContract | null>(
    null,
  );
  const [shipments, setShipments] = useState<CourierConsignmentContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isA4, setIsA4] = useState(false);

  useEffect(() => {
    if (!canRead || !orderId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      client.getSalesOrder(orderId),
      client.getOrderShipments(orderId).catch(() => ({ data: [] })),
    ])
      .then(([orderRes, shipmentRes]) => {
        setOrder(orderRes.data);
        setShipments(shipmentRes.data ?? []);
      })
      .catch((caught) => {
        setError(
          caught instanceof AdminApiError
            ? caught.message
            : "Failed to load order details for shipping label.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canRead, orderId]);

  if (!canRead) {
    return (
      <main className={styles.page}>
        <p>Access restricted. You need SALES_ORDER:READ permission.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <LoaderCircle className="spin" size={24} />
          <span>Generating shipping label…</span>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className={styles.page}>
        <p>{error ?? "Order could not be loaded."}</p>
        <Link className={styles.backLink} href={`/sales/orders/${orderId}`}>
          <ArrowLeft size={16} /> Return to Order
        </Link>
      </main>
    );
  }

  const activeShipment = shipments[0];
  const trackingNumber =
    activeShipment?.trackingCode ??
    activeShipment?.consignmentNumber ??
    order.orderNumber;
  const courierName = getCourierDisplayName(activeShipment?.courierProvider);
  const routingZone = order.delivery.district || order.delivery.city || "DHAKA";

  const isOnlinePayment =
    order.commerce?.paymentPreference === "ONLINE_PAYMENT";

  const codMinor = activeShipment?.codAmountMinor
    ? activeShipment.codAmountMinor
    : isOnlinePayment
      ? "0"
      : String(order.totals.totalMinor);

  const isCod = Number(codMinor) > 0;

  const totalItems = order.lines.reduce((acc, line) => acc + line.quantity, 0);

  return (
    <main className={styles.page}>
      <header className={styles.actions}>
        <div className={styles.leftActions}>
          <Link className={styles.backLink} href={`/sales/orders/${orderId}`}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div className={styles.formatToggle}>
            <button
              className={`${styles.formatBtn} ${!isA4 ? styles.formatBtnActive : ""}`}
              onClick={() => setIsA4(false)}
              type="button"
            >
              80mm Thermal
            </button>
            <button
              className={`${styles.formatBtn} ${isA4 ? styles.formatBtnActive : ""}`}
              onClick={() => setIsA4(true)}
              type="button"
            >
              A4 Sheet
            </button>
          </div>
        </div>
        <button
          className={styles.printBtn}
          onClick={() => window.print()}
          type="button"
        >
          <Printer size={16} /> Print Label
        </button>
      </header>

      <article
        className={`${styles.labelContainer} ${isA4 ? styles.labelContainerA4 : ""}`}
      >
        <div className={styles.labelHeader}>
          <div>
            <h1 className={styles.brandTitle}>SENVO WEAR</h1>
            <p className={styles.brandTagline}>
              Contemporary Apparel &amp; Lifestyle
            </p>
          </div>
          <div className={styles.courierBadge}>
            <div className={styles.courierName}>{courierName}</div>
            <div className={styles.routingZone}>
              {routingZone.toUpperCase()}
            </div>
          </div>
        </div>

        <section className={styles.barcodeSection}>
          <BarcodeSvg code={trackingNumber} />
          <div className={styles.trackingCode}>{trackingNumber}</div>
          <div className={styles.orderReference}>
            Order: #{order.orderNumber}
          </div>
        </section>

        <section className={styles.recipientSection}>
          <div className={styles.sectionLabel}>Deliver To:</div>
          <h2 className={styles.customerName}>
            {order.customer.name || "Valued Customer"}
          </h2>
          <div className={styles.customerPhone}>
            {order.customer.phone || "No phone provided"}
          </div>
          <div className={styles.deliveryAddress}>
            {order.delivery.addressLine1}
            {order.delivery.addressLine2
              ? `, ${order.delivery.addressLine2}`
              : ""}
            {order.delivery.city ? `, ${order.delivery.city}` : ""}
            {order.delivery.district ? `, ${order.delivery.district}` : ""}
            {order.delivery.postalCode ? ` - ${order.delivery.postalCode}` : ""}
          </div>
        </section>

        <section
          className={`${styles.codBanner} ${
            isCod ? styles.codBannerActive : styles.prepaidBanner
          }`}
        >
          <div className={styles.codLabel}>
            {isCod ? "Cash on Delivery (COD) Amount" : "Payment Status"}
          </div>
          <div className={styles.codAmount}>
            {isCod ? formatTaka(codMinor) : "PREPAID - DO NOT COLLECT CASH"}
          </div>
        </section>

        <div className={styles.itemsSummary}>
          <span>
            Items: {totalItems} pcs ({order.lines.length} variants)
          </span>
          <span>Date: {formatDate(order.timestamps.createdAt)}</span>
        </div>

        <footer className={styles.returnSection}>
          <div>
            <span className={styles.returnTitle}>Return address: </span>
            SENVO Wear Logistics Hub, House 12, Road 4, Banani, Dhaka-1213,
            Bangladesh | Helpline: +880 9610-000000
          </div>
          <div style={{ marginTop: "0.25rem", fontStyle: "italic" }}>
            Handle with care. If undeliverable, return to sender within 48
            hours.
          </div>
        </footer>
      </article>
    </main>
  );
}

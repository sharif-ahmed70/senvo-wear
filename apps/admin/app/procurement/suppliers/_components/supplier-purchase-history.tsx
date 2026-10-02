"use client";

import type { PurchaseContract } from "@senvo/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminApiClient } from "../../../_lib/api-client";
import { formatTaka } from "../../../inventory/intake/_lib/currency-math";
import styles from "./supplier-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

const cellStyle = {
  borderTop: "1px solid #f1f5f9",
  fontSize: "0.85rem",
  padding: "0.6rem 0.5rem",
  textAlign: "left",
} as const;

export function SupplierPurchaseHistory({
  supplierId,
}: {
  supplierId: string;
}) {
  const [purchases, setPurchases] = useState<PurchaseContract[]>([]);
  const [status, setStatus] = useState<"error" | "loading" | "ready">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    setStatus("loading");
    client
      .listPurchases({ limit: 20, supplierId })
      .then((result) => {
        if (!active) return;
        setPurchases(result.data);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [supplierId]);

  return (
    <section
      aria-label="কেনার History"
      className={styles.detailCard}
      style={{ marginTop: "2rem" }}
    >
      <div className={styles.detailHeader}>
        <h3 style={{ fontSize: "1rem", margin: 0 }}>কেনার History</h3>
        <Link
          href="/inventory/intake"
          style={{ color: "#721522", fontSize: "0.85rem", fontWeight: 700 }}
        >
          নতুন মাল তুলুন
        </Link>
      </div>
      {status === "loading" ? (
        <p className={styles.stateDescription}>কেনার হিসাব আনা হচ্ছে…</p>
      ) : status === "error" ? (
        <p className={styles.stateDescription} role="alert">
          কেনার হিসাব আনা যায়নি। পাতাটা আবার খুলে দেখুন।
        </p>
      ) : purchases.length === 0 ? (
        <p className={styles.stateDescription}>
          এই Supplier থেকে এখনো কিছু কেনা হয়নি।
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th scope="col" style={cellStyle}>
                  তারিখ
                </th>
                <th scope="col" style={cellStyle}>
                  Purchase
                </th>
                <th scope="col" style={cellStyle}>
                  Status
                </th>
                <th scope="col" style={{ ...cellStyle, textAlign: "right" }}>
                  মোট
                </th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td style={cellStyle}>
                    {new Date(purchase.purchaseDate).toLocaleDateString(
                      "en-GB",
                      { timeZone: "Asia/Dhaka" },
                    )}
                  </td>
                  <td style={cellStyle}>
                    <Link href={`/procurement/purchases/${purchase.id}`}>
                      {purchase.purchaseNumber}
                    </Link>
                  </td>
                  <td style={cellStyle}>{purchase.status}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {formatTaka(purchase.totalCostMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

import type { PurchaseContract, SupplierContract } from "@senvo/contracts";
import { LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";
import {
  formatTaka,
  parseTaka,
  takaInputFromMinor,
  transportPerPieceMinor,
} from "../../../../inventory/intake/_lib/currency-math";
import styles from "../../../../inventory/intake/_components/stock-intake-wizard.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type Line = NonNullable<PurchaseContract["lines"]>[number];

/** Transport/labour already in a purchase: extra per piece x pieces. */
export function currentExtraTotalMinor(lines: readonly Line[]): number {
  return lines.reduce(
    (sum, line) => sum + line.quantity * (line.extraCostPerUnitMinor ?? 0),
    0,
  );
}

/**
 * Edit a received purchase's "অতিরিক্ত খরচ" (transport, courier, labour),
 * e.g. when it was forgotten at intake. Same field as the intake page; the
 * server spreads it over the pieces and updates the cost. Supplier prices
 * and the supplier's balance stay as they are.
 */
export function PurchaseExtraCostEditor({ purchaseId }: { purchaseId: string }) {
  const permissions = useAdminPermissions();
  const canEdit = permissions.includes("PROCUREMENT:UPDATE");
  const [purchase, setPurchase] = useState<PurchaseContract | null>(null);
  const [supplier, setSupplier] = useState<SupplierContract | null>(null);
  const [transport, setTransport] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await client.getPurchase(purchaseId)).data;
      setPurchase(result);
      setTransport(takaInputFromMinor(currentExtraTotalMinor(result.lines ?? [])));
      void client
        .getSupplier(result.supplierId)
        .then((response) => setSupplier(response.data))
        .catch(() => setSupplier(null));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = useMemo(() => purchase?.lines ?? [], [purchase]);
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  const currentMinor = currentExtraTotalMinor(lines);
  const transportMinor = parseTaka(transport);
  const perPiece =
    transportMinor === null ? 0 : transportPerPieceMinor(transportMinor, pieces);
  const missingSupplierPrice = lines.some(
    (line) => line.supplierUnitCostMinor === null,
  );
  const unchanged = transportMinor === currentMinor;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transportMinor === null) {
      setError("ঠিক টাকার অঙ্ক লিখুন (যেমন 700 বা 650.50)।");
      return;
    }
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = (
        await client.correctPurchaseExtraCost(purchaseId, transportMinor)
      ).data;
      setPurchase(result);
      const applied = currentExtraTotalMinor(result.lines ?? []);
      setTransport(takaInputFromMinor(applied));
      setSaved(
        applied === transportMinor
          ? `সেভ হয়েছে: অতিরিক্ত খরচ ${formatTaka(applied)}, সব পিসে ভাগ করা হয়েছে। লাভ আর মালের দাম এখন এই হিসাবে চলবে।`
          : `সেভ হয়েছে: ${formatTaka(applied)} ভাগ করা গেছে (পিসে সমান ভাগের জন্য ${formatTaka(transportMinor - applied)} কম)।`,
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>মাল তোলার এন্ট্রি · এডিট</p>
          <h1>অতিরিক্ত খরচ ঠিক করুন</h1>
          <p className={styles.heroLead}>
            মাল তোলার সময় গাড়ি ভাড়া, কুরিয়ার বা কুলি লিখতে ভুলে গেলে এখানে
            লিখুন। টাকাটা সব পিসে সমান ভাগ হয়ে কেনা দামের সাথে যোগ হবে, আর লাভের
            হিসাব ঠিক হয়ে যাবে।
          </p>
        </div>
      </header>

      {loading ? (
        <section aria-busy="true" className={styles.statePanel}>
          <LoaderCircle aria-hidden="true" className={styles.spin} size={22} />
          <div>
            <h2>আনা হচ্ছে…</h2>
          </div>
        </section>
      ) : !purchase ? (
        <p className={styles.error} role="alert">
          {error || "এই এন্ট্রি পাওয়া যায়নি।"}
        </p>
      ) : (
        <form className={styles.field} onSubmit={(event) => void save(event)}>
          <p className={styles.hint}>
            <strong>{purchase.purchaseNumber}</strong> ·{" "}
            {new Date(purchase.purchaseDate).toLocaleDateString("en-GB")} ·
            Supplier: {supplier?.name ?? "—"} · {pieces} পিস
            {purchase.notes ? ` · ${purchase.notes}` : ""}
          </p>

          <div className={styles.tableWrap}>
            <table className={styles.priceTable}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>পিস</th>
                  <th>Supplier দাম (প্রতি পিস)</th>
                  <th>এখন অতিরিক্ত খরচ (প্রতি পিস)</th>
                  <th>নতুন অতিরিক্ত (প্রায়)</th>
                  <th>নতুন কেনা দাম (প্রায়)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.productName}
                      <br />
                      <small>{line.sku}</small>
                    </td>
                    <td>{line.quantity}</td>
                    <td>
                      {line.supplierUnitCostMinor === null
                        ? "—"
                        : formatTaka(line.supplierUnitCostMinor)}
                    </td>
                    <td>{formatTaka(line.extraCostPerUnitMinor ?? 0)}</td>
                    <td>{formatTaka(perPiece)}</td>
                    <td>
                      {line.supplierUnitCostMinor === null
                        ? "—"
                        : formatTaka(line.supplierUnitCostMinor + perPiece)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.transportBox}>
            <label htmlFor="extra-cost">
              অতিরিক্ত খরচ: গাড়ি ভাড়া, কুরিয়ার, কুলি (সব মিলিয়ে, এই এন্ট্রির)
            </label>
            <input
              disabled={!canEdit || saving || missingSupplierPrice}
              id="extra-cost"
              inputMode="decimal"
              onChange={(event) => {
                setTransport(event.target.value);
                setSaved("");
              }}
              placeholder="যেমন 700"
              value={transport}
            />
            <p className={styles.hint}>
              এখন আছে {formatTaka(currentMinor)}। নতুন হলে প্রতি পিসে প্রায় +
              {formatTaka(perPiece)}। Supplier-এর দাম আর Supplier-এর বাকি টাকা
              বদলাবে না।
            </p>
          </div>

          {missingSupplierPrice ? (
            <p className={styles.error} role="alert">
              এই এন্ট্রিতে Supplier-এর প্রতি পিসের দাম লেখা নেই, তাই অতিরিক্ত
              খরচ আলাদা করা যাবে না।
            </p>
          ) : null}
          {!canEdit ? (
            <p className={styles.error} role="status">
              অতিরিক্ত খরচ বদলাতে পারেন শুধু Owner বা Admin।
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className={styles.notice} role="status">
              {saved}
            </p>
          ) : null}

          <div className={styles.addRow}>
            <button
              className={styles.primaryButton}
              disabled={
                !canEdit ||
                saving ||
                missingSupplierPrice ||
                transportMinor === null ||
                unchanged
              }
              type="submit"
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className={styles.spin} size={15} />
              ) : (
                <Save aria-hidden="true" size={15} />
              )}
              Save
            </button>
            <Link
              className={styles.secondaryButton}
              href={`/procurement/purchases/${purchaseId}`}
            >
              বাতিল
            </Link>
          </div>
          <p className={styles.hint}>
            বিক্রির দাম, নাম বা Category বদলাতে প্রোডাক্টের পেজে যান (Inventory →
            প্রোডাক্ট → Edit)। পিসের সংখ্যা ভুল হলে Stock Adjustment ব্যবহার
            করুন।
          </p>
        </form>
      )}
    </main>
  );
}

function messageFor(caught: unknown): string {
  if (caught instanceof AdminApiError)
    return `${caught.message} (Request ${caught.requestId})`;
  return "সেভ করা যায়নি। আবার চেষ্টা করুন।";
}

"use client";

import type {
  PosCheckoutContract,
  SalesOrderListReadContract,
} from "@senvo/contracts";
import { LoaderCircle, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminApiClient } from "../../../_lib/api-client";
import {
  normalizeScannedCode,
  submitScanOnEnterOrTab,
} from "../../../_lib/scan-input";
import { formatBdt } from "../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const RECENT_COUNT = 10;

export type FoundSale = {
  checkoutId: string;
  completedAt: string;
  customer: string;
  orderNumber: string;
  totalMinor: number;
};

/** POS sales (those with a checkout), newest first. */
export function foundSales(
  orders: readonly SalesOrderListReadContract[],
  checkouts: readonly PosCheckoutContract[],
): FoundSale[] {
  const byOrder = new Map(
    checkouts.map((checkout) => [checkout.salesOrderId, checkout]),
  );
  return orders
    .flatMap((order) => {
      const checkout = byOrder.get(order.id);
      if (!checkout) return [];
      const { name, phone } = order.customer;
      return [
        {
          checkoutId: checkout.id,
          completedAt: checkout.completedAt,
          customer: [name, phone].filter(Boolean).join(" · ") || "Walk-in",
          orderNumber: order.orderNumber,
          totalMinor: checkout.totalMinor,
        },
      ];
    })
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

function recentSales(checkouts: readonly PosCheckoutContract[]): FoundSale[] {
  return [...checkouts]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, RECENT_COUNT)
    .map((checkout) => ({
      checkoutId: checkout.id,
      completedAt: checkout.completedAt,
      customer: checkout.counterName,
      orderNumber: checkout.orderNumber,
      totalMinor: checkout.totalMinor,
    }));
}

/**
 * Return / Exchange: find the sale by bill number, the customer's phone or
 * a scanned barcode of the item, then open it to return or exchange.
 */
export function ReturnExchangeFinder() {
  const [checkouts, setCheckouts] = useState<PosCheckoutContract[]>([]);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<FoundSale[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCheckouts((await client.listPosCheckouts()).data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sales not loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function search(event: FormEvent) {
    event.preventDefault();
    const typed = term.trim();
    if (!typed) return;
    setSearching(true);
    setError("");
    setHint("");
    try {
      // A scanned barcode is turned into its SKU, which is on the bill.
      let searchFor = typed;
      const code = normalizeScannedCode(typed);
      if (/^[A-Za-z0-9._-]+$/u.test(code)) {
        try {
          const hit = (await client.lookupBarcode(code)).data;
          searchFor = hit.sku;
          setHint(`${hit.productName} · ${hit.color} / ${hit.size}`);
        } catch {
          // Not a barcode: search by bill number, phone or SKU as typed.
        }
      }
      const page = await client.listSalesOrders({
        channel: "POS",
        order: "NEWEST",
        pageSize: 50,
        search: searchFor.slice(0, 64),
      });
      setResults(foundSales(page.data.items, checkouts));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  const shown = results ?? recentSales(checkouts);

  return (
    <section className="pos-payment-page" aria-labelledby="return-finder">
      <header className="pos-page-heading">
        <div>
          <span>Return / Exchange</span>
          <h2 id="return-finder">ফেরত বা বদলের বিল খুঁজুন</h2>
          <p>
            রসিদের বিল নম্বর, কাস্টমারের ফোন নম্বর লিখুন, বা ফেরত আসা মালের
            barcode scan করুন। বিল খুলে মাল ফেরত নিন, তারপর চাইলে বদলে অন্য মাল
            দিন।
          </p>
        </div>
      </header>

      <form
        className="pos-payment-form"
        onSubmit={(event) => void search(event)}
      >
        <div className="pos-return-search">
          <label>
            বিল নম্বর / ফোন / barcode
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={submitScanOnEnterOrTab}
              placeholder="যেমন POS-4C65…, 017…, বা scan করুন"
              value={term}
            />
          </label>
          <button
            className="pos-primary-button"
            disabled={searching || !term.trim()}
            type="submit"
          >
            {searching ? (
              <LoaderCircle className="barcode-spin" size={17} />
            ) : (
              <Search size={17} />
            )}{" "}
            খুঁজুন
          </button>
        </div>
      </form>

      {error ? (
        <p className="pos-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className="pos-muted">Barcode: {hint}</p> : null}

      <h3 className="pos-return-results-title">
        {results === null
          ? "সাম্প্রতিক বিক্রি"
          : `${results.length}টা বিল পাওয়া গেছে`}
      </h3>
      {loading ? (
        <p className="pos-muted" role="status">
          <LoaderCircle className="barcode-spin" size={15} /> বিক্রি আনা হচ্ছে…
        </p>
      ) : shown.length === 0 ? (
        <p className="pos-muted">
          {results === null
            ? "এখনো কোনো বিক্রি নেই।"
            : "এই নম্বর বা barcode-এর কোনো বিল পাওয়া যায়নি। বিল নম্বরটা আবার দেখে নিন।"}
        </p>
      ) : (
        <div className="pos-table-wrap">
          <table className="pos-table">
            <thead>
              <tr>
                <th>বিল</th>
                <th>সময়</th>
                <th>{results === null ? "Counter" : "কাস্টমার"}</th>
                <th>মোট</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {shown.map((sale) => (
                <tr key={sale.checkoutId}>
                  <td data-label="বিল">
                    <strong>{sale.orderNumber}</strong>
                  </td>
                  <td data-label="সময়">
                    {new Date(sale.completedAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td data-label="কাস্টমার">{sale.customer}</td>
                  <td data-label="মোট">{formatBdt(sale.totalMinor)}</td>
                  <td>
                    <Link
                      className="pos-secondary-button"
                      href={`/pos/checkouts/${sale.checkoutId}#return-heading`}
                    >
                      <Undo2 size={15} /> ফেরত / বদল
                    </Link>
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

"use client";

import {
  AlertCircle,
  Boxes,
  CircleDollarSign,
  LoaderCircle,
  PackageX,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { OperationalReportContract } from "@senvo/contracts";
import { AdminApiClient, AdminApiError } from "../_lib/api-client";
import { PageHeader } from "./page-header";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

export function OperationalDashboard() {
  const today = localDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<OperationalReportContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState({ from: today, revision: 0, to: today });

  useEffect(() => {
    let active = true;
    void client
      .getOperationalReport({ from: query.from, to: query.to })
      .then((result) => {
        if (active) setReport(result.data);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof AdminApiError
            ? `${reason.message} Request ${reason.requestId}.`
            : "Operational reporting is unavailable.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  function reloadReport() {
    setLoading(true);
    setError("");
    setQuery((current) => ({ from, revision: current.revision + 1, to }));
  }

  return (
    <>
      <PageHeader
        description="Sales, payments, returns, and stock requiring attention."
        eyebrow="Operations"
        title="Dashboard"
      />
      <section className="report-toolbar" aria-label="Report date range">
        <label>
          <span>From</span>
          <input
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label>
          <span>To</span>
          <input
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <button
          disabled={loading || from > to}
          onClick={reloadReport}
          type="button"
        >
          Refresh
        </button>
      </section>
      {loading ? (
        <section className="report-state" aria-live="polite">
          <LoaderCircle className="admin-auth-spin" size={24} />
          <strong>Loading operational report</strong>
        </section>
      ) : error ? (
        <section className="report-state" role="alert">
          <AlertCircle size={24} />
          <strong>Report could not be loaded</strong>
          <p>{error}</p>
          <button onClick={reloadReport} type="button">
            Retry
          </button>
        </section>
      ) : report ? (
        <Report report={report} />
      ) : null}
    </>
  );
}

function Report({ report }: { report: OperationalReportContract }) {
  return (
    <div className="report-layout">
      <section className="report-metrics" aria-label="Sales summary">
        <Metric
          icon={ReceiptText}
          label="Sales"
          value={money(report.sales.grossMinor)}
        />
        <Metric
          icon={CircleDollarSign}
          label="Collected"
          value={money(report.sales.collectedMinor)}
        />
        <Metric
          icon={WalletCards}
          label="Outstanding"
          value={money(report.sales.outstandingMinor)}
        />
        <Metric
          icon={RotateCcw}
          label="Refunded"
          value={money(report.sales.refundMinor)}
        />
        <Metric
          icon={Boxes}
          label="Available stock"
          value={String(report.inventory.availableToSell)}
        />
        <Metric
          icon={PackageX}
          label="Out of stock"
          value={String(report.inventory.outOfStockPositions)}
        />
        <Metric
          icon={Boxes}
          label="Stock value"
          value={money(report.inventory.inventoryValueMinor ?? 0)}
        />
        <Metric
          icon={PackageX}
          label="Low stock"
          value={String(report.inventory.lowStockPositions ?? 0)}
        />
        <Metric
          icon={CircleDollarSign}
          label="Estimated profit"
          value={money(report.sales.profitEstimateMinor ?? 0)}
        />
        <Metric
          icon={WalletCards}
          label="Customer due"
          value={money(report.sales.customerDueMinor ?? 0)}
        />
        <Metric
          icon={WalletCards}
          label="Vendor payable"
          value={money(report.sales.vendorPayableMinor ?? 0)}
        />
      </section>
      <section className="report-panel">
        <header>
          <h2>Payment breakdown</h2>
          <span>{report.period.timezone}</span>
        </header>
        <DataTable
          empty="No payments in this period."
          rows={report.payments.map((item) => [
            humanize(item.method),
            money(item.amountMinor),
          ])}
        />
      </section>
      <section className="report-panel">
        <header>
          <h2>Top products</h2>
          <span>{report.sales.orderCount} sales</span>
        </header>
        <DataTable
          empty="No product sales in this period."
          rows={report.products.map((item) => [
            `${item.productName} � ${item.sku}`,
            `${item.quantity} � ${money(item.salesMinor)}`,
          ])}
        />
      </section>
      <section className="report-panel">
        <header>
          <h2>Stock position</h2>
          <span>Current</span>
        </header>
        <dl className="report-facts">
          <div>
            <dt>On hand</dt>
            <dd>{report.inventory.onHand}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{report.inventory.reserved}</dd>
          </div>
          <div>
            <dt>Available to sell</dt>
            <dd>{report.inventory.availableToSell}</dd>
          </div>
        </dl>
      </section>
      <section className="report-panel">
        <header>
          <h2>Returns and refunds</h2>
          <span>{report.returns.count} returns</span>
        </header>
        <dl className="report-facts">
          <div>
            <dt>Return credit</dt>
            <dd>{money(report.returns.creditMinor)}</dd>
          </div>
          <div>
            <dt>Refunds</dt>
            <dd>{report.returns.refundCount}</dd>
          </div>
          <div>
            <dt>Refunded</dt>
            <dd>{money(report.returns.refundMinor)}</dd>
          </div>
        </dl>
      </section>
      <section className="report-panel report-panel--wide">
        <header>
          <h2>Staff sales</h2>
          <span>Trusted checkout ownership</span>
        </header>
        <DataTable
          empty="No staff sales in this period."
          rows={report.staff.map((item) => [
            item.name,
            `${item.orderCount} � ${money(item.salesMinor)}`,
          ])}
        />
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
}) {
  return (
    <article className="report-metric">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DataTable({ empty, rows }: { empty: string; rows: string[][] }) {
  if (rows.length === 0) return <p className="report-empty">{empty}</p>;
  return (
    <div className="report-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    style: "currency",
  }).format(value / 100);
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

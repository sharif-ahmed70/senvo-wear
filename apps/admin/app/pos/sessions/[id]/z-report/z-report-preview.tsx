"use client";

import type {
  PosRegisterSettlementContract,
  PosSessionReconciliationSummaryContract,
  SalesSessionContract,
} from "@senvo/contracts";
import { ArrowLeft, LoaderCircle, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";
import { formatBdt } from "../../../sell/_lib/money";
import styles from "./z-report.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function ZReportPreview({
  sessionId,
  permissions: propsPermissions,
}: {
  sessionId: string;
  permissions?: readonly AdminPermissionKey[];
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead = permissions.includes("POS:READ");

  const [summary, setSummary] =
    useState<PosSessionReconciliationSummaryContract | null>(null);
  const [session, setSession] = useState<SalesSessionContract | null>(null);
  const [settlement, setSettlement] =
    useState<PosRegisterSettlementContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;

    // Check if settlement was passed in sessionStorage from recent close
    try {
      const stored = sessionStorage.getItem(`senvo_settlement_${sessionId}`);
      if (stored) {
        setSettlement(JSON.parse(stored) as PosRegisterSettlementContract);
      }
    } catch {
      // ignore
    }

    Promise.all([
      client.getSessionReconciliationSummary(sessionId),
      client.listSalesSessions(),
    ])
      .then(([summaryRes, sessionsRes]) => {
        setSummary(summaryRes.data);
        const match = sessionsRes.data.find((s) => s.id === sessionId);
        if (match) setSession(match);
      })
      .catch((err) => {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load register reconciliation report.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canRead, sessionId]);

  if (!canRead) {
    return (
      <main className={styles.page}>
        <div className={styles.document}>
          <h2>Access Restricted</h2>
          <p>
            Your role does not include permission to view POS register reports.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <LoaderCircle size={32} className="pos-spin" />
          <p>Generating Day-End Z-Report...</p>
        </div>
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className={styles.page}>
        <div className={styles.document}>
          <h2>Report Error</h2>
          <p>{error ?? "Register summary data unavailable."}</p>
          <Link href="/pos/sessions" className={styles.backLink}>
            <ArrowLeft size={16} /> Back to Sessions
          </Link>
        </div>
      </main>
    );
  }

  const denomEntries = settlement?.denominationBreakdown
    ? Object.entries(settlement.denominationBreakdown).filter(
        ([, count]) => count > 0,
      )
    : [];

  return (
    <main className={styles.page}>
      <div className={styles.actions}>
        <Link href="/pos/sessions" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Sessions
        </Link>
        <button
          type="button"
          className={styles.printBtn}
          onClick={() => window.print()}
          data-testid="print-zreport-btn"
        >
          <Printer size={17} /> Print Z-Report
        </button>
      </div>

      <article className={styles.document}>
        <header className={styles.header}>
          <h1 className={styles.orgName}>SENVO WEAR</h1>
          <div className={styles.reportType}>REGISTER CLOSING Z-REPORT</div>
          <div className={styles.subMeta}>
            <span>Official Day-End Financial Reconciliation</span>
          </div>
        </header>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Register Counter</span>
            <span className={styles.metaValue}>{summary.counterName}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Session Status</span>
            <span className={styles.metaValue}>
              {session?.status ?? "CLOSED"}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Session ID</span>
            <span className={styles.metaValue}>
              {sessionId.slice(0, 13)}...
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Total Sales</span>
            <span className={styles.metaValue}>
              {summary.salesCount} transactions
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Opened At</span>
            <span className={styles.metaValue}>
              {new Date(summary.openedAt).toLocaleString("en-BD")}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Closed At</span>
            <span className={styles.metaValue}>
              {session?.closedAt
                ? new Date(session.closedAt).toLocaleString("en-BD")
                : settlement?.closedAt
                  ? new Date(settlement.closedAt).toLocaleString("en-BD")
                  : "-"}
            </span>
          </div>
        </div>

        {/* CASH AUDIT SECTION */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            Cash Drawer Reconciliation (নগদ হিসাব)
          </div>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Opening Cash Float</td>
                <td>{formatBdt(summary.openingFloatMinor)}</td>
              </tr>
              <tr>
                <td>Cash Sales Collected</td>
                <td>+{formatBdt(summary.cashSalesMinor)}</td>
              </tr>
              {summary.cashCollectionsMinor > 0 && (
                <tr>
                  <td>Outstanding Cash Collections</td>
                  <td>+{formatBdt(summary.cashCollectionsMinor)}</td>
                </tr>
              )}
              {summary.cashRefundsMinor > 0 && (
                <tr>
                  <td>Cash Refunds Paid Out</td>
                  <td>-{formatBdt(summary.cashRefundsMinor)}</td>
                </tr>
              )}
              <tr style={{ borderTop: "1px dashed #cbd5e1" }}>
                <td>
                  <strong>Expected Cash in Drawer</strong>
                </td>
                <td>
                  <strong>{formatBdt(summary.expectedCashMinor)}</strong>
                </td>
              </tr>
              {settlement && (
                <>
                  <tr>
                    <td>Actual Cash Counted</td>
                    <td>{formatBdt(settlement.actualCashMinor)}</td>
                  </tr>
                  <tr>
                    <td>
                      Cash Discrepancy (
                      {settlement.cashDiscrepancyMinor >= 0 ? "Over" : "Short"})
                    </td>
                    <td
                      style={{
                        color:
                          settlement.cashDiscrepancyMinor === 0
                            ? "#15803d"
                            : settlement.cashDiscrepancyMinor < 0
                              ? "#b91c1c"
                              : "#b45309",
                      }}
                    >
                      {settlement.cashDiscrepancyMinor > 0 ? "+" : ""}
                      {formatBdt(settlement.cashDiscrepancyMinor)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        {/* DIGITAL PAYMENTS AUDIT SECTION */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            Digital & Bank Tenders (ডিজিটাল পেমেন্ট)
          </div>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td>Mobile Banking (bKash/Nagad/Rocket)</td>
                <td>{formatBdt(summary.mobileBankingSalesMinor)}</td>
              </tr>
              <tr>
                <td>Card Terminal Payments</td>
                <td>{formatBdt(summary.cardSalesMinor)}</td>
              </tr>
              <tr>
                <td>Bank Transfers</td>
                <td>{formatBdt(summary.bankTransferSalesMinor)}</td>
              </tr>
              {summary.digitalRefundsMinor > 0 && (
                <tr>
                  <td>Digital Refunds Returned</td>
                  <td>-{formatBdt(summary.digitalRefundsMinor)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* TOTAL SALES VOLUME */}
        <section className={styles.section}>
          <table className={styles.table}>
            <tbody>
              <tr className={styles.grandTotalRow}>
                <td>GROSS REGISTER SALES</td>
                <td>{formatBdt(summary.grossSalesMinor)}</td>
              </tr>
              <tr className={styles.grandTotalRow}>
                <td>TOTAL EXPECTED DRAWERS</td>
                <td>{formatBdt(summary.expectedTotalMinor)}</td>
              </tr>
              {settlement && (
                <>
                  <tr className={styles.grandTotalRow}>
                    <td>ACTUAL DRAWER TALLIED</td>
                    <td>{formatBdt(settlement.actualTotalMinor)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Closing Status</strong>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusTag} ${
                          settlement.status === "BALANCED"
                            ? styles.statusBalanced
                            : settlement.status === "SHORTAGE"
                              ? styles.statusShortage
                              : styles.statusOverage
                        }`}
                      >
                        {settlement.status}
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        {/* CASH DENOMINATION BREAKDOWN (IF RECORDED) */}
        {denomEntries.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              Denomination Breakdown (নোট গণনা)
            </div>
            <table className={styles.table}>
              <tbody>
                {denomEntries.map(([denom, count]) => {
                  const denomNum = Number(denom);
                  return (
                    <tr key={denom}>
                      <td>
                        ৳{denomNum} × {count}
                      </td>
                      <td>{formatBdt(denomNum * count * 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* DISCREPANCY REASON & NOTES */}
        {settlement?.discrepancyReason && (
          <div className={styles.notesBox}>
            <strong>Discrepancy Reason:</strong>
            <p style={{ margin: "4px 0 0 0" }}>
              {settlement.discrepancyReason}
            </p>
          </div>
        )}
        {settlement?.closingNotes && (
          <div className={styles.notesBox}>
            <strong>Closing Notes:</strong>
            <p style={{ margin: "4px 0 0 0" }}>{settlement.closingNotes}</p>
          </div>
        )}

        {/* SIGNATURES BLOCK */}
        <footer className={styles.signatures}>
          <div className={styles.sigBlock}>
            <div className={styles.sigLine} />
            <span className={styles.sigLabel}>Cashier Signature</span>
          </div>
          <div className={styles.sigBlock}>
            <div className={styles.sigLine} />
            <span className={styles.sigLabel}>Manager / Auditor</span>
          </div>
        </footer>
      </article>
    </main>
  );
}

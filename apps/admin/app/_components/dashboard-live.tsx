"use client";

import type { DashboardSummaryContract } from "@senvo/contracts";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiClient, AdminApiError } from "../_lib/api-client";
import { dashboardModelFromSummary } from "../_lib/dashboard-model";
import { useAdminSession } from "../admin-shell";
import { AdminDashboard } from "./dashboard";
import { NoAccessState } from "./no-access-state";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

type LoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; summary: DashboardSummaryContract };

/** Loads the real dashboard summary (GET /reports/dashboard). */
export function DashboardLive() {
  const session = useAdminSession();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await client.getDashboardSummary();
      setState({ kind: "ready", summary: result.data });
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      setState({
        kind: "error",
        message:
          caught instanceof AdminApiError
            ? `${caught.message} Request ${caught.requestId}.`
            : "The dashboard could not be loaded.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "forbidden") {
    return (
      <NoAccessState detail="Dashboard দেখতে REPORT দেখার অনুমতি লাগে। বিক্রি করতে বাঁ দিকের menu থেকে New Sale খুলুন।" />
    );
  }
  if (state.kind === "loading") {
    return (
      <section
        aria-busy="true"
        style={{ display: "grid", gap: 8, padding: 24 }}
      >
        <p
          style={{
            fontWeight: 800,
            letterSpacing: "0.12em",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Operations overview
        </p>
        <p
          role="status"
          style={{ alignItems: "center", display: "flex", gap: 8, margin: 0 }}
        >
          <LoaderCircle aria-hidden="true" size={18} /> Loading today&apos;s
          dashboard…
        </p>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ display: "grid", gap: 10, padding: 24 }}>
        <p style={{ alignItems: "center", display: "flex", gap: 8, margin: 0 }}>
          <AlertCircle aria-hidden="true" size={18} /> {state.message}
        </p>
        <button
          onClick={() => void load()}
          style={{ justifySelf: "start", minHeight: 38, padding: "0 14px" }}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }
  return (
    <AdminDashboard
      model={dashboardModelFromSummary(state.summary, {
        greetingName: session?.displayName ?? "there",
      })}
    />
  );
}

import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const NO_ACCESS_MESSAGE = "এই কাজের অনুমতি আপনার নেই";

/** Friendly page shown when the signed-in role cannot use a page. */
export function NoAccessState({
  detail = "আপনার role-এ এই পাতা খোলার অনুমতি নেই। দরকার হলে দোকানের মালিককে বলুন।",
}: {
  detail?: string;
}) {
  return (
    <main
      aria-labelledby="no-access-title"
      style={{
        background: "#fff",
        border: "1px solid #e8e1d8",
        borderRadius: 14,
        margin: "40px auto",
        maxWidth: 560,
        padding: "28px 24px",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "#fbf1f0",
          borderRadius: "50%",
          color: "#721522",
          display: "inline-flex",
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        <ShieldAlert size={24} />
      </span>
      <h1
        id="no-access-title"
        style={{
          color: "#20221f",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "1.5rem",
          fontWeight: 500,
          margin: "14px 0 6px",
        }}
      >
        {NO_ACCESS_MESSAGE}
      </h1>
      <p style={{ color: "#74746c", fontSize: "0.85rem", lineHeight: 1.6 }}>
        {detail}
      </p>
      <Link
        href="/"
        style={{
          background: "#721522",
          borderRadius: 8,
          color: "#fff",
          display: "inline-flex",
          fontSize: "0.8rem",
          fontWeight: 800,
          marginTop: 10,
          padding: "10px 16px",
        }}
      >
        Dashboard-এ ফিরুন
      </Link>
    </main>
  );
}

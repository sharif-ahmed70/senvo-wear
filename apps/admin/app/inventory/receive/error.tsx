"use client";

export default function ReceiveStockError({ reset }: { reset: () => void }) {
  return (
    <main
      style={{
        margin: "40px auto",
        maxWidth: 720,
        padding: 24,
        border: "1px solid #e6dfd7",
        borderRadius: 14,
        background: "#fffdfa",
      }}
    >
      <p
        style={{
          color: "#7a1727",
          fontSize: ".75rem",
          fontWeight: 800,
          letterSpacing: ".12em",
          textTransform: "uppercase",
        }}
      >
        Receive Stock
      </p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500 }}>
        This receiving screen could not load.
      </h1>
      <p style={{ color: "#746d66", lineHeight: 1.6 }}>
        Retry the screen. No inventory movement is created by a render failure.
      </p>
      <button
        onClick={reset}
        style={{
          minHeight: 40,
          padding: "0 14px",
          border: 0,
          borderRadius: 8,
          background: "#68091c",
          color: "white",
          fontWeight: 700,
          cursor: "pointer",
        }}
        type="button"
      >
        Retry
      </button>
    </main>
  );
}

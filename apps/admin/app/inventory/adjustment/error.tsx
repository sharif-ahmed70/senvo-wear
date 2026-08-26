"use client";

export default function StockAdjustmentError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section role="alert" style={{ padding: "32px" }}>
      <p style={{ margin: 0, color: "#9d3029", fontWeight: 800 }}>
        Stock adjustment could not be loaded.
      </p>
      <p style={{ color: "#766f68" }}>
        Retry the page. No inventory movement is created by this error state.
      </p>
      <button onClick={reset} type="button">
        Retry
      </button>
    </section>
  );
}

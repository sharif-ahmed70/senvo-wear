export default function StockAdjustmentLoading() {
  return (
    <section aria-busy="true" style={{ padding: "32px" }}>
      <p
        style={{
          margin: 0,
          color: "#7a1727",
          fontSize: ".75rem",
          fontWeight: 800,
          letterSpacing: ".12em",
          textTransform: "uppercase",
        }}
      >
        Inventory correction
      </p>
      <h1
        style={{
          margin: "8px 0",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontWeight: 500,
        }}
      >
        Preparing Stock Adjustment…
      </h1>
      <p style={{ color: "#766f68" }}>
        Loading locations, catalog identity and inventory availability.
      </p>
    </section>
  );
}

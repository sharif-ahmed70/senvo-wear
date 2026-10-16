export default function ReceiveStockLoading() {
  return (
    <main style={{ padding: "28px" }}>
      <p
        style={{
          color: "#7a1727",
          fontSize: ".75rem",
          fontWeight: 800,
          letterSpacing: ".12em",
          textTransform: "uppercase",
        }}
      >
        Incoming stock
      </p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500 }}>
        Preparing Receive Stock…
      </h1>
      <p style={{ color: "#746d66" }}>
        Loading locations and product identity.
      </p>
    </main>
  );
}

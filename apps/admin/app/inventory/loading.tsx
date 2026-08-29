export default function InventoryLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading inventory"
      style={{ display: "grid", gap: 16 }}
    >
      <div style={{ height: 76, borderRadius: 12, background: "#f2ece5" }} />
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(5,minmax(0,1fr))",
        }}
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            style={{ height: 112, borderRadius: 12, background: "#f6f1eb" }}
          />
        ))}
      </div>
      <div style={{ height: 430, borderRadius: 12, background: "#f5efe8" }} />
    </main>
  );
}

"use client";

export default function SalesSourcesError({ reset }: { reset: () => void }) {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section style={{ textAlign: "center", maxWidth: 520 }}>
        <h1>Sales Sources is unavailable</h1>
        <p>
          The page could not be rendered. Retry without changing any sales data.
        </p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}

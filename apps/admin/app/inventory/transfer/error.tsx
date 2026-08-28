"use client";

export default function TransferStockError({ reset }: { reset: () => void }) {
  return (
    <main style={{ display: "grid", gap: 12, maxWidth: 680, padding: 32 }}>
      <h1>Transfer Stock is unavailable</h1>
      <p>The page could not be prepared. Your inventory has not been changed.</p>
      <button onClick={reset} type="button">Try again</button>
    </main>
  );
}

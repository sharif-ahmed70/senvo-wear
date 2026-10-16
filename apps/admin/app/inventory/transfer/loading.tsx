import { LoaderCircle } from "lucide-react";

export default function TransferStockLoading() {
  return (
    <main style={{ display: "grid", minHeight: "45vh", placeItems: "center" }}>
      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <LoaderCircle aria-hidden="true" size={20} />
        <span>Preparing stock transfer…</span>
      </div>
    </main>
  );
}

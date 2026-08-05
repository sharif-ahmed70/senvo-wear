import Link from "next/link";
import type {
  SalesCounterContract,
  SalesSessionContract,
} from "@senvo/contracts";

export type SellingContext = {
  counter: SalesCounterContract;
  session: SalesSessionContract;
};

export function SellingContextSelector({
  contexts,
  onSelect,
  selectedId,
}: {
  contexts: readonly SellingContext[];
  onSelect: (sessionId: string) => void;
  selectedId: string;
}) {
  if (contexts.length === 0) {
    return (
      <section className="pos-sale-state">
        <strong>Start a sales session before recording a sale.</strong>
        <p>Choose an active sales counter on the Sales Sessions page.</p>
        <Link className="pos-sale-secondary" href="/pos/sessions">
          Go to Sales Sessions
        </Link>
      </section>
    );
  }
  if (contexts.length === 1) {
    return (
      <div className="pos-sale-context" aria-label="Selected sales counter">
        <span>Sales counter</span>
        <strong>{contexts[0]?.counter.name}</strong>
        <small>{contexts[0]?.counter.code}</small>
      </div>
    );
  }
  return (
    <label className="pos-sale-context-select">
      Sales counter
      <select
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">Choose a counter</option>
        {contexts.map(({ counter, session }) => (
          <option key={session.id} value={session.id}>
            {counter.name} ({counter.code})
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import type {
  InventoryMovementContract,
  StockLocationReadContract,
  VariantInventoryAvailabilityContract,
} from "@senvo/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Fingerprint,
  History,
  LoaderCircle,
  MapPin,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "./movement-detail-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type MovementType =
  | "OPENING"
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

type MovementStatus = "DRAFT" | "POSTED";

type VariantIdentity = {
  color: string;
  productName: string;
  size: string;
  sku: string;
  variantId: string;
};

type HistorySnapshot = {
  destination: string | null;
  occurredAt: string;
  productName: string | null;
  quantity: number | null;
  source: string | null;
  status: MovementStatus | null;
  type: MovementType | null;
  variant: string | null;
  sku: string | null;
};

export function MovementDetailWorkspace({
  movementId,
  permissions,
}: {
  movementId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead = permissions.includes("INVENTORY:READ");
  const searchParams = useSearchParams();
  const snapshot = useMemo(() => snapshotFrom(searchParams), [searchParams]);
  const [movement, setMovement] = useState<InventoryMovementContract | null>(
    null,
  );
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [variants, setVariants] = useState<Map<string, VariantIdentity>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [integrationPending, setIntegrationPending] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    void reloadKey;
    if (!canRead) return;
    setLoading(true);
    setError("");
    setIntegrationPending(false);
    try {
      const [movementResult, locationResult] = await Promise.all([
        client.request<InventoryMovementContract>(
          `/inventory/movements/${encodeURIComponent(movementId)}`,
        ),
        client.listStockLocations({ pageSize: 100 }),
      ]);
      setMovement(movementResult.data);
      setLocations(locationResult.data.items);

      const uniqueVariantIds = [
        ...new Set(
          movementResult.data.lines.map((line) => line.productVariantId),
        ),
      ];
      const identities = await Promise.all(
        uniqueVariantIds.map(async (variantId) => {
          try {
            const result = await client.getVariantAvailability({ variantId });
            return [variantId, identityFromAvailability(result.data)] as const;
          } catch {
            return [variantId, null] as const;
          }
        }),
      );
      setVariants(
        new Map(
          identities.filter(
            (entry): entry is readonly [string, VariantIdentity] =>
              entry[1] !== null,
          ),
        ),
      );
    } catch (caught) {
      if (
        caught instanceof AdminApiError &&
        (caught.status === 404 || caught.status === 405)
      ) {
        setIntegrationPending(true);
        setMovement(null);
      } else {
        setError(messageFor(caught));
      }
    } finally {
      setLoading(false);
    }
  }, [canRead, movementId, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canRead) {
    return (
      <StatePanel
        icon={<ShieldCheck size={28} />}
        title="Movement details are restricted"
        text="Your role does not have permission to read inventory movements."
      />
    );
  }

  if (loading && !movement) {
    return (
      <StatePanel
        icon={<LoaderCircle className={styles.spin} size={28} />}
        title="Loading movement details"
        text="Reading the inventory movement record and variant identity…"
      />
    );
  }

  if (error && !movement) {
    return (
      <StatePanel
        action={
          <button
            onClick={() => setReloadKey((current) => current + 1)}
            type="button"
          >
            Retry
          </button>
        }
        icon={<RotateCcw size={27} />}
        title="Movement details are unavailable"
        text={error}
      />
    );
  }

  const type = movement?.type ?? snapshot.type;
  const status = movement?.status ?? snapshot.status;
  const occurredAt = movement?.occurredAt ?? snapshot.occurredAt;
  const source = movement
    ? locationName(locations, movement.sourceLocationId)
    : snapshot.source;
  const destination = movement
    ? locationName(locations, movement.destinationLocationId)
    : snapshot.destination;
  const totalQuantity = movement
    ? movement.lines.reduce((sum, line) => sum + line.quantity, 0)
    : snapshot.quantity;

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.breadcrumbs}>
            <Link href="/inventory">Inventory</Link>
            <span>/</span>
            <Link href="/inventory/movements">Movement History</Link>
            <span>/</span>
            <span>{shortId(movementId)}</span>
          </div>
          <h1>Movement Details</h1>
          <p>
            One authoritative view of this inventory movement. Repeated summary
            cards are intentionally avoided.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/inventory/movements">
            <ArrowLeft size={16} /> Back to movements
          </Link>
          {movement ? (
            <button
              className={styles.exportButton}
              onClick={() => exportLines(movement, variants)}
              type="button"
            >
              <Download size={15} /> Export lines
            </button>
          ) : null}
        </div>
      </header>

      {integrationPending ? (
        <div className={styles.integrationGate} role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Frontend is ready; one thin read binding remains</strong>
            <p>
              Expose the existing organization-scoped movement-by-ID capability
              as
              <code>GET /inventory/movements/:movementId</code> returning the
              existing
              <code>InventoryMovementContract</code>. This page already uses the
              current variant-availability and stock-location APIs to hydrate
              readable labels.
            </p>
          </div>
        </div>
      ) : null}

      <section className={styles.identityCard}>
        <div className={styles.identityTop}>
          <span className={styles.heroIcon}>{iconForType(type)}</span>
          <div>
            <p className={styles.eyebrow}>Inventory movement</p>
            <div className={styles.titleRow}>
              <h2>{movement?.movementNumber || shortId(movementId)}</h2>
              {status ? <StatusBadge status={status} /> : null}
              {type ? <TypeBadge type={type} /> : null}
            </div>
            <span className={styles.subtle}>{formatDateTime(occurredAt)}</span>
          </div>
        </div>

        <div className={styles.routeCard}>
          <LocationNode label="From" value={source ?? "External / none"} />
          <ArrowRight size={18} />
          <LocationNode label="To" value={destination ?? "External / none"} />
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.linesCard}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Stock impact</p>
              <h2>Movement Lines</h2>
            </div>
            {totalQuantity !== null ? (
              <span>
                {totalQuantity} total unit{totalQuantity === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {movement ? (
            <MovementLines movement={movement} variants={variants} />
          ) : snapshot.productName || snapshot.sku ? (
            <SnapshotLine snapshot={snapshot} />
          ) : (
            <InlineState
              icon={<Boxes size={22} />}
              title="Line details are waiting for the detail binding"
              text="No fake product or quantity data is rendered while the full movement record is unavailable."
            />
          )}
        </section>

        <aside className={styles.sideColumn}>
          {movement ? (
            <RecordMetadata movement={movement} />
          ) : (
            <SnapshotContext movementId={movementId} />
          )}
          {movement?.note ? (
            <section className={styles.sideCard}>
              <div className={styles.sideHeading}>
                <FileText size={18} />
                <h2>Note</h2>
              </div>
              <p className={styles.noteText}>{movement.note}</p>
            </section>
          ) : null}
          {movement ? <MovementTimeline movement={movement} /> : null}
        </aside>
      </div>

      {movement?.status === "POSTED" ? (
        <div className={styles.immutableNotice}>
          <ShieldCheck size={19} />
          <div>
            <strong>Posted movement</strong>
            <p>
              Posted inventory history is read-only. Corrections should use a
              compensating/reversal workflow, never edit this record in place.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MovementLines({
  movement,
  variants,
}: {
  movement: InventoryMovementContract;
  variants: Map<string, VariantIdentity>;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Product / Variant</th>
            <th>SKU</th>
            <th className={styles.numberCell}>Quantity</th>
            <th>Line note</th>
          </tr>
        </thead>
        <tbody>
          {movement.lines.map((line) => {
            const identity = variants.get(line.productVariantId);
            return (
              <tr key={line.id}>
                <td>{line.lineNumber}</td>
                <td>
                  <div className={styles.productCell}>
                    <span className={styles.productGlyph}>
                      {initials(identity?.productName ?? "SW")}
                    </span>
                    <div>
                      <strong>{identity?.productName ?? "Variant"}</strong>
                      <small>
                        {identity
                          ? `${identity.color} / ${identity.size}`
                          : line.productVariantId}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <code>{identity?.sku ?? "Identity loading unavailable"}</code>
                </td>
                <td className={`${styles.numberCell} ${styles.quantity}`}>
                  {line.quantity}
                </td>
                <td>{line.note || <span className={styles.muted}>—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotLine({ snapshot }: { snapshot: HistorySnapshot }) {
  return (
    <div className={styles.snapshotLine}>
      <span className={styles.productGlyph}>
        {initials(snapshot.productName ?? "SW")}
      </span>
      <div>
        <strong>{snapshot.productName ?? "Movement line"}</strong>
        <small>{snapshot.variant ?? "Variant details unavailable"}</small>
        {snapshot.sku ? <code>{snapshot.sku}</code> : null}
      </div>
      {snapshot.quantity !== null ? <b>{snapshot.quantity}</b> : null}
      <span className={styles.snapshotBadge}>History snapshot</span>
    </div>
  );
}

function RecordMetadata({ movement }: { movement: InventoryMovementContract }) {
  const entries: Array<[string, ReactNode]> = [
    ["Movement ID", <code key="id">{movement.id}</code>],
    [
      "Reference",
      movement.referenceType && movement.referenceId
        ? `${movement.referenceType} · ${movement.referenceId}`
        : "—",
    ],
    ["Idempotency key", <code key="key">{movement.idempotencyKey}</code>],
    ["Created", formatDateTime(movement.createdAt)],
    [
      "Posted",
      movement.postedAt ? formatDateTime(movement.postedAt) : "Not posted",
    ],
  ];
  if (movement.isReversal && movement.reversesMovementId) {
    entries.push([
      "Reverses",
      <code key="reverses">{movement.reversesMovementId}</code>,
    ]);
  }
  if (movement.isReversed && movement.reversedByMovementId) {
    entries.push([
      "Reversed by",
      <code key="reversedBy">{movement.reversedByMovementId}</code>,
    ]);
  }
  if (movement.reversalReason) {
    entries.push(["Reversal reason", movement.reversalReason]);
  }
  return (
    <section className={styles.sideCard}>
      <div className={styles.sideHeading}>
        <Fingerprint size={18} />
        <h2>Record Metadata</h2>
      </div>
      <dl className={styles.metadataList}>
        {entries.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SnapshotContext({ movementId }: { movementId: string }) {
  return (
    <section className={styles.sideCard}>
      <div className={styles.sideHeading}>
        <Fingerprint size={18} />
        <h2>Record Identity</h2>
      </div>
      <dl className={styles.metadataList}>
        <div>
          <dt>Movement ID</dt>
          <dd>
            <code>{movementId}</code>
          </dd>
        </div>
      </dl>
      <p className={styles.helperText}>
        Reference, notes, timestamps and reversal metadata are intentionally not
        duplicated or invented from the list read model.
      </p>
    </section>
  );
}

function MovementTimeline({
  movement,
}: {
  movement: InventoryMovementContract;
}) {
  return (
    <section className={styles.sideCard}>
      <div className={styles.sideHeading}>
        <History size={18} />
        <h2>Lifecycle</h2>
      </div>
      <div className={styles.timeline}>
        <TimelineItem
          icon={<ClipboardList size={15} />}
          label="Draft created"
          time={formatDateTime(movement.createdAt)}
        />
        {movement.postedAt ? (
          <TimelineItem
            icon={<CheckCircle2 size={15} />}
            label="Movement posted"
            time={formatDateTime(movement.postedAt)}
            active
          />
        ) : null}
      </div>
    </section>
  );
}

function TimelineItem({
  active = false,
  icon,
  label,
  time,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  time: string;
}) {
  return (
    <div
      className={`${styles.timelineItem} ${active ? styles.timelineActive : ""}`}
    >
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{time}</small>
      </div>
    </div>
  );
}

function LocationNode({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.locationNode}>
      <span>
        <MapPin size={16} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: MovementType }) {
  return (
    <span className={`${styles.badge} ${styles[`type_${type}`]}`}>
      {humanize(type)}
    </span>
  );
}

function StatusBadge({ status }: { status: MovementStatus }) {
  return (
    <span
      className={`${styles.statusBadge} ${status === "POSTED" ? styles.posted : styles.draft}`}
    >
      {status === "POSTED" ? <CheckCircle2 size={12} /> : null}
      {humanize(status)}
    </span>
  );
}

function InlineState({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <div className={styles.inlineState}>
      {icon}
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function StatePanel({
  action,
  icon,
  text,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span>{icon}</span>
        <div>
          <h1>{title}</h1>
          <p>{text}</p>
          <div className={styles.stateActions}>
            {action}
            <Link href="/inventory/movements">Back to movement history</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function identityFromAvailability(
  availability: VariantInventoryAvailabilityContract,
): VariantIdentity {
  return {
    color: availability.variant.color,
    productName: availability.variant.productName,
    size: availability.variant.size,
    sku: availability.variant.sku,
    variantId: availability.variant.id,
  };
}

function locationName(
  locations: StockLocationReadContract[],
  id: string | null,
): string | null {
  if (!id) return null;
  return (
    locations.find((location) => location.id === id)?.name ??
    `Location ${shortId(id)}`
  );
}

function snapshotFrom(params: URLSearchParams): HistorySnapshot {
  return {
    destination: valueOrNull(params.get("destination")),
    occurredAt: params.get("occurredAt") ?? "",
    productName: valueOrNull(params.get("productName")),
    quantity: numericOrNull(params.get("quantity")),
    source: valueOrNull(params.get("source")),
    status: statusOrNull(params.get("status")),
    type: typeOrNull(params.get("type")),
    variant: valueOrNull(params.get("variant")),
    sku: valueOrNull(params.get("sku")),
  };
}

function typeOrNull(value: string | null): MovementType | null {
  return value &&
    [
      "OPENING",
      "RECEIPT",
      "ISSUE",
      "TRANSFER",
      "ADJUSTMENT_IN",
      "ADJUSTMENT_OUT",
    ].includes(value)
    ? (value as MovementType)
    : null;
}

function statusOrNull(value: string | null): MovementStatus | null {
  return value === "DRAFT" || value === "POSTED" ? value : null;
}

function valueOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numericOrNull(value: string | null) {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function exportLines(
  movement: InventoryMovementContract,
  variants: Map<string, VariantIdentity>,
) {
  const rows = [
    ["line", "product", "variant", "sku", "quantity", "note"],
    ...movement.lines.map((line) => {
      const identity = variants.get(line.productVariantId);
      return [
        String(line.lineNumber),
        identity?.productName ?? "",
        identity
          ? `${identity.color} / ${identity.size}`
          : line.productVariantId,
        identity?.sku ?? "",
        String(line.quantity),
        line.note ?? "",
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `senvo-${movement.movementNumber || shortId(movement.id)}-lines.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function iconForType(type: MovementType | null) {
  if (type === "RECEIPT" || type === "OPENING")
    return <PackagePlus size={21} />;
  if (type === "TRANSFER") return <ArrowRightLeft size={21} />;
  if (type === "ISSUE" || type === "ADJUSTMENT_OUT")
    return <PackageMinus size={21} />;
  if (type === "ADJUSTMENT_IN") return <SlidersHorizontal size={21} />;
  return <CalendarClock size={21} />;
}

function shortId(id: string) {
  return id ? `MOV-${id.slice(0, 8).toUpperCase()}` : "Movement";
}

function initials(value: string) {
  return (
    value
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "SW"
  );
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function csvCell(value: string) {
  return `"${value.replace(/"/gu, '""')}"`;
}

function messageFor(caught: unknown) {
  if (caught instanceof AdminApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "Movement details could not be loaded.";
}

"use client";

import {
  AlertCircle,
  ArrowLeft,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { useAdminSession } from "../../../admin-shell";
import {
  canRecordStockIntake,
  OWNER_ONLY_MESSAGE,
  readErrorMessage,
} from "../_lib/intake-support";
import type { IntakeReferences } from "./intake-parts";
import { NewProductIntake } from "./new-product-intake";
import { RestockIntake } from "./restock-intake";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient } from "./use-intake-submission";

type Tab = "new" | "restock";

const tabs: ReadonlyArray<[Tab, string]> = [
  ["new", "নতুন Product"],
  ["restock", "পুরোনো মাল আবার এলো"],
];

export async function loadIntakeReferences(): Promise<IntakeReferences> {
  const [categories, colors, sizes, suppliers, locations] = await Promise.all([
    intakeClient.listCategories(),
    intakeClient.listColors(),
    intakeClient.listSizes(),
    intakeClient.listSuppliers({ status: "ACTIVE" }),
    intakeClient.listStockLocations({ pageSize: 100 }),
  ]);
  return {
    categories: categories.data,
    colors: colors.data.filter((color) => color.status === "ACTIVE"),
    locations: locations.data.items.filter(
      (location) => location.status === "ACTIVE",
    ),
    sizes: sizes.data.filter((size) => size.status === "ACTIVE"),
    suppliers: suppliers.data,
  };
}

export function StockIntakeWizard({
  initialReferences,
  permissions: propsPermissions,
}: {
  initialReferences?: IntakeReferences;
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const session = useAdminSession();
  const permissions = propsPermissions ?? session?.permissions ?? null;
  const canSave = canRecordStockIntake(permissions);
  const uid = useId();
  const [tab, setTab] = useState<Tab>("new");
  const [references, setReferences] = useState<IntakeReferences | null>(
    initialReferences ?? null,
  );
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setReferences(await loadIntakeReferences());
    } catch (caught) {
      setLoadError(readErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    if (!initialReferences) void load();
  }, [initialReferences, load]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Tab = tab === "new" ? "restock" : "new";
    setTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  }

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <Link className={styles.backLink} href="/inventory">
          <ArrowLeft aria-hidden="true" size={15} /> Inventory
        </Link>
        <Link className={styles.backLink} href="/catalog/products/new">
          শুধু Product তৈরি (stock ছাড়া)
        </Link>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Catalog · নতুন মাল</p>
          <h1>নতুন মাল তুলুন</h1>
          <p className={styles.heroLead}>
            দোকানে মাল এলে এখানে একবারেই Product, রং-size, দাম, barcode, stock
            আর Supplier-এর হিসাব তুলে ফেলুন।
          </p>
        </div>
      </header>

      {!canSave ? (
        <p className={styles.warning} role="status">
          <ShieldAlert aria-hidden="true" size={16} /> {OWNER_ONLY_MESSAGE} আপনি
          দেখতে পারবেন, কিন্তু Save করতে পারবেন না।
        </p>
      ) : null}

      <div aria-label="কী ধরনের মাল" className={styles.tabs} role="tablist">
        {tabs.map(([value, label]) => (
          <button
            aria-controls={`${uid}-panel-${value}`}
            aria-selected={tab === value}
            className={`${styles.tab} ${tab === value ? styles.tabActive : ""}`}
            id={`${uid}-tab-${value}`}
            key={value}
            onClick={() => setTab(value)}
            onKeyDown={onTabKey}
            role="tab"
            tabIndex={tab === value ? 0 : -1}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {loadError ? (
        <section className={styles.statePanel} role="alert">
          <AlertCircle aria-hidden="true" size={22} />
          <div>
            <h2>তথ্য আনা যায়নি</h2>
            <p>{loadError}</p>
            <button
              className={styles.secondaryButton}
              onClick={() => void load()}
              type="button"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </section>
      ) : !references ? (
        <section aria-busy="true" className={styles.statePanel}>
          <LoaderCircle aria-hidden="true" className={styles.spin} size={22} />
          <div>
            <h2>তৈরি হচ্ছে…</h2>
            <p>Category, রং, size, Supplier আর location আনা হচ্ছে।</p>
          </div>
        </section>
      ) : (
        tabs.map(([value]) => (
          <div
            aria-labelledby={`${uid}-tab-${value}`}
            hidden={tab !== value}
            id={`${uid}-panel-${value}`}
            key={value}
            role="tabpanel"
          >
            {value === "new" ? (
              <NewProductIntake canSave={canSave} references={references} />
            ) : (
              <RestockIntake canSave={canSave} references={references} />
            )}
          </div>
        ))
      )}
    </main>
  );
}

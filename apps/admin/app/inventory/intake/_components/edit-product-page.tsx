"use client";

import { AlertCircle, ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminPermissions } from "../../../admin-shell";
import { readErrorMessage } from "../_lib/intake-support";
import {
  EditProductIntake,
  purchasesFromLastCosts,
  type EditIntakeSource,
} from "./edit-product-intake";
import type { IntakeReferences } from "./intake-parts";
import { loadIntakeReferences } from "./stock-intake-wizard";
import styles from "./stock-intake-wizard.module.css";
import { intakeClient } from "./use-intake-submission";

/** Link from the inventory panel: /inventory/intake/edit?product=<id> */
export function intakeEditHref(productId: string): string {
  return `/inventory/intake/edit?${new URLSearchParams({ product: productId }).toString()}`;
}

export function EditProductPage() {
  const permissions = useAdminPermissions();
  const canSave = permissions.includes("CATALOG:UPDATE");
  const canEditExtraCost = permissions.includes("PROCUREMENT:UPDATE");
  const [productId, setProductId] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [references, setReferences] = useState<IntakeReferences | null>(null);
  const [source, setSource] = useState<EditIntakeSource | null>(null);
  const [error, setError] = useState("");

  // Read in an effect: the URL is not known while rendering on the server.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setProductId(query.get("product") ?? "");
    setPurchaseId(query.get("purchase"));
  }, []);

  const load = useCallback(async () => {
    if (!productId) return;
    setError("");
    setSource(null);
    try {
      const [refs, details, lastCosts] = await Promise.all([
        references ?? loadIntakeReferences(),
        intakeClient.getProduct(productId),
        intakeClient
          .listLastPurchaseCosts(productId)
          .then((result) => result.data)
          .catch(() => []),
      ]);
      const purchases = purchasesFromLastCosts(lastCosts);
      // Default: the first entry, i.e. when the product was added.
      const chosen =
        purchases.find((item) => item.id === purchaseId) ?? purchases[0];
      const purchase = chosen
        ? (await intakeClient.getPurchase(chosen.id)).data
        : null;
      setReferences(refs);
      setSource({ details: details.data, purchase, purchases });
    } catch (caught) {
      setError(readErrorMessage(caught));
    }
    // references is a cache only; reloading it is not needed on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, purchaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  function choosePurchase(id: string) {
    setPurchaseId(id);
    const query = new URLSearchParams(window.location.search);
    query.set("purchase", id);
    window.history.replaceState(null, "", `?${query.toString()}`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <Link className={styles.backLink} href="/inventory">
          <ArrowLeft aria-hidden="true" size={15} /> Inventory
        </Link>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Inventory · Edit</p>
          <h1>Product Edit করুন</h1>
          <p className={styles.heroLead}>
            নতুন মাল তোলার সময় যে তথ্য দিয়েছিলেন সেগুলো এখানে আছে। যা ভুল
            হয়েছে তা ঠিক করে Save করুন।
          </p>
        </div>
      </header>

      {productId === "" ? (
        <p className={styles.error} role="alert">
          কোন Product Edit করবেন বোঝা যায়নি। Inventory থেকে আবার Edit চাপুন।
        </p>
      ) : error ? (
        <section className={styles.statePanel} role="alert">
          <AlertCircle aria-hidden="true" size={22} />
          <div>
            <h2>তথ্য আনা যায়নি</h2>
            <p>{error}</p>
            <button
              className={styles.secondaryButton}
              onClick={() => void load()}
              type="button"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </section>
      ) : !references || !source ? (
        <section aria-busy="true" className={styles.statePanel}>
          <LoaderCircle aria-hidden="true" className={styles.spin} size={22} />
          <div>
            <h2>আনা হচ্ছে…</h2>
            <p>Product আর মাল তোলার এন্ট্রি আনা হচ্ছে।</p>
          </div>
        </section>
      ) : (
        <EditProductIntake
          canEditExtraCost={canEditExtraCost}
          canSave={canSave}
          onPurchaseChange={choosePurchase}
          references={references}
          source={source}
        />
      )}
    </main>
  );
}

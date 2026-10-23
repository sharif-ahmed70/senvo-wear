"use client";

import type { ProductVariantContract } from "@senvo/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { AdminApiClient } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
type Action = "archive" | "restore" | "delete";

const copy: Record<Action, { title: string; body: string; confirm: string }> = {
  archive: {
    title: "Archive this option?",
    body: "It will be removed from POS, barcode scanning and the online store. Its sales and stock history stay. You can restore it later.",
    confirm: "Archive",
  },
  restore: {
    title: "Restore this option?",
    body: "It will be available for selling again.",
    confirm: "Restore",
  },
  delete: {
    title: "Delete this option permanently?",
    body: "Only an option that was never stocked or sold can be deleted. Its barcode is removed too. This cannot be undone.",
    confirm: "Delete",
  },
};

/** Archive / restore / delete for one variant (colour + size) of a product. */
export function VariantLifecycleActions({
  variant,
  canUpdate,
  canDelete,
  onSaved,
  onDeleted,
}: {
  variant: ProductVariantContract;
  canUpdate: boolean;
  /** Owner only. */
  canDelete: boolean;
  onSaved: (variant: ProductVariantContract) => void;
  onDeleted: (variantId: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const archived = variant.status === "ARCHIVED";

  useEffect(() => {
    if (action) dialog.current?.showModal();
  }, [action]);

  if (!canUpdate && !canDelete) return null;

  function open(next: Action) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setAction(next);
  }
  function close() {
    dialog.current?.close();
    setAction(null);
    trigger.current?.focus();
  }
  async function confirm() {
    if (!action || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await client.changeVariantLifecycle(action, {
        variantId: variant.id,
        expectedUpdatedAt: variant.updatedAt,
      });
      close();
      if (action === "delete") onDeleted(variant.id);
      else if (response.data) onSaved(response.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The option could not be changed.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="variant-lifecycle">
      {canUpdate ? (
        <button
          className="catalog-action-button catalog-action-button--small"
          type="button"
          aria-label={`${archived ? "Restore" : "Archive"} ${variant.sku}`}
          onClick={() => open(archived ? "restore" : "archive")}
        >
          {archived ? "Restore" : "Archive"}
        </button>
      ) : null}
      {canDelete ? (
        <button
          className="catalog-action-button catalog-action-button--small catalog-action-button--danger"
          type="button"
          aria-label={`Delete ${variant.sku}`}
          onClick={() => open("delete")}
        >
          Delete
        </button>
      ) : null}
      {action ? (
        <dialog
          ref={dialog}
          className="catalog-dialog"
          aria-labelledby={titleId}
          onCancel={() => {
            setAction(null);
            trigger.current?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <h2 id={titleId}>{copy[action].title}</h2>
            <p className="catalog-dialog__sku">{variant.sku}</p>
            <p>{copy[action].body}</p>
            {error ? (
              <p className="catalog-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="catalog-dialog__footer">
              <button
                className="catalog-action-button"
                type="button"
                onClick={close}
              >
                Cancel
              </button>
              <button
                className={`catalog-action-button ${
                  action === "delete"
                    ? "catalog-action-button--danger-solid"
                    : "catalog-action-button--primary"
                }`}
                type="submit"
                disabled={busy}
              >
                {busy ? "Saving..." : copy[action].confirm}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

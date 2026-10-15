"use client";

import type {
  CategoryContract,
  ProductContract,
  ProductDeletableContract,
} from "@senvo/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
type Action = "edit" | "archive" | "restore" | "delete";

export function ProductLifecycleActions({
  product,
  permissions,
  onSaved,
}: {
  product: ProductContract;
  permissions: readonly AdminPermissionKey[];
  onSaved: (product: ProductContract) => void;
}) {
  const router = useRouter();
  const canUpdate = permissions.includes("CATALOG:UPDATE");
  const canDelete = permissions.includes("CATALOG:DELETE");
  const [deletable, setDeletable] = useState<ProductDeletableContract | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryContract[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    let active = true;
    setDeletable(null);
    if (canDelete)
      void client
        .getProductDeletable(product.id)
        .then((result) => {
          if (active) setDeletable(result.data);
        })
        .catch(() => {
          if (active)
            setDeletable({
              deletable: false,
              reason: "Unable to check product history. Refresh to retry.",
            });
        });
    return () => {
      active = false;
    };
  }, [canDelete, product.id, product.updatedAt]);

  useEffect(() => {
    if (action) dialog.current?.showModal();
  }, [action]);

  async function open(next: Action) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    if (next === "edit") {
      try {
        setCategories((await client.listCategories()).data);
      } catch {
        setError("Unable to load categories. Try again.");
        return;
      }
    }
    setAction(next);
  }
  function close() {
    dialog.current?.close();
    setAction(null);
    trigger.current?.focus();
  }
  async function save(form: HTMLFormElement) {
    if (!action || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const input = {
      productId: product.id,
      expectedUpdatedAt: product.updatedAt,
    };
    try {
      if (action === "edit") {
        const data = new FormData(form);
        const response = await client.editProduct({
          ...input,
          name: String(data.get("name")),
          description: String(data.get("description")) || null,
          categoryId: String(data.get("categoryId")),
        });
        onSaved(response.data);
      } else {
        const response = await client.changeProductLifecycle(action, input);
        if (action === "delete") {
          router.push("/catalog/products");
          router.refresh();
        } else if (response.data) onSaved(response.data);
      }
      close();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The product could not be changed.",
      );
      if (canDelete)
        void client
          .getProductDeletable(product.id)
          .then((result) => setDeletable(result.data))
          .catch(() => {});
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="admin-section" aria-label="Product actions">
      {canUpdate ? (
        <>
          <button
            className="organization-text-button"
            type="button"
            onClick={() => void open("edit")}
          >
            Edit
          </button>
          <button
            className="organization-text-button"
            type="button"
            onClick={() =>
              void open(product.status === "ARCHIVED" ? "restore" : "archive")
            }
          >
            {product.status === "ARCHIVED" ? "Restore" : "Archive"}
          </button>
        </>
      ) : null}
      {canDelete ? (
        <>
          <button
            className="organization-text-button"
            type="button"
            disabled={!deletable?.deletable}
            aria-describedby={reasonId}
            onClick={() => void open("delete")}
          >
            Delete
          </button>
          <p id={reasonId}>
            {deletable ? deletable.reason : "Checking product history?"}
          </p>
        </>
      ) : null}
      {error && !action ? <p role="alert">{error}</p> : null}
      {action ? (
        <dialog
          ref={dialog}
          className="admin-section"
          aria-labelledby={titleId}
          onCancel={() => {
            setAction(null);
            trigger.current?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}
          >
            <h2 id={titleId}>
              {action === "edit"
                ? "Edit product"
                : action === "archive"
                  ? "Archive product"
                  : action === "restore"
                    ? "Restore product"
                    : "Delete product"}
            </h2>
            {action === "edit" ? (
              <>
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={product.name}
                    required
                    maxLength={160}
                    disabled={busy}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={product.description ?? ""}
                    maxLength={2000}
                    disabled={busy}
                  />
                </label>
                <label>
                  Category
                  <select
                    name="categoryId"
                    defaultValue={product.categoryId}
                    disabled={busy}
                    required
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p>
                {action === "delete"
                  ? "Delete this unused product, its variants, barcodes and media links permanently? Media files will be kept."
                  : action === "archive"
                    ? "Remove this product from selling? Its history will remain available."
                    : "Make this product available for selling again?"}
              </p>
            )}
            {error ? <p role="alert">{error}</p> : null}
            <button
              className="organization-text-button"
              type="button"
              onClick={close}
            >
              Cancel
            </button>
            <button
              className="organization-text-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving?" : "Confirm"}
            </button>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}

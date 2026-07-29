"use client";

import type {
  CategoryContract,
  CollectionContract,
  ProductContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  PackageOpen,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";

type CatalogKind = "categories" | "collections" | "products";
type CatalogRecord = CategoryContract | CollectionContract | ProductContract;

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});

export function CatalogWorkspace({
  kind,
  permissions,
}: {
  kind: CatalogKind;
  permissions: readonly AdminPermissionKey[];
}) {
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [categories, setCategories] = useState<CategoryContract[]>([]);
  const [collections, setCollections] = useState<CollectionContract[]>([]);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canCreate = permissions.includes("CATALOG:CREATE");
  const canUpdate = permissions.includes("CATALOG:UPDATE");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const result =
        kind === "categories"
          ? await client.listCategories()
          : kind === "collections"
            ? await client.listCollections()
            : await client.listProducts();
      setRecords(result.data);
      if (kind === "products") {
        const [categoryResult, collectionResult] = await Promise.all([
          client.listCategories(),
          client.listCollections(),
        ]);
        setCategories(categoryResult.data);
        setCollections(collectionResult.data);
      }
      setState("ready");
    } catch (caught) {
      setError(messageForError(caught));
      setState("error");
    }
  }, [kind]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const title = titleFor(kind);
  return (
    <>
      <header className="admin-page-header catalog-page-header">
        <div className="admin-page-header__copy">
          <p className="admin-kicker">Catalog</p>
          <h1>{title}</h1>
          <p>{descriptionFor(kind)}</p>
        </div>
        {canCreate ? (
          <button
            className="catalog-primary-button"
            onClick={() => setFormOpen(true)}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add {singularFor(kind)}
          </button>
        ) : null}
      </header>

      {formOpen ? (
        <CatalogForm
          categories={categories}
          collections={collections}
          kind={kind}
          onCancel={() => setFormOpen(false)}
          onSaved={(record) => {
            setRecords((current) => [record, ...current]);
            setFormOpen(false);
          }}
          saving={saving}
          setSaving={setSaving}
        />
      ) : null}

      <section className="admin-section admin-section--compact">
        <div className="catalog-toolbar">
          <div>
            <h2>{title}</h2>
            <span>{records.length} records</span>
          </div>
          <button
            aria-label={`Refresh ${title.toLowerCase()}`}
            className="catalog-icon-button"
            disabled={state === "loading"}
            onClick={() => void load()}
            title="Refresh"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={16} />
          </button>
        </div>
        {state === "loading" ? (
          <CatalogLoading />
        ) : state === "error" ? (
          <CatalogError message={error} onRetry={() => void load()} />
        ) : records.length === 0 ? (
          <CatalogEmpty canCreate={canCreate} kind={kind} />
        ) : (
          <CatalogTable
            canUpdate={canUpdate}
            kind={kind}
            records={records}
            setRecords={setRecords}
          />
        )}
      </section>
    </>
  );
}

function CatalogForm({
  categories,
  collections,
  kind,
  onCancel,
  onSaved,
  saving,
  setSaving,
}: {
  categories: CategoryContract[];
  collections: CollectionContract[];
  kind: CatalogKind;
  onCancel: () => void;
  onSaved: (record: CatalogRecord) => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
}) {
  const [formError, setFormError] = useState("");

  async function submit(formData: FormData) {
    setFormError("");
    const name = stringValue(formData, "name");
    if (name.length < 2) {
      setFormError("Name must contain at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      if (kind === "categories") {
        const result = await client.createCategory({
          description: optionalValue(formData, "description"),
          name,
          slug: slugify(name),
          sortOrder: 0,
        });
        onSaved(result.data);
      } else if (kind === "collections") {
        const result = await client.createCollection({
          description: optionalValue(formData, "description"),
          name,
          slug: slugify(name),
        });
        onSaved(result.data);
      } else {
        await submitProduct(formData, name, onSaved, setFormError);
      }
    } catch (caught) {
      setFormError(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section catalog-form-section">
      <div className="admin-section__heading">
        <div>
          <h2>Create {singularFor(kind)}</h2>
          <p>Backend rules and permissions are applied when this is saved.</p>
        </div>
        <button
          aria-label="Close form"
          className="catalog-icon-button"
          onClick={onCancel}
          title="Close"
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <form action={submit} className="catalog-form">
        <label>
          <span>Name</span>
          <input autoFocus name="name" required />
        </label>
        {kind === "products" ? (
          <ProductFields categories={categories} collections={collections} />
        ) : null}
        <label className="catalog-form__wide">
          <span>Description</span>
          <textarea name="description" rows={3} />
        </label>
        {formError ? (
          <p className="catalog-form__error" role="alert">
            <AlertCircle aria-hidden="true" size={15} />
            {formError}
          </p>
        ) : null}
        <div className="catalog-form__actions">
          <button
            className="catalog-secondary-button"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="catalog-primary-button"
            disabled={saving}
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                aria-hidden="true"
                className="catalog-spin"
                size={16}
              />
            ) : (
              <Check aria-hidden="true" size={16} />
            )}
            Save
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductFields({
  categories,
  collections,
}: {
  categories: CategoryContract[];
  collections: CollectionContract[];
}) {
  return (
    <>
      <label>
        <span>Product code</span>
        <input name="productCode" required />
      </label>
      <label>
        <span>Category</span>
        <select name="categoryId" required>
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Collection</span>
        <select name="collectionId">
          <option value="">No collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </label>
      <div className="catalog-form__divider">
        <strong>Initial variant</strong>
        <span>Optional</span>
      </div>
      <label>
        <span>SKU</span>
        <input name="sku" />
      </label>
      <label>
        <span>Color ID</span>
        <input name="colorId" />
      </label>
      <label>
        <span>Size ID</span>
        <input name="sizeId" />
      </label>
    </>
  );
}

async function submitProduct(
  formData: FormData,
  name: string,
  onSaved: (record: CatalogRecord) => void,
  setFormError: (message: string) => void,
) {
  const categoryId = stringValue(formData, "categoryId");
  const productCode = stringValue(formData, "productCode");
  if (!categoryId || !productCode) {
    setFormError("Category and product code are required.");
    return;
  }
  const variant = {
    colorId: stringValue(formData, "colorId"),
    sizeId: stringValue(formData, "sizeId"),
    sku: stringValue(formData, "sku"),
  };
  if (
    Object.values(variant).some(Boolean) &&
    !Object.values(variant).every(Boolean)
  ) {
    setFormError("SKU, color ID, and size ID are required for a variant.");
    return;
  }
  const result = await client.createProduct({
    categoryId,
    collectionId: optionalValue(formData, "collectionId") ?? undefined,
    description: optionalValue(formData, "description"),
    name,
    productCode,
    slug: slugify(name),
  });
  if (variant.sku && variant.colorId && variant.sizeId) {
    await client.createVariant({ ...variant, productId: result.data.id });
  }
  onSaved(result.data);
}

function CatalogTable({
  canUpdate,
  kind,
  records,
  setRecords,
}: {
  canUpdate: boolean;
  kind: CatalogKind;
  records: CatalogRecord[];
  setRecords: (records: CatalogRecord[]) => void;
}) {
  const categoryMap = useMemo(
    () =>
      new Map(
        kind === "categories"
          ? records.map((record) => [record.id, record.name])
          : [],
      ),
    [kind, records],
  );

  async function toggleCategory(record: CategoryContract) {
    const result = await client.updateCategoryStatus({
      categoryId: record.id,
      status: record.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    setRecords(
      records.map((current) =>
        current.id === result.data.id ? result.data : current,
      ),
    );
  }

  return (
    <div className="catalog-table-wrap">
      <table className="catalog-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>{kind === "products" ? "Product code" : "Slug"}</th>
            {kind === "categories" ? <th>Parent</th> : null}
            <th>Status</th>
            {kind === "categories" && canUpdate ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>
                <strong>{record.name}</strong>
              </td>
              <td>
                {"productCode" in record ? record.productCode : record.slug}
              </td>
              {kind === "categories" ? (
                <td>
                  {"parentId" in record && record.parentId
                    ? (categoryMap.get(record.parentId) ?? "Parent category")
                    : "Top level"}
                </td>
              ) : null}
              <td>
                <span
                  className={`catalog-badge catalog-badge--${record.status.toLowerCase()}`}
                >
                  {record.status}
                </span>
              </td>
              {kind === "categories" && canUpdate ? (
                <td>
                  <button
                    className="catalog-text-button"
                    onClick={() =>
                      void toggleCategory(record as CategoryContract)
                    }
                    type="button"
                  >
                    {record.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogLoading() {
  return (
    <div aria-label="Loading catalog records" className="catalog-list-loading">
      <span />
      <span />
      <span />
    </div>
  );
}

function CatalogError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="catalog-inline-state" role="alert">
      <AlertCircle aria-hidden="true" size={20} />
      <div>
        <h3>Catalog data is unavailable</h3>
        <p>{message}</p>
      </div>
      <button
        className="catalog-secondary-button"
        onClick={onRetry}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}

function CatalogEmpty({
  canCreate,
  kind,
}: {
  canCreate: boolean;
  kind: CatalogKind;
}) {
  return (
    <div className="catalog-inline-state">
      <PackageOpen aria-hidden="true" size={22} />
      <div>
        <h3>No {kind} yet</h3>
        <p>
          {canCreate
            ? `Use Add ${singularFor(kind)} to create the first record.`
            : "Your account has read-only catalog access."}
        </p>
      </div>
    </div>
  );
}

function titleFor(kind: CatalogKind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function singularFor(kind: CatalogKind) {
  return kind === "categories"
    ? "category"
    : kind === "collections"
      ? "collection"
      : "product";
}

function descriptionFor(kind: CatalogKind) {
  if (kind === "categories")
    return "Organize products into a stable hierarchy.";
  if (kind === "collections")
    return "Maintain seasonal and merchandising product groups.";
  return "Create products and their SKU, color, and size variants.";
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalValue(formData: FormData, key: string): string | null {
  return stringValue(formData, key) || null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function messageForError(error: unknown): string {
  if (error instanceof AdminApiError) {
    return `${error.message} Request ${error.requestId}.`;
  }
  return "The catalog service could not complete this request.";
}

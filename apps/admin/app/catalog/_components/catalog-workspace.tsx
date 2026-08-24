"use client";

import type {
  CategoryContract,
  CollectionContract,
  ColorContract,
  ProductContract,
  SizeContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  LoaderCircle,
  PackageOpen,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../_lib/api-client";

type CatalogKind =
  "categories" | "collections" | "colors" | "products" | "sizes";
type CatalogRecord =
  | CategoryContract
  | CollectionContract
  | ColorContract
  | ProductContract
  | SizeContract;

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
  const [colors, setColors] = useState<ColorContract[]>([]);
  const [sizes, setSizes] = useState<SizeContract[]>([]);
  const [products, setProducts] = useState<ProductContract[]>([]);
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
      const result = await listRecords(kind);
      setRecords(result.data);
      if (kind === "products") {
        const [categoryResult, collectionResult, colorResult, sizeResult] =
          await Promise.all([
            client.listCategories(),
            client.listCollections(),
            client.listColors(),
            client.listSizes(),
          ]);
        setCategories(categoryResult.data);
        setCollections(collectionResult.data);
        setColors(
          colorResult.data.filter((color) => color.status === "ACTIVE"),
        );
        setSizes(sizeResult.data.filter((size) => size.status === "ACTIVE"));
      } else if (kind === "collections") {
        const productResult = await client.listProducts();
        setProducts(productResult.data);
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
          colors={colors}
          kind={kind}
          onCancel={() => setFormOpen(false)}
          onSaved={(record) => {
            setRecords((current) => [record, ...current]);
            setFormOpen(false);
          }}
          saving={saving}
          setSaving={setSaving}
          sizes={sizes}
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
      {kind === "collections" && records.length > 0 ? (
        <CollectionOrderManager
          canUpdate={canUpdate}
          collections={records as CollectionContract[]}
          products={products}
        />
      ) : null}
    </>
  );
}

function CollectionOrderManager({
  canUpdate,
  collections,
  products,
}: {
  canUpdate: boolean;
  collections: CollectionContract[];
  products: ProductContract[];
}) {
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [order, setOrder] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!collectionId) return;
    let active = true;
    void client
      .listCollectionProducts(collectionId)
      .then((result) => {
        if (active) setOrder(result.data);
      })
      .catch((caught) => {
        if (active) setMessage(messageForError(caught));
      });
    return () => {
      active = false;
    };
  }, [collectionId]);

  async function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    const next = [...order];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setSaving(true);
    setMessage("");
    try {
      await client.reorderCollectionProducts(collectionId, next);
      setOrder(next);
      setMessage("Collection order saved.");
    } catch (caught) {
      setMessage(messageForError(caught));
    } finally {
      setSaving(false);
    }
  }

  const productNames = new Map(
    products.map((product) => [product.id, product.name]),
  );
  return (
    <section className="admin-section admin-section--compact">
      <div className="admin-section__heading">
        <div>
          <h2>Storefront order</h2>
          <p>Choose which products customers see first in this collection.</p>
        </div>
        <select
          aria-label="Collection"
          onChange={(event) => setCollectionId(event.target.value)}
          value={collectionId}
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </div>
      {order.length === 0 ? (
        <p>No products are assigned to this collection.</p>
      ) : (
        <ol className="collection-order-list">
          {order.map((productId, index) => (
            <li key={productId}>
              <span>{productNames.get(productId) ?? "Catalog product"}</span>
              {canUpdate ? (
                <span>
                  <button
                    aria-label="Move product up"
                    disabled={saving || index === 0}
                    onClick={() => void move(index, -1)}
                    title="Move up"
                    type="button"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label="Move product down"
                    disabled={saving || index === order.length - 1}
                    onClick={() => void move(index, 1)}
                    title="Move down"
                    type="button"
                  >
                    <ArrowDown size={16} />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

function CatalogForm({
  categories,
  collections,
  colors,
  kind,
  onCancel,
  onSaved,
  saving,
  setSaving,
  sizes,
}: {
  categories: CategoryContract[];
  collections: CollectionContract[];
  colors: ColorContract[];
  kind: CatalogKind;
  onCancel: () => void;
  onSaved: (record: CatalogRecord) => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  sizes: SizeContract[];
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
      } else if (kind === "colors") {
        const result = await client.createColor({
          code: stringValue(formData, "code"),
          hexValue: stringValue(formData, "hexValue"),
          name,
        });
        onSaved(result.data);
      } else if (kind === "sizes") {
        const result = await client.createSize({
          code: stringValue(formData, "code"),
          name,
          sortOrder: Number(stringValue(formData, "sortOrder")),
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
          <ProductFields
            categories={categories}
            collections={collections}
            colors={colors}
            sizes={sizes}
          />
        ) : null}
        {kind === "colors" ? <ColorFields /> : null}
        {kind === "sizes" ? <SizeFields /> : null}
        {kind === "categories" ||
        kind === "collections" ||
        kind === "products" ? (
          <label className="catalog-form__wide">
            <span>Description</span>
            <textarea name="description" rows={3} />
          </label>
        ) : null}
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
  colors,
  sizes,
}: {
  categories: CategoryContract[];
  collections: CollectionContract[];
  colors: ColorContract[];
  sizes: SizeContract[];
}) {
  return (
    <>
      <label>
        <span>Product code</span>
        <input name="productCode" required />
      </label>
      <label>
        <span>Brand</span>
        <input name="brand" />
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
        <span>Color</span>
        <select name="colorId">
          <option value="">Select color</option>
          {colors.map((color) => (
            <option key={color.id} value={color.id}>
              {color.name} ({color.code})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Size</span>
        <select name="sizeId">
          <option value="">Select size</option>
          {sizes.map((size) => (
            <option key={size.id} value={size.id}>
              {size.name} ({size.code})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Cost price (BDT)</span>
        <input min="0" name="costPrice" step="0.01" type="number" />
      </label>
      <label>
        <span>Selling price (BDT)</span>
        <input min="0" name="sellingPrice" step="0.01" type="number" />
      </label>
    </>
  );
}

function ColorFields() {
  const [hexValue, setHexValue] = useState("#111111");

  return (
    <>
      <label>
        <span>Code</span>
        <input autoCapitalize="characters" name="code" required />
      </label>
      <label>
        <span>Hex value</span>
        <span className="catalog-color-input">
          <input
            aria-label="Choose color"
            onChange={(event) => setHexValue(event.target.value.toUpperCase())}
            name="colorPreview"
            type="color"
            value={hexValue}
          />
          <input
            onChange={(event) => setHexValue(event.target.value.toUpperCase())}
            name="hexValue"
            pattern="^#[0-9A-Fa-f]{6}$"
            placeholder="#111111"
            required
            value={hexValue}
          />
        </span>
      </label>
    </>
  );
}

function SizeFields() {
  return (
    <>
      <label>
        <span>Code</span>
        <input autoCapitalize="characters" name="code" required />
      </label>
      <label>
        <span>Sort order</span>
        <input
          defaultValue="0"
          min="0"
          name="sortOrder"
          required
          type="number"
        />
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
    costPriceMinor: moneyValue(formData, "costPrice"),
    sellingPriceMinor: moneyValue(formData, "sellingPrice"),
    sizeId: stringValue(formData, "sizeId"),
    sku: stringValue(formData, "sku"),
  };
  if (
    [variant.sku, variant.colorId, variant.sizeId].some(Boolean) &&
    ![variant.sku, variant.colorId, variant.sizeId].every(Boolean)
  ) {
    setFormError("SKU, color, and size are required for a variant.");
    return;
  }
  const result = await client.createProduct({
    brand: optionalValue(formData, "brand"),
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

function moneyValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key);
  if (!raw) return 0;
  return Math.round(Number(raw) * 100);
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
  const [updateError, setUpdateError] = useState("");
  const categoryMap = useMemo(
    () =>
      new Map(
        kind === "categories"
          ? records.map((record) => [record.id, record.name])
          : [],
      ),
    [kind, records],
  );

  async function toggleStatus(record: CatalogRecord) {
    setUpdateError("");
    try {
      const status = record.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const result =
        kind === "categories"
          ? await client.updateCategoryStatus({
              categoryId: record.id,
              status,
            })
          : kind === "colors"
            ? await client.updateColorStatus({ colorId: record.id, status })
            : await client.updateSizeStatus({ sizeId: record.id, status });
      setRecords(
        records.map((current) =>
          current.id === result.data.id ? result.data : current,
        ),
      );
    } catch (caught) {
      setUpdateError(messageForError(caught));
    }
  }

  return (
    <>
      {updateError ? (
        <p className="catalog-update-error" role="alert">
          <AlertCircle aria-hidden="true" size={15} />
          {updateError}
        </p>
      ) : null}
      <div className="catalog-table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>{secondaryHeading(kind)}</th>
              {kind === "categories" ? <th>Parent</th> : null}
              {kind === "colors" ? <th>Color</th> : null}
              {kind === "sizes" ? <th>Sort order</th> : null}
              <th>Status</th>
              {supportsStatusUpdate(kind) && canUpdate ? <th>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  {kind === "products" ? (
                    <Link href={`/catalog/products/${record.id}`}>
                      <strong>{record.name}</strong>
                    </Link>
                  ) : (
                    <strong>{record.name}</strong>
                  )}
                </td>
                <td>{secondaryValue(record)}</td>
                {kind === "categories" ? (
                  <td>
                    {"parentId" in record && record.parentId
                      ? (categoryMap.get(record.parentId) ?? "Parent category")
                      : "Top level"}
                  </td>
                ) : null}
                {kind === "colors" ? (
                  <td>
                    {"hexValue" in record ? (
                      <span className="catalog-color-value">
                        <span
                          aria-hidden="true"
                          className="catalog-color-swatch"
                          style={{
                            backgroundColor: record.hexValue ?? "transparent",
                          }}
                        />
                        {record.hexValue ?? "No value"}
                      </span>
                    ) : null}
                  </td>
                ) : null}
                {kind === "sizes" ? (
                  <td>{"sortOrder" in record ? record.sortOrder : null}</td>
                ) : null}
                <td>
                  <span
                    className={`catalog-badge catalog-badge--${record.status.toLowerCase()}`}
                  >
                    {record.status}
                  </span>
                </td>
                {supportsStatusUpdate(kind) && canUpdate ? (
                  <td>
                    <button
                      className="catalog-text-button"
                      onClick={() => void toggleStatus(record)}
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
    </>
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
  const singulars: Record<CatalogKind, string> = {
    categories: "category",
    collections: "collection",
    colors: "color",
    products: "product",
    sizes: "size",
  };
  return singulars[kind];
}

function descriptionFor(kind: CatalogKind) {
  if (kind === "categories")
    return "Organize products into a stable hierarchy.";
  if (kind === "collections")
    return "Maintain seasonal and merchandising product groups.";
  if (kind === "colors")
    return "Maintain organization-owned color references for product variants.";
  if (kind === "sizes")
    return "Maintain ordered size references for product variants.";
  return "Create products and their SKU, color, and size variants.";
}

function listRecords(kind: CatalogKind) {
  if (kind === "categories") return client.listCategories();
  if (kind === "collections") return client.listCollections();
  if (kind === "colors") return client.listColors();
  if (kind === "sizes") return client.listSizes();
  return client.listProducts();
}

function supportsStatusUpdate(kind: CatalogKind) {
  return kind === "categories" || kind === "colors" || kind === "sizes";
}

function secondaryHeading(kind: CatalogKind) {
  if (kind === "products") return "Product code";
  if (kind === "colors" || kind === "sizes") return "Code";
  return "Slug";
}

function secondaryValue(record: CatalogRecord) {
  if ("productCode" in record) return record.productCode;
  if ("slug" in record) return record.slug;
  return record.code;
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

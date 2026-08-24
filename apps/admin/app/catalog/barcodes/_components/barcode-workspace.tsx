"use client";

import type {
  BarcodeLookupContract,
  BarcodeType,
  ProductVariantContract,
  VariantBarcodeContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Printer,
  ScanBarcode,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

type VariantChoice = ProductVariantContract & {
  productCode: string;
  productName: string;
};

export function BarcodeWorkspace({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const canCreate = permissions.includes("CATALOG:CREATE");
  const canUpdate = permissions.includes("CATALOG:UPDATE");
  const [variants, setVariants] = useState<VariantChoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [barcodes, setBarcodes] = useState<VariantBarcodeContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBarcodes = useCallback(async (variantId: string) => {
    if (!variantId) {
      setBarcodes([]);
      return;
    }
    setBarcodes((await client.listVariantBarcodes(variantId)).data);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const products = (await client.listProducts()).data;
        const choices = (
          await Promise.all(
            products.map(async (product) =>
              (await client.listVariants(product.id)).data.map((variant) => ({
                ...variant,
                productCode: product.productCode,
                productName: product.name,
              })),
            ),
          )
        ).flat();
        if (!active) return;
        setVariants(choices);
        const firstId = choices[0]?.id ?? "";
        setSelectedId(firstId);
        await loadBarcodes(firstId);
      } catch (caught) {
        if (active) setError(messageFor(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [loadBarcodes]);

  if (!permissions.includes("CATALOG:READ")) {
    return <BarcodeState title="Catalog access is restricted" />;
  }
  const selected = variants.find((variant) => variant.id === selectedId);
  return (
    <main className="barcode-page">
      <header className="barcode-header">
        <div>
          <p className="page-eyebrow">Catalog</p>
          <h1>Barcodes</h1>
          <p>Manage the scan code used for each sellable product option.</p>
        </div>
      </header>
      {error ? <BarcodeFeedback error message={error} /> : null}
      {success ? <BarcodeFeedback message={success} /> : null}
      {loading ? <BarcodeState loading title="Loading product codes" /> : null}
      {!loading && variants.length === 0 ? (
        <BarcodeState title="No product options available" />
      ) : null}
      {!loading && variants.length > 0 ? (
        <>
          <section className="barcode-panel">
            <label className="barcode-select-label">
              Find product option
              <select
                onChange={(event) => {
                  const id = event.target.value;
                  setSelectedId(id);
                  setError("");
                  void loadBarcodes(id).catch((caught: unknown) =>
                    setError(messageFor(caught)),
                  );
                }}
                value={selectedId}
              >
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.productName} | {variant.sku}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <div className="barcode-variant-summary">
                <strong>{selected.productName}</strong>
                <span>Product Code: {selected.productCode}</span>
                <span>SKU: {selected.sku}</span>
              </div>
            ) : null}
          </section>
          {canCreate && !barcodes.some((item) => item.status === "ACTIVE") ? (
            <CreateBarcodeForm
              onCreated={async (barcode) => {
                setSuccess(`Barcode ${barcode.value} was created.`);
                await loadBarcodes(selectedId);
              }}
              onError={setError}
              variantId={selectedId}
            />
          ) : null}
          <BarcodeList
            barcodes={barcodes}
            canUpdate={canUpdate}
            onStatus={async (barcode) => {
              const status =
                barcode.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
              try {
                await client.updateBarcodeStatus({
                  barcodeId: barcode.id,
                  status,
                });
                setSuccess(
                  `${barcode.value} is now ${status === "ACTIVE" ? "active" : "inactive"}.`,
                );
                await loadBarcodes(selectedId);
              } catch (caught) {
                setError(messageFor(caught));
              }
            }}
          />
          {selected && barcodes.some((item) => item.status === "ACTIVE") ? (
            <section className="barcode-panel">
              <div className="barcode-print-label">
                <strong>{selected.productName}</strong>
                <span>{selected.sku}</span>
                <b className="barcode-code">
                  {barcodes.find((item) => item.status === "ACTIVE")?.value}
                </b>
                <span>BDT {(selected.sellingPriceMinor / 100).toFixed(2)}</span>
              </div>
              <button
                className="catalog-primary-button"
                onClick={() => window.print()}
                type="button"
              >
                <Printer size={16} />
                Print label
              </button>
            </section>
          ) : null}
          <LookupTest onError={setError} />
        </>
      ) : null}
    </main>
  );
}

function CreateBarcodeForm({
  onCreated,
  onError,
  variantId,
}: {
  onCreated: (barcode: VariantBarcodeContract) => Promise<void>;
  onError: (message: string) => void;
  variantId: string;
}) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    const data = new FormData(form);
    try {
      const result = await client.createVariantBarcode({
        type: value(data, "type") as BarcodeType,
        value: value(data, "value"),
        variantId,
      });
      await onCreated(result.data);
      form.reset();
    } catch (caught) {
      onError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="barcode-panel barcode-form"
      onSubmit={(event) => void submit(event)}
    >
      <div>
        <h2>Add barcode</h2>
        <p>Enter the code printed on this product option.</p>
      </div>
      <label>
        Code format
        <select defaultValue="INTERNAL" name="type">
          <option value="INTERNAL">Internal</option>
          <option value="EAN13">EAN-13</option>
          <option value="UPC">UPC</option>
          <option value="CODE128">Code 128</option>
        </select>
      </label>
      <label>
        Scan Code
        <input name="value" placeholder="SW-SHIRT-BLK-L" required />
      </label>
      <button
        className="catalog-primary-button"
        disabled={saving}
        type="submit"
      >
        {saving ? (
          <LoaderCircle className="barcode-spin" size={16} />
        ) : (
          <Plus size={16} />
        )}
        Add barcode
      </button>
    </form>
  );
}

function BarcodeList({
  barcodes,
  canUpdate,
  onStatus,
}: {
  barcodes: VariantBarcodeContract[];
  canUpdate: boolean;
  onStatus: (barcode: VariantBarcodeContract) => Promise<void>;
}) {
  if (barcodes.length === 0)
    return <BarcodeState title="No barcode assigned" />;
  return (
    <section className="barcode-table-wrap">
      <table className="barcode-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Format</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {barcodes.map((barcode) => (
            <tr key={barcode.id}>
              <td data-label="Barcode" className="barcode-code">
                {barcode.value}
              </td>
              <td data-label="Format">{formatName(barcode.type)}</td>
              <td data-label="Status">
                <span
                  className={`barcode-status barcode-status--${barcode.status.toLowerCase()}`}
                >
                  {barcode.status === "ACTIVE" ? "Ready to scan" : "Inactive"}
                </span>
              </td>
              <td data-label="Action">
                {canUpdate ? (
                  <button
                    className="source-secondary"
                    onClick={() => void onStatus(barcode)}
                    type="button"
                  >
                    {barcode.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LookupTest({ onError }: { onError: (message: string) => void }) {
  const [result, setResult] = useState<BarcodeLookupContract | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scanCode = value(new FormData(event.currentTarget), "scanCode");
    try {
      setResult((await client.lookupBarcode(scanCode)).data);
    } catch (caught) {
      setResult(null);
      onError(messageFor(caught));
    }
  }
  return (
    <section className="barcode-panel">
      <div>
        <h2>Test a Scan Code</h2>
        <p>Check which product option a code will find.</p>
      </div>
      <form className="barcode-lookup" onSubmit={(event) => void submit(event)}>
        <label>
          <span className="sr-only">Scan Code</span>
          <input name="scanCode" placeholder="Enter barcode" required />
        </label>
        <button className="source-secondary" type="submit">
          <Search size={16} />
          Look up
        </button>
      </form>
      {result ? (
        <div className="barcode-result">
          <CheckCircle2 size={18} />
          <div>
            <strong>{result.productName}</strong>
            <span>
              {result.sku} | {result.color} | {result.size}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BarcodeState({
  loading,
  title,
}: {
  loading?: boolean;
  title: string;
}) {
  return (
    <section className="barcode-state">
      {loading ? (
        <LoaderCircle className="barcode-spin" size={22} />
      ) : (
        <ScanBarcode size={24} />
      )}
      <strong>{title}</strong>
    </section>
  );
}
function BarcodeFeedback({
  error,
  message,
}: {
  error?: boolean;
  message: string;
}) {
  return (
    <p className={`barcode-feedback ${error ? "barcode-feedback--error" : ""}`}>
      {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      {message}
    </p>
  );
}
function messageFor(error: unknown) {
  return error instanceof AdminApiError
    ? `${error.message} Request ID: ${error.requestId}`
    : "Something went wrong. Please try again.";
}
function value(data: FormData, field: string) {
  const item = data.get(field);
  return typeof item === "string" ? item : "";
}
function formatName(type: BarcodeType) {
  return type === "EAN13"
    ? "EAN-13"
    : type === "CODE128"
      ? "Code 128"
      : type === "UPC"
        ? "UPC"
        : "Internal";
}

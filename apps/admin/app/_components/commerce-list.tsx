"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CustomerSummaryContract,
  ProductContract,
  ProductVariantContract,
  PurchaseOrderSummaryContract,
  StockLocationReadContract,
  VendorSummaryContract,
} from "@senvo/contracts";
import { AdminApiClient, AdminApiError } from "../_lib/api-client";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL,
});
const bdt = (minor: number) =>
  new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    style: "currency",
  }).format(minor / 100);

export function CommerceList({
  mode,
}: {
  mode: "customers" | "purchases" | "vendors";
}) {
  const [items, setItems] = useState<
    | CustomerSummaryContract[]
    | PurchaseOrderSummaryContract[]
    | VendorSummaryContract[]
  >([]);
  const [vendors, setVendors] = useState<VendorSummaryContract[]>([]);
  const [locations, setLocations] = useState<StockLocationReadContract[]>([]);
  const [variants, setVariants] = useState<
    Array<ProductVariantContract & { productName: string }>
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "customers") setItems((await client.listCustomers()).data);
      if (mode === "vendors") setItems((await client.listVendors()).data);
      if (mode === "purchases") {
        const [purchaseResult, vendorResult, productResult, locationResult] =
          await Promise.all([
            client.listPurchases(),
            client.listVendors(),
            client.listProducts(),
            client.listStockLocations({ pageSize: 100 }),
          ]);
        setItems(purchaseResult.data);
        setVendors(vendorResult.data);
        setLocations(locationResult.data.items);
        const productVariants = await Promise.all(
          productResult.data.map(async (product: ProductContract) =>
            (await client.listVariants(product.id)).data.map((variant) => ({
              ...variant,
              productName: product.name,
            })),
          ),
        );
        setVariants(productVariants.flat());
      }
    } catch (reason) {
      setError(apiMessage(reason));
    } finally {
      setBusy(false);
    }
  }, [mode]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      if (mode === "customers")
        await client.createCustomer({
          address: value(data, "address") || null,
          email: value(data, "email") || null,
          name: value(data, "name"),
          phone: value(data, "phone"),
        });
      if (mode === "vendors")
        await client.createVendor({
          address: value(data, "address") || null,
          location: value(data, "location") || null,
          name: value(data, "name"),
          phone: value(data, "phone") || null,
        });
      if (mode === "purchases") {
        const paidMinor = toMinor(value(data, "paidAmount"));
        await client.receivePurchase({
          destinationLocationId: value(data, "destinationLocationId"),
          idempotencyKey: crypto.randomUUID(),
          lines: [
            {
              productVariantId: value(data, "productVariantId"),
              quantity: Number(value(data, "quantity")),
              unitCostMinor: toMinor(value(data, "unitCost")),
            },
          ],
          note: value(data, "note") || null,
          paidMinor,
          paymentMethod:
            paidMinor > 0
              ? (value(data, "paymentMethod") as
                  "BANK_TRANSFER" | "CARD" | "CASH" | "MOBILE_BANKING")
              : null,
          paymentReference: value(data, "paymentReference") || null,
          vendorId: value(data, "vendorId"),
        });
      }
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(apiMessage(reason));
      setBusy(false);
    }
  }

  async function payVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await client.recordVendorPayment({
        amountMinor: toMinor(value(data, "amount")),
        idempotencyKey: crypto.randomUUID(),
        method: value(data, "method") as
          "BANK_TRANSFER" | "CARD" | "CASH" | "MOBILE_BANKING",
        purchaseOrderId: null,
        reference: value(data, "reference") || null,
        vendorId: value(data, "vendorId"),
      });
      event.currentTarget.reset();
      await load();
    } catch (reason) {
      setError(apiMessage(reason));
      setBusy(false);
    }
  }

  const title =
    mode === "customers"
      ? "Customers"
      : mode === "vendors"
        ? "Vendors"
        : "Purchases";
  return (
    <main>
      <header className="admin-page-header">
        <div className="admin-page-header__copy">
          <p className="admin-kicker">Daily operations</p>
          <h1>{title}</h1>
          <p>
            {mode === "customers"
              ? "Customer contacts, purchase totals, and due balances."
              : mode === "vendors"
                ? "Supplier contacts, purchases, and payable balances."
                : "Received purchase history linked to inventory movements."}
          </p>
        </div>
      </header>
      {error ? <p className="pos-form-error">{error}</p> : null}
      {mode !== "purchases" ? (
        <section className="admin-section">
          <form
            className="catalog-form"
            onSubmit={(event) => void create(event)}
          >
            <h2>Add {mode === "customers" ? "customer" : "vendor"}</h2>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Phone
              <input name="phone" required={mode === "customers"} />
            </label>
            {mode === "customers" ? (
              <label>
                Email
                <input name="email" type="email" />
              </label>
            ) : (
              <label>
                Location
                <input name="location" />
              </label>
            )}
            <label>
              Address
              <input name="address" />
            </label>
            <button className="catalog-primary-button" disabled={busy}>
              Save
            </button>
          </form>
          {mode === "vendors" && items.length > 0 ? (
            <form
              className="catalog-form"
              onSubmit={(event) => void payVendor(event)}
            >
              <h2>Record vendor payment</h2>
              <label>
                Vendor
                <select name="vendorId" required>
                  <option value="">Select vendor</option>
                  {(items as VendorSummaryContract[])
                    .filter((item) => item.status === "ACTIVE")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} - due {bdt(item.dueMinor)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Amount (BDT)
                <input
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Method
                <select name="method">
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_BANKING">Mobile banking</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CARD">Card</option>
                </select>
              </label>
              <label>
                Reference
                <input name="reference" />
              </label>
              <button className="catalog-primary-button" disabled={busy}>
                Record payment
              </button>
            </form>
          ) : null}
        </section>
      ) : (
        <section className="admin-section">
          <form
            className="catalog-form"
            onSubmit={(event) => void create(event)}
          >
            <h2>Receive a purchase</h2>
            <label>
              Vendor
              <select name="vendorId" required>
                <option value="">Select vendor</option>
                {vendors
                  .filter((item) => item.status === "ACTIVE")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Stock location
              <select name="destinationLocationId" required>
                <option value="">Select location</option>
                {locations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product option
              <select name="productVariantId" required>
                <option value="">Select product option</option>
                {variants
                  .filter((item) => item.status === "ACTIVE")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.productName} - {item.sku}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity
              <input min="1" name="quantity" required type="number" />
            </label>
            <label>
              Unit cost (BDT)
              <input
                min="0"
                name="unitCost"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label>
              Paid now (BDT)
              <input
                defaultValue="0"
                min="0"
                name="paidAmount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label>
              Payment method
              <select name="paymentMethod">
                <option value="CASH">Cash</option>
                <option value="MOBILE_BANKING">Mobile banking</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label>
              Payment reference
              <input name="paymentReference" />
            </label>
            <label className="catalog-form__wide">
              Note
              <textarea name="note" rows={2} />
            </label>
            <button className="catalog-primary-button" disabled={busy}>
              Receive stock
            </button>
          </form>
        </section>
      )}
      <section className="admin-section">
        {busy ? <p>Loading...</p> : <CommerceTable items={items} mode={mode} />}
      </section>
    </main>
  );
}

function CommerceTable({
  items,
  mode,
}: {
  items:
    | CustomerSummaryContract[]
    | PurchaseOrderSummaryContract[]
    | VendorSummaryContract[];
  mode: "customers" | "purchases" | "vendors";
}) {
  if (!items.length) return <p>No records yet.</p>;
  return (
    <table className="inventory-table">
      <thead>
        <tr>
          <th>Name / reference</th>
          <th>Contact / vendor</th>
          <th>Total</th>
          <th>Due</th>
        </tr>
      </thead>
      <tbody>
        {mode === "customers" &&
          (items as CustomerSummaryContract[]).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.phone}</td>
              <td>{bdt(item.totalPurchaseMinor)}</td>
              <td>{bdt(item.dueMinor)}</td>
            </tr>
          ))}
        {mode === "vendors" &&
          (items as VendorSummaryContract[]).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.phone ?? "-"}</td>
              <td>{bdt(item.purchaseMinor)}</td>
              <td>{bdt(item.dueMinor)}</td>
            </tr>
          ))}
        {mode === "purchases" &&
          (items as PurchaseOrderSummaryContract[]).map((item) => (
            <tr key={item.id}>
              <td>{item.purchaseNumber}</td>
              <td>{item.vendorName}</td>
              <td>{bdt(item.totalMinor)}</td>
              <td>{bdt(item.dueMinor)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function value(data: FormData, key: string) {
  const entry = data.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}
function toMinor(value: string) {
  return Math.round(Number(value || "0") * 100);
}
function apiMessage(reason: unknown) {
  return reason instanceof AdminApiError
    ? reason.message + " Reference: " + reason.requestId
    : "The operation could not be completed.";
}

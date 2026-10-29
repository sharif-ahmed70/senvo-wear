"use client";

import { ArrowLeft, ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  clearPageDraft,
  currentPageKey,
  useRestoredDraftPage,
} from "../_lib/page-draft";

type Route = {
  label: string;
  /** Where the page sits when that is not simply the shorter path. */
  parent?: string;
};

// Every admin page; "[id]" matches one path part.
const routes: Record<string, Route> = {
  "/": { label: "Dashboard" },
  "/catalog": { label: "Catalog" },
  "/catalog/barcodes": { label: "Barcodes" },
  "/catalog/barcodes/generate": { label: "Barcode তৈরি" },
  "/catalog/categories": { label: "Categories" },
  "/catalog/collections": { label: "Collections" },
  "/catalog/colors": { label: "Colors" },
  "/catalog/sizes": { label: "Sizes" },
  "/catalog/products": { label: "Products" },
  "/catalog/products/new": { label: "নতুন Product" },
  "/catalog/products/[id]": { label: "Product" },
  "/inventory": { label: "Inventory" },
  "/inventory/adjustment": { label: "Stock Adjustment" },
  "/inventory/intake": { label: "মাল তোলা" },
  "/inventory/intake/edit": { label: "Product Edit", parent: "/inventory" },
  "/inventory/locations": { label: "Locations" },
  "/inventory/movements": { label: "Movements" },
  "/inventory/movements/[id]": { label: "Movement" },
  "/inventory/receive": { label: "Receive Stock" },
  "/inventory/transfer": { label: "Transfer Stock" },
  "/organization": { label: "Organization" },
  "/pos/checkouts": { label: "Checkout History" },
  "/pos/checkouts/[id]": { label: "Checkout" },
  "/pos/checkouts/[id]/receipt": { label: "Receipt" },
  "/pos/counters": { label: "Sales Counters" },
  "/pos/payment-collections/[id]/receipt": {
    label: "Payment Receipt",
    parent: "/pos/checkouts",
  },
  "/pos/refunds/[id]/receipt": {
    label: "Refund Receipt",
    parent: "/pos/checkouts",
  },
  "/pos/returns/[id]/receipt": {
    label: "Return Receipt",
    parent: "/pos/checkouts",
  },
  "/pos/sell": { label: "New Sale" },
  "/pos/sessions": { label: "Sales Sessions" },
  "/pos/sessions/[id]/z-report": { label: "Z-Report", parent: "/pos/sessions" },
  "/procurement/payments": { label: "Supplier Payments" },
  "/procurement/payments/new": { label: "নতুন Payment" },
  "/procurement/purchases": { label: "Purchases" },
  "/procurement/purchases/new": { label: "নতুন Purchase" },
  "/procurement/purchases/[id]": { label: "Purchase" },
  "/procurement/purchases/[id]/extra-cost": { label: "অতিরিক্ত খরচ" },
  "/procurement/suppliers": { label: "Suppliers" },
  "/procurement/suppliers/[id]": { label: "Supplier" },
  "/reports/profit": { label: "লাভের হিসাব" },
  "/roles": { label: "Roles" },
  "/sales-orders": { label: "Sales Orders" },
  "/sales/booths": { label: "Booth History" },
  "/sales/channels": { label: "Sales Sources" },
  "/sales/orders": { label: "Sales Orders" },
  "/sales/orders/[id]": { label: "Order" },
  "/sales/orders/[id]/shipping-label": { label: "Shipping Label" },
  "/store-locations": { label: "Store locations" },
  "/team": { label: "Team" },
  "/users": { label: "Users" },
};

function findRoute(path: string): Route | null {
  const parts = path.split("/").filter(Boolean);
  for (const [pattern, route] of Object.entries(routes)) {
    const want = pattern.split("/").filter(Boolean);
    if (
      want.length === parts.length &&
      want.every((part, index) => part === "[id]" || part === parts[index])
    ) {
      return route;
    }
  }
  return null;
}

export type Crumb = { href: string; label: string };

/** Dashboard → … → this page, using only paths that are real pages. */
export function pageCrumbs(pathname: string): Crumb[] {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (path === "/") return [{ href: "/", label: "Dashboard" }];
  const route = findRoute(path);
  if (route?.parent) {
    return [...pageCrumbs(route.parent), { href: path, label: route.label }];
  }
  const parts = path.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/", label: "Dashboard" }];
  for (let end = 1; end <= parts.length; end++) {
    const href = `/${parts.slice(0, end).join("/")}`;
    const found = findRoute(href);
    if (found) crumbs.push({ href, label: found.label });
  }
  if (crumbs.at(-1)?.href !== path) {
    crumbs.push({ href: path, label: route?.label ?? "এই পাতা" });
  }
  return crumbs;
}

// Admin pages visited in this tab, so Back knows if there is one to return to.
const VISITS = "senvo:visits";

function readVisits(): string[] {
  try {
    const raw = window.sessionStorage.getItem(VISITS);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeVisits(visits: string[]) {
  try {
    window.sessionStorage.setItem(VISITS, JSON.stringify(visits.slice(-50)));
  } catch {
    // Without storage Back simply goes one level up.
  }
}

export function PageBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const restoredPage = useRestoredDraftPage();

  useEffect(() => {
    const visits = readVisits();
    if (visits.at(-2) === pathname) visits.pop();
    else if (visits.at(-1) !== pathname) visits.push(pathname);
    writeVisits(visits);
  }, [pathname]);

  if (pathname === "/" || pathname === "/login") return null;

  const crumbs = pageCrumbs(pathname);
  const parent = crumbs.at(-2) ?? crumbs[0];

  function goBack() {
    // The browser's own Back keeps the earlier page as it was; a page
    // opened directly (new tab, bookmark) goes one level up instead.
    if (readVisits().length >= 2) router.back();
    else router.push(parent?.href ?? "/");
  }

  function startOver() {
    clearPageDraft();
    window.location.reload();
  }

  return (
    <nav aria-label="Page navigation" className="admin-page-back">
      <button
        className="admin-page-back__button"
        onClick={goBack}
        title="আগের পাতায় ফিরে যান (Alt + ←)"
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
        Back
      </button>
      <ol className="admin-page-back__crumbs">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href}>
            {index > 0 ? (
              <ChevronRight aria-hidden="true" size={13} strokeWidth={2} />
            ) : null}
            {index === crumbs.length - 1 ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
      {restoredPage && restoredPage === currentPageKey() ? (
        <p className="admin-page-back__draft" role="status">
          আগে লেখা তথ্য ফিরিয়ে আনা হয়েছে।
          <button onClick={startOver} type="button">
            <RotateCcw aria-hidden="true" size={13} strokeWidth={2} />
            মুছে নতুন করে শুরু
          </button>
        </p>
      ) : null}
    </nav>
  );
}

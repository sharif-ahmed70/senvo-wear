# SENVO Admin Dashboard — Approved Frontend Handoff

Status: **USER APPROVED**

Branch: `design/admin-ux-system`

## Intent

This branch contains the approved premium SENVO Admin dashboard presentation. It is a frontend handoff for later integration with the real workforce-authenticated, organization-scoped backend.

The dashboard is intentionally designed as an operational decision screen rather than a generic analytics template.

## Approved visual language

- near-black / charcoal navigation shell;
- warm ivory operational canvas;
- deep SENVO burgundy for the strongest actions and brand emphasis;
- restrained green for positive/available state;
- warm neutral/gold details only as subtle premium accents;
- editorial serif for confident headings and commercial numbers;
- compact sans-serif operational copy;
- thin borders, restrained shadows, natural spacing;
- no neon gradient / generic AI-dashboard visual treatment;
- responsive tablet/mobile fallbacks.

## Implemented design files

- `apps/admin/app/_components/dashboard.tsx`
- `apps/admin/app/_components/dashboard.module.css`
- `apps/admin/app/_components/admin-shell.module.css`
- `apps/admin/app/_components/admin-app-frame.tsx`
- `apps/admin/app/_lib/dashboard-preview-data.ts`
- `apps/admin/app/page.tsx`

## Critical integration rule

`dashboard-preview-data.ts` is **DESIGN HANDOFF DATA ONLY**.

It MUST NOT become production business truth.

Before merge into the implementation branch, replace the preview model with real organization-scoped read data through the established SENVO boundaries:

`Admin -> AdminApiClient -> HTTP -> API -> application/read model -> repository -> PostgreSQL`

Do not import Prisma or repositories into the browser application.

## Dashboard data binding targets

Bind only to real supported/derived data:

- today's/selected-period sales;
- order count and actionable fulfilment state;
- items sold if safely derivable;
- average order value if safely derivable;
- open POS sessions;
- low ATS / inventory attention;
- sales trend by period;
- ONLINE / OFFLINE_STORE / EVENT_BOOTH channel performance;
- recent orders;
- top-selling products only if a real aggregation is available or a narrow read model is added;
- inventory snapshot from authoritative ledger/reservation-derived facts.

If any approved dashboard card lacks a correct backend source, do one of these:

1. add the smallest correct organization-scoped read model/API; or
2. hide/defer that card until real data exists.

Never keep the preview values to make the page look complete.

## Authentication merge rule

The design branch deliberately does not replace the workforce authentication architecture. When integrating after workforce HTTP/session work:

- preserve real workforce session validation;
- preserve active User + Membership enforcement;
- preserve server-derived organization/role/permissions;
- preserve customer/workforce cookie separation;
- preserve logout/session revocation;
- remove any remaining production preview OWNER fallback;
- adapt the approved shell styling around the real session data instead of restoring `adminFoundationSession`.

## Operational links

The approved shell provides fast access to:

- New sale -> `/pos/sell`
- Inventory / receiving entry -> `/inventory`

When a dedicated supported receive-stock route/action exists, bind the approved `Receive stock` affordance to that real workflow.

## Quality requirements before merge

- Admin targeted tests green;
- Admin typecheck green;
- Admin lint green;
- Admin build green;
- keyboard focus preserved;
- table overflow safe on small screens;
- no fake notifications/metrics/activity;
- no secrets or raw session tokens;
- `git diff --check` clean.

## Next approved-design sequence

After Dashboard:

1. Catalog / product list
2. Add/Edit Product
3. Product details / variants / media
4. Barcode management + generate/print flow
5. Inventory overview + receive/transfer/adjust flows
6. Sales Orders + order detail
7. POS / New Sale + payment + receipt
8. Checkout History / Sessions / Counters
9. Sales Sources / Booth History
10. Organization / Store Locations
11. Team / Roles
12. Admin Login after workforce auth integration is stable

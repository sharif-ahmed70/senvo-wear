# System Overview

SENVO Wear is implemented as a modular monolith in a pnpm/Turborepo monorepo. The repository separates customer Storefront, Admin operations, and showroom POS application boundaries while keeping shared domain, application, API, HTTP, contracts, UI, database, logging, storage, testing, and utility packages together.

Current capabilities include organization and team management, credential and authorization foundations, catalog and barcodes, inventory and reservations, sales orders, Admin-based POS checkout, payments and receipts, returns and refunds, and a guest cash-on-delivery Storefront flow. Production login/session transport, product media, online payments, courier integration, CRM, finance, and analytics remain future work.

The runtime target is Node.js 22 LTS. CI pins a specific Node 22 patch while developer engines allow `>=22.13` so newer local runtimes are not blocked when tool compatibility permits them.

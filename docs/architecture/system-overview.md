# System Overview

SENVO Wear is planned as a modular monolith in a pnpm/Turborepo monorepo. The foundation separates customer storefront, admin operations, and showroom POS applications while keeping shared domain, contracts, UI, database, logging, storage, testing, and utility packages in one repository.

Current status: technical bootstrap only. No commerce, inventory, order, payment, authentication, CRM, finance, or analytics behavior exists yet.

The runtime target is Node.js 22 LTS. CI pins a specific Node 22 patch while developer engines allow `>=22.13` so newer local runtimes are not blocked when tool compatibility permits them.

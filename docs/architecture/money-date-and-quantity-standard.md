# Money, Date, And Quantity Standard

Money must not use JavaScript floating-point arithmetic for financial calculation.

API contracts transport money as integer minor units plus currency code. Initial business currency is BDT. Future multi-currency support is a design allowance, not an implemented capability.

Persistence should use integer minor units for transactional amounts unless a reviewed database decision selects PostgreSQL `numeric` for a specific financial need.

Timestamps are persisted in UTC. Business and reporting timezone is `Asia/Dhaka`. APIs use ISO 8601 strings. Calendar-only dates must be modeled separately from instants so they do not shift through timezone conversion.

Retail clothing stock quantities are integer values and must not silently become negative. Decimal quantities may be required later for fabric or raw materials, but they are not implemented in this foundation.

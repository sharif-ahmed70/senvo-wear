# Operational V1 Acceptance

The release gate exercises these server-owned workflows with fake organization
data:

1. Catalog tests create/update product, variant, barcode, and product media.
2. Inventory tests post receipt/adjustment/transfer movements and query ATS.
3. POS tests resolve barcode/SKU and complete an authorized cash checkout.
4. Payment tests complete supported mixed/partial offline settlement.
5. Receipt tests persist and read immutable receipt projections.
6. Collection tests settle an outstanding balance with idempotency.
7. Return/refund tests preserve stock, credit, payment, and receipt history.
8. Reporting tests aggregate receipt/payment/return and ledger truth.
9. Session/authorization tests reject inactive or unauthorized staff.
10. Storefront tests expose published media and safe availability.

The full database gate deploys migrations, runs integration tests, resets and
reapplies migrations, reruns integration tests, and requires Prisma drift output
`No difference detected.`.

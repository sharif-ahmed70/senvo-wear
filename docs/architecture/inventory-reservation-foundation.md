# Inventory Reservation Foundation

Inventory reservations hold available stock for a future workflow without changing the immutable inventory movement ledger. A reservation is created directly as `ACTIVE`; there is no draft reservation state.

`ACTIVE` reservations count toward reserved quantity. `CONFIRMED`, `RELEASED`, and `EXPIRED` reservations are terminal and no longer reduce available-to-sell. Confirmation means a future workflow consumed the hold; it does not create an `ISSUE` movement or reduce on-hand by itself.

Creation validates an active organization, an active sellable stock location, and active product variants in the same organization. Reservation lines are immutable after creation.

Reserved and available-to-sell are derived read models:

```text
reserved = sum(ACTIVE reservation lines)
availableToSell = posted onHand - reserved
```

No stored ATS table is introduced.

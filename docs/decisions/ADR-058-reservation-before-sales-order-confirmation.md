# ADR-058: Reservation Before Sales Order Confirmation

Sales orders must move through `RESERVED` before `CONFIRMED`.

Confirmation means the business accepts the order for fulfillment while the linked reservation remains active. This avoids confirming orders that have no protected inventory.

# Identifier Standard

Internal entity IDs should use UUIDs unless an ADR approves another strategy such as ULID for a specific indexing or ordering need.

Human-readable business codes are not primary keys. Order numbers, invoice numbers, SKU-like labels, and showroom codes must be generated with concurrency-safe processes and clear immutability rules.

SKU and barcode are distinct concepts. A SKU is a business-managed stock keeping identifier. A barcode is a scan-friendly external or internal code that may map to a SKU or variant.

IDs exposed in URLs and APIs must be treated as case-sensitive opaque strings. Human-readable codes should define case normalization before implementation.

Sequence generation is deferred; no order, invoice, SKU, or barcode generation exists yet.

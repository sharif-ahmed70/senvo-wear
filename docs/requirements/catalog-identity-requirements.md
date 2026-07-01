# Catalog Identity Requirements

This slice supports creating:

- One or more organizations, including the initial conceptual `SENVO` organization.
- Hierarchical categories.
- Product collections.
- Reusable colors.
- Reusable sizes.
- Product identities.
- Product variant identities based on color and size.

The slice explicitly excludes stock, prices, product images, publishing, SEO metadata, barcode generation, SKU auto-generation, orders, payments, POS, suppliers, customers, and authentication.

Codes and SKUs are trimmed, uppercased, space-free, and limited to letters, numbers, and hyphen. Display names preserve casing after trimming and whitespace collapse.

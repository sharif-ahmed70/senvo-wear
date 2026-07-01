# Catalog Domain

The catalog identity slice defines organization and merchandising identity only. It does not include inventory, prices, publishing, media, checkout, POS, or search.

The organization is the business boundary for SENVO Wear data. The design supports one initial SENVO Wear organization without hard-coding singleton assumptions into catalog logic.

Catalog taxonomy includes hierarchical categories, collections, reusable colors, reusable sizes, products, and product variants. Products are parent merchandising items. Variants are valid color-size combinations under a product and carry a manually supplied SKU.

Domain code lives in `@senvo/domain` and remains independent from Prisma, Next.js, React, HTTP, UI, storage, and external providers.

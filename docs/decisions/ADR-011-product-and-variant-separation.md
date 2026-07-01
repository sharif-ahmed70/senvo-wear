# ADR-011: Product And Variant Separation

Date: 2026-07-01

## Status

Accepted

## Context

Clothing products often have reusable color and size combinations. Parent products should not directly contain stock, price, size, or color.

## Decision

Model `Product` as the parent merchandising identity and `ProductVariant` as the valid color-size combination.

## Consequences

Inventory and pricing can later attach to variants without changing product identity. Product records remain free of stock and price.

## Alternatives Considered

A flat product-per-SKU model was rejected because it duplicates parent merchandising data and weakens taxonomy management.

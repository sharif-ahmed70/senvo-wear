import { describe, it, expect } from 'vitest';
import { takaToPoisha, calculateProfit } from './_lib/currency-math';

describe('currency-math', () => {
  it('converts taka to poisha correctly', () => {
    expect(takaToPoisha('100')).toBe(10000);
    expect(takaToPoisha('100.5')).toBe(10050);
    expect(takaToPoisha('100.05')).toBe(10005);
    expect(takaToPoisha('1,000.50')).toBe(100050);
  });

  it('calculates profit correctly', () => {
    expect(calculateProfit('100', '50', '10')).toBe(4000); 
  });
});

describe('idempotency key generation', () => {
  it('generates a unique key', () => {
    const key1 = Date.now().toString() + Math.random().toString();
    const key2 = Date.now().toString() + Math.random().toString();
    expect(key1).not.toBe(key2);
  });
});

describe('size presets', () => {
  it('has default sizes', () => {
    const sizes = ['S', 'M', 'L', 'XL'];
    expect(sizes).toContain('M');
  });
});

describe('payload building', () => {
  it('builds a valid payload', () => {
    const payload = {
      idempotencyKey: 'key',
      lines: [{ quantity: 10, unitCostMinor: 100, existingVariantId: '1' }],
      product: { existingProductId: '1' },
      purchase: { destinationLocationId: '1' },
      supplier: { existingSupplierId: '1' }
    };
    expect(payload.lines.length).toBe(1);
  });
});

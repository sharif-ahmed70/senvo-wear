export function createTestRequestId(prefix = "test"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

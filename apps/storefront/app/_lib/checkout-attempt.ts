export const checkoutAttemptStorageKey = "senvo-storefront-checkout-attempt-v1";
type Attempt = { idempotencyKey: string; payload: string };

export function checkoutAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  payload: unknown,
  createId: () => string = () => crypto.randomUUID(),
): Attempt {
  const signature = JSON.stringify(payload);
  try {
    const existing = JSON.parse(
      storage.getItem(checkoutAttemptStorageKey) ?? "null",
    ) as Attempt | null;
    if (existing?.payload === signature && existing.idempotencyKey)
      return existing;
  } catch {
    // A corrupt browser attempt is replaced below.
  }
  const next = { idempotencyKey: `web:${createId()}`, payload: signature };
  storage.setItem(checkoutAttemptStorageKey, JSON.stringify(next));
  return next;
}

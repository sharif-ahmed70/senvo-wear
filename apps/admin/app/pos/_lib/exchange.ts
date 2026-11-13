/**
 * Exchange = a return on the old sale plus a new sale. The old sale's return
 * credit pays for the new items; the customer pays only the difference, or
 * gets the rest back. The credit is counted as cash on the new sale and the
 * same amount is refunded in cash on the old sale, so the cash drawer only
 * moves by the difference.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The sale with the return form at the top. A #hash cannot do this: the
 * return part is still loading when the page opens, so nothing scrolls.
 */
export function returnHref(checkoutId: string): string {
  return `/pos/checkouts/${encodeURIComponent(checkoutId)}?return=1`;
}

/** True when the sale page was opened with returnHref. */
export function returnFirstFrom(
  query: Record<string, string | string[] | undefined>,
): boolean {
  return query.return === "1";
}

/** New Sale in exchange mode for the sale (checkout) that was returned. */
export function exchangeHref(checkoutId: string): string {
  return `/pos/sell?exchange=${encodeURIComponent(checkoutId)}`;
}

/** The old checkout id from New Sale's URL, or null. */
export function exchangeCheckoutIdFrom(search: string): string | null {
  const id = new URLSearchParams(search).get("exchange");
  return id && UUID.test(id) ? id : null;
}

/** One refund per new sale, so a retry can never refund twice. */
export function exchangeRefundKey(newCheckoutId: string): string {
  return `exchange-${newCheckoutId}`;
}

export type ExchangeSplit = {
  /** Part of the credit that pays for the new sale (recorded as cash). */
  appliedCreditMinor: number;
  /** What the customer still pays now. */
  customerPaysMinor: number;
  /** Cash handed back when the credit is more than the new sale. */
  giveBackMinor: number;
};

export function splitExchange(
  creditMinor: number,
  payableMinor: number,
): ExchangeSplit {
  const credit = Math.max(0, creditMinor);
  const payable = Math.max(0, payableMinor);
  const applied = Math.min(credit, payable);
  return {
    appliedCreditMinor: applied,
    customerPaysMinor: payable - applied,
    giveBackMinor: credit - applied,
  };
}

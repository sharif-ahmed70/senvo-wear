import type { SalesSessionContract } from "@senvo/contracts";

export type NextSaleSessionGateway = {
  startNextCart: (sessionId: string) => Promise<SalesSessionContract>;
};

// The server creates or reuses the single ACTIVE cart under a session lock.
// Retrying after an uncertain response never closes the drawer or creates duplicates.
export function reconcileNextSale(
  gateway: NextSaleSessionGateway,
  input: { completedSessionId: string; counterId: string },
) {
  return gateway.startNextCart(input.completedSessionId);
}

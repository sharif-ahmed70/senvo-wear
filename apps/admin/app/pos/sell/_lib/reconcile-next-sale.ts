import type { SalesSessionContract } from "@senvo/contracts";

export type NextSaleSessionGateway = {
  closeSession: (input: {
    expectedVersion: number;
    sessionId: string;
  }) => Promise<void>;
  listCurrentSessions: () => Promise<readonly SalesSessionContract[]>;
  openSession: (counterId: string) => Promise<SalesSessionContract>;
};

export async function reconcileNextSale(
  gateway: NextSaleSessionGateway,
  input: { completedSessionId: string; counterId: string },
) {
  let sessions = await gateway.listCurrentSessions();
  let current = findCounterSession(sessions, input.counterId);

  if (current && current.id !== input.completedSessionId) return current;

  if (current) {
    try {
      await gateway.closeSession({
        expectedVersion: current.version,
        sessionId: current.id,
      });
    } catch (closeError) {
      sessions = await gateway.listCurrentSessions();
      current = findCounterSession(sessions, input.counterId);
      if (current?.id === input.completedSessionId) throw closeError;
      if (current) return current;
    }
  }

  sessions = await gateway.listCurrentSessions();
  current = findCounterSession(sessions, input.counterId);
  if (current && current.id !== input.completedSessionId) return current;
  if (current) {
    throw new Error("The completed sales session is still open.");
  }

  try {
    return await gateway.openSession(input.counterId);
  } catch (openError) {
    sessions = await gateway.listCurrentSessions();
    current = findCounterSession(sessions, input.counterId);
    if (current && current.id !== input.completedSessionId) return current;
    throw openError;
  }
}

function findCounterSession(
  sessions: readonly SalesSessionContract[],
  counterId: string,
) {
  return sessions.find(
    (session) => session.counterId === counterId && session.status === "OPEN",
  );
}

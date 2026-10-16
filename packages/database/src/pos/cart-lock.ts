import { BusinessRuleError, ConflictError } from "@senvo/domain";
import type { Prisma } from "../../generated/prisma/client.js";

export const CART_CHANGED = "Cart changed on another screen. Refresh.";
export const NONEMPTY_CART =
  "Complete or empty the active cart before settling this session.";

// All cart writes and settlement take the session lock before any cart lock.
export async function lockCartSession(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  cartId: string,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT s.id FROM sales_sessions s JOIN pos_carts c
    ON c.sales_session_id = s.id AND c.organization_id = s.organization_id
    WHERE c.id = ${cartId}::uuid AND c.organization_id = ${organizationId}::uuid
    FOR UPDATE OF s`;
}
export async function lockSession(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  sessionId: string,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT id FROM sales_sessions WHERE id = ${sessionId}::uuid
    AND organization_id = ${organizationId}::uuid FOR UPDATE`;
}
export async function bumpCart(
  tx: Prisma.TransactionClient,
  cartId: string,
  organizationId: string,
  expectedVersion: number,
) {
  await lockCartSession(tx, cartId, organizationId);
  const updated = await tx.posCart.updateMany({
    where: {
      id: cartId,
      organizationId,
      version: expectedVersion,
      status: "ACTIVE",
      salesSession: { status: "OPEN" },
    },
    data: { version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ConflictError(CART_CHANGED);
}
export async function assertEmptyActiveCart(
  tx: Pick<Prisma.TransactionClient, "posCart">,
  sessionId: string,
  organizationId: string,
) {
  if (
    await tx.posCart.count({
      where: {
        salesSessionId: sessionId,
        organizationId,
        status: "ACTIVE",
        lines: { some: {} },
      },
    })
  )
    throw new BusinessRuleError(NONEMPTY_CART);
}

# Transactional Audit

## Purpose

Sales order creation and inventory movement posting write their audit records in the same database transaction as the business change. A successful callback commits both records; any authorization, business, audit, or later callback failure rolls back both.

## Boundary

The domain defines a generic `TransactionManager` and `TransactionContext`. The context carries the validated application context, a transactional audit writer, and the minimum repositories needed by the two integrated operations. It contains no Prisma type.

The database package implements the boundary with `PrismaTransactionManager`. It opens one interactive Prisma transaction and injects its transaction client into scoped repositories and the audit repository. Scoped repositories execute directly against that client and never open nested transactions.

## Application flow

1. Validate input, authentication, and application context.
2. Begin the infrastructure transaction.
3. Validate authorization using the transaction context's application context.
4. Perform the business write using a transaction-scoped repository.
5. Record audit data using `recordWithinTransaction`.
6. Commit only when the callback completes.

Other operations retain their existing repository transaction behavior and are outside this integration phase.

import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  addPosCartItem,
  checkoutCart as completePosCheckout,
  changeSalesCounterStatus,
  closeSalesSession,
  collectOutstandingPayment,
  createSalesCounter,
  listSalesCounters,
  listSalesSessions,
  listCurrentUserSalesSessions,
  getCheckoutStatus,
  getPaymentAccount,
  getPaymentCollectionReceipt,
  getPosReturnAccount,
  getPosReturnReceipt,
  getPosCart,
  listCheckoutHistory,
  getSalesReceipt,
  lookupPosSale,
  openSalesSession,
  recordPosSaleReturn,
  removePosCartItem,
  updatePosCartItem,
  type BarcodeRepository,
  type BranchRepository,
  type InventoryReadRepository,
  type OrganizationMembershipRepository,
  type PosCartLine,
  type PosCartDetails,
  type PosCheckout,
  type PosCheckoutRepository,
  type PosRepository,
  type PaymentAccount,
  type PaymentCollection,
  type PaymentCollectionReceipt,
  type PaymentRepository,
  type PosReturnAccount,
  type PosReturnReceipt,
  type PosReturnRepository,
  type PosSaleReturn,
  type ReceiptRepository,
  type PosReturnReceiptRepository,
  type SalesReceipt,
  type SalesCounter,
  type SalesSession,
  type SalesSourceRepository,
  type UserRepository,
} from "@senvo/domain";
import {
  addPosCartItemServiceInputSchema,
  collectPosPaymentResultContractSchema,
  collectPosPaymentServiceInputSchema,
  createPosReturnServiceInputSchema,
  checkoutPosCartServiceInputSchema,
  closeSalesSessionServiceInputSchema,
  createSalesCounterServiceInputSchema,
  lookupPosSaleServiceInputSchema,
  getPosCheckoutServiceInputSchema,
  getPaymentCollectionReceiptServiceInputSchema,
  getPosReturnReceiptServiceInputSchema,
  getPosCartServiceInputSchema,
  openSalesSessionServiceInputSchema,
  posCartLineContractSchema,
  posCartDetailsContractSchema,
  posCheckoutContractSchema,
  paymentAccountContractSchema,
  paymentCollectionReceiptContractSchema,
  posReturnAccountContractSchema,
  posReturnReceiptContractSchema,
  posReturnResultContractSchema,
  salesReceiptContractSchema,
  posEmptyInputSchema,
  posSaleLookupContractSchema,
  removePosCartItemServiceInputSchema,
  salesCounterContractSchema,
  salesSessionContractSchema,
  updatePosCartItemServiceInputSchema,
  updateSalesCounterStatusServiceInputSchema,
  type PosCartLineContract,
  type PosCartDetailsContract,
  type PosCheckoutContract,
  type CollectPosPaymentResultContract,
  type PaymentAccountContract,
  type PaymentCollectionReceiptContract,
  type PosReturnAccountContract,
  type PosReturnReceiptContract,
  type PosReturnResultContract,
  type PosSaleLookupContract,
  type SalesReceiptContract,
  type SalesCounterContract,
  type SalesSessionContract,
} from "@senvo/contracts";
import {
  requireAuthentication,
  type ApplicationAuthenticationService,
} from "../context/authentication.js";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import type { Clock } from "../context/clock.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { data: T; success: true }
    | {
        error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        success: false;
      };
};

export type PosApplicationServiceDependencies = {
  authenticationService?: ApplicationAuthenticationService;
  authorizationService?: ApplicationAuthorizationService;
  barcodes: BarcodeRepository;
  branches: BranchRepository;
  clock: Clock;
  checkouts: PosCheckoutRepository;
  inventory: InventoryReadRepository;
  memberships: OrganizationMembershipRepository;
  pos: PosRepository;
  payments: PaymentRepository;
  receipts: ReceiptRepository;
  returns?: PosReturnRepository;
  returnReceipts?: PosReturnReceiptRepository;
  requestIdGenerator?: () => string;
  salesSources: SalesSourceRepository;
  transactionManager: ApplicationTransactionManager;
  users: UserRepository;
};

export class PosApplicationService {
  private readonly requestIdGenerator: () => string;
  constructor(
    private readonly dependencies: PosApplicationServiceDependencies,
  ) {
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
  }

  listCounters(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listSalesCounters(this.dependencies.pos, trusted.organizationId)
      ).map(mapCounter);
    });
  }
  createCounter(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract>(context, async (trusted) => {
      const input = parsePayload(createSalesCounterServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      return mapCounter(
        await createSalesCounter(
          {
            branches: this.dependencies.branches,
            pos: this.dependencies.pos,
            salesSources: this.dependencies.salesSources,
          },
          { ...input, organizationId: trusted.organizationId },
        ),
      );
    });
  }
  updateCounterStatus(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesCounterContract>(context, async (trusted) => {
      const input = parsePayload(
        updateSalesCounterStatusServiceInputSchema,
        payload,
      );
      await this.authorize(trusted, "UPDATE");
      return mapCounter(
        await changeSalesCounterStatus(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }
  listSessions(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listSalesSessions(this.dependencies.pos, trusted.organizationId)
      ).map(mapSession);
    });
  }
  listCurrentSessions(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      const userId = this.requireUserId(trusted);
      return (
        await listCurrentUserSalesSessions(this.dependencies.pos, {
          organizationId: trusted.organizationId,
          userId,
        })
      ).map(mapSession);
    });
  }
  getCart(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartDetailsContract>(context, async (trusted) => {
      const input = parsePayload(getPosCartServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      const userId = this.requireUserId(trusted);
      return mapCartDetails(
        await getPosCart(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
          userId,
        }),
      );
    });
  }
  openSession(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract>(context, async (trusted) => {
      const input = parsePayload(openSalesSessionServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      if (!trusted.userId)
        throw new AuthorizationError(
          "A user is required to open a sales session.",
        );
      return mapSession(
        await openSalesSession(
          {
            memberships: this.dependencies.memberships,
            pos: this.dependencies.pos,
            users: this.dependencies.users,
          },
          {
            ...input,
            openedAt: this.dependencies.clock.now(),
            organizationId: trusted.organizationId,
            userId: trusted.userId,
          },
        ),
      );
    });
  }
  closeSession(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesSessionContract>(context, async (trusted) => {
      const input = parsePayload(closeSalesSessionServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      return mapSession(
        await closeSalesSession(this.dependencies.pos, {
          ...input,
          closedAt: this.dependencies.clock.now(),
          organizationId: trusted.organizationId,
        }),
      );
    });
  }
  lookupSale(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosSaleLookupContract>(context, async (trusted) => {
      const input = parsePayload(lookupPosSaleServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      return posSaleLookupContractSchema.parse(
        await lookupPosSale(
          {
            barcodes: this.dependencies.barcodes,
            inventory: this.dependencies.inventory,
          },
          { ...input, organizationId: trusted.organizationId },
        ),
      );
    });
  }
  addCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartLineContract>(context, async (trusted) => {
      const input = parsePayload(addPosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "CREATE");
      const userId = this.requireUserId(trusted);
      return mapLine(
        await addPosCartItem(
          {
            inventory: this.dependencies.inventory,
            pos: this.dependencies.pos,
          },
          {
            ...input,
            organizationId: trusted.organizationId,
            userId,
          },
        ),
      );
    });
  }
  updateCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCartLineContract>(context, async (trusted) => {
      const input = parsePayload(updatePosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      const userId = this.requireUserId(trusted);
      return mapLine(
        await updatePosCartItem(this.dependencies.pos, {
          ...input,
          organizationId: trusted.organizationId,
          userId,
        }),
      );
    });
  }
  removeCartItem(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<null>(context, async (trusted) => {
      const input = parsePayload(removePosCartItemServiceInputSchema, payload);
      await this.authorize(trusted, "UPDATE");
      const userId = this.requireUserId(trusted);
      await removePosCartItem(this.dependencies.pos, {
        ...input,
        organizationId: trusted.organizationId,
        userId,
      });
      return null;
    });
  }

  checkoutCart(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract>(context, async (trusted) => {
      const input = parsePayload(checkoutPosCartServiceInputSchema, payload);
      await requireAuthentication(this.dependencies.authenticationService, {
        requestId: trusted.requestId,
        userId: trusted.userId,
      });
      if (!trusted.userId)
        throw new AuthenticationError("Authenticated user is required.");
      const staffId = trusted.userId;
      return this.dependencies.transactionManager.execute(
        trusted,
        async (transaction) => {
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "UPDATE", resource: "POS" },
          );
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "CREATE", resource: "SALES" },
          );
          await requireAuthorization(
            this.dependencies.authorizationService,
            transaction.applicationContext,
            { action: "CREATE", resource: "PAYMENT" },
          );
          if (
            !transaction.posCheckoutRepository ||
            !transaction.posCheckoutSalesOrderRepository ||
            !transaction.paymentRepository ||
            !transaction.receiptRepository
          ) {
            throw new Error("POS checkout transaction capability is required.");
          }
          const result = await completePosCheckout(
            {
              checkouts: transaction.posCheckoutRepository,
              payments: transaction.paymentRepository,
              receipts: transaction.receiptRepository,
              salesOrders: transaction.posCheckoutSalesOrderRepository,
            },
            {
              ...input,
              checkoutId: crypto.randomUUID(),
              completedAt: this.dependencies.clock.now(),
              organizationId: trusted.organizationId,
              paymentBatchId: crypto.randomUUID(),
              receiptId: crypto.randomUUID(),
              staffId,
              approveOutstanding: () =>
                requireAuthorization(
                  this.dependencies.authorizationService,
                  transaction.applicationContext,
                  { action: "APPROVE", resource: "PAYMENT" },
                ),
            },
          );
          if (!result.replayed) {
            await transaction.auditWriter.recordWithinTransaction({
              action: "POS_CHECKOUT_COMPLETED",
              actor: { userId: staffId },
              metadata: {
                cartId: result.checkout.cartId,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "POS_CHECKOUT",
              resourceId: result.checkout.id,
            });
            await transaction.auditWriter.recordWithinTransaction({
              action: "POS_PAYMENT_RECORDED",
              actor: { userId: staffId },
              metadata: {
                checkoutId: result.checkout.id,
                lineCount: input.payments.length,
                outstandingMinor: result.checkout.outstandingMinor ?? 0,
                paidMinor: result.checkout.paidMinor ?? 0,
                paymentStatus: result.checkout.paymentStatus,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "PAYMENT",
              resourceId: result.checkout.paymentBatchId ?? result.checkout.id,
            });
            await transaction.auditWriter.recordWithinTransaction({
              action: "SALES_RECEIPT_ISSUED",
              actor: { userId: staffId },
              metadata: {
                checkoutId: result.checkout.id,
                outstandingMinor: result.checkout.outstandingMinor ?? 0,
                paidMinor: result.checkout.paidMinor ?? 0,
                paymentStatus: result.checkout.paymentStatus,
                requestId: trusted.requestId,
                salesOrderId: result.checkout.salesOrderId,
              },
              organizationId: trusted.organizationId,
              resource: "SALES_RECEIPT",
              resourceId: result.checkout.receiptId ?? result.checkout.id,
            });
          }
          return mapCheckout(result.checkout);
        },
      );
    });
  }

  getCheckout(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await this.authorize(trusted, "READ");
      return mapCheckout(
        await getCheckoutStatus(this.dependencies.checkouts, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }

  listCheckouts(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosCheckoutContract[]>(context, async (trusted) => {
      parsePayload(posEmptyInputSchema, payload);
      await this.authorize(trusted, "READ");
      return (
        await listCheckoutHistory(
          this.dependencies.checkouts,
          trusted.organizationId,
        )
      ).map(mapCheckout);
    });
  }

  getReceipt(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<SalesReceiptContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "RECEIPT" },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "PAYMENT" },
      );
      return mapReceipt(
        await getSalesReceipt(this.dependencies.receipts, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }

  getPaymentAccount(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PaymentAccountContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "POS" },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        { action: "READ", resource: "PAYMENT" },
      );
      return mapPaymentAccount(
        await getPaymentAccount(this.dependencies.payments, {
          ...input,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }

  collectPayment(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<CollectPosPaymentResultContract>(
      context,
      async (trusted) => {
        const input = parsePayload(
          collectPosPaymentServiceInputSchema,
          payload,
        );
        await requireAuthentication(this.dependencies.authenticationService, {
          requestId: trusted.requestId,
          userId: trusted.userId,
        });
        const userId = this.requireUserId(trusted);
        return this.dependencies.transactionManager.execute(
          trusted,
          async (transaction) => {
            await requireAuthorization(
              this.dependencies.authorizationService,
              transaction.applicationContext,
              { action: "READ", resource: "POS" },
            );
            await requireAuthorization(
              this.dependencies.authorizationService,
              transaction.applicationContext,
              { action: "CREATE", resource: "PAYMENT" },
            );
            if (
              !transaction.paymentRepository ||
              !transaction.receiptRepository
            )
              throw new Error(
                "Payment collection transaction capability is required.",
              );
            const result = await collectOutstandingPayment(
              {
                payments: transaction.paymentRepository,
                receipts: transaction.receiptRepository,
              },
              {
                ...input,
                acceptedByUserId: userId,
                collectedAt: this.dependencies.clock.now(),
                collectionId: crypto.randomUUID(),
                organizationId: trusted.organizationId,
                receiptId: crypto.randomUUID(),
              },
            );
            if (!result.replayed)
              await transaction.auditWriter.recordWithinTransaction({
                action: "POS_OUTSTANDING_PAYMENT_COLLECTED",
                actor: { userId },
                metadata: {
                  amountMinor: result.collection.amountMinor,
                  checkoutId: input.checkoutId,
                  collectionId: result.collection.id,
                  cumulativePaidMinor: result.account.cumulativePaidMinor ?? 0,
                  outstandingMinor: result.account.outstandingMinor ?? 0,
                  paymentLineCount: result.collection.lines.length,
                  paymentReceiptId: result.collection.receiptId,
                  paymentStatus: result.account.status,
                  requestId: trusted.requestId,
                  salesOrderId: result.collection.salesOrderId,
                },
                organizationId: trusted.organizationId,
                resource: "PAYMENT_COLLECTION",
                resourceId: result.collection.id,
              });
            return collectPosPaymentResultContractSchema.parse({
              account: mapPaymentAccount(result.account),
              collection: mapPaymentCollection(result.collection),
              replayed: result.replayed,
            });
          },
        );
      },
    );
  }

  getPaymentCollectionReceipt(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    return this.execute<PaymentCollectionReceiptContract>(
      context,
      async (trusted) => {
        const input = parsePayload(
          getPaymentCollectionReceiptServiceInputSchema,
          payload,
        );
        await requireAuthorization(
          this.dependencies.authorizationService,
          trusted,
          { action: "READ", resource: "RECEIPT" },
        );
        await requireAuthorization(
          this.dependencies.authorizationService,
          trusted,
          { action: "READ", resource: "PAYMENT" },
        );
        return mapPaymentCollectionReceipt(
          await getPaymentCollectionReceipt(this.dependencies.receipts, {
            ...input,
            organizationId: trusted.organizationId,
          }),
        );
      },
    );
  }

  getReturns(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosReturnAccountContract>(context, async (trusted) => {
      const input = parsePayload(getPosCheckoutServiceInputSchema, payload);
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "POS",
        },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "SALES",
        },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "PAYMENT",
        },
      );
      if (!this.dependencies.returns)
        throw new Error("POS return read capability is required.");
      return mapReturnAccount(
        await getPosReturnAccount(this.dependencies.returns, {
          checkoutId: input.checkoutId,
          organizationId: trusted.organizationId,
        }),
      );
    });
  }

  createReturn(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosReturnResultContract>(context, async (trusted) => {
      const input = parsePayload(createPosReturnServiceInputSchema, payload);
      await requireAuthentication(this.dependencies.authenticationService, {
        requestId: trusted.requestId,
        userId: trusted.userId,
      });
      const userId = this.requireUserId(trusted);
      return this.dependencies.transactionManager.execute(
        trusted,
        async (transaction) => {
          for (const permission of [
            { action: "UPDATE", resource: "POS" },
            { action: "UPDATE", resource: "SALES" },
            { action: "CREATE", resource: "INVENTORY" },
            { action: "APPROVE", resource: "PAYMENT" },
          ] as const) {
            await requireAuthorization(
              this.dependencies.authorizationService,
              transaction.applicationContext,
              permission,
            );
          }
          if (
            !transaction.posReturnRepository ||
            !transaction.posReturnReceiptRepository
          ) {
            throw new Error("POS return transaction capability is required.");
          }
          const result = await recordPosSaleReturn(
            {
              inventory: transaction.inventoryMovementRepository,
              receipts: transaction.posReturnReceiptRepository,
              returns: transaction.posReturnRepository,
            },
            {
              ...input,
              acceptedByUserId: userId,
              organizationId: trusted.organizationId,
              receiptId: crypto.randomUUID(),
              returnId: crypto.randomUUID(),
              returnedAt: this.dependencies.clock.now(),
            },
          );
          if (!result.replayed) {
            await transaction.auditWriter.recordWithinTransaction({
              action: "POS_SALE_RETURN_RECORDED",
              actor: { userId },
              metadata: {
                checkoutId: input.checkoutId,
                inventoryMovementId: result.saleReturn.inventoryMovementId,
                lineCount: result.saleReturn.lines.length,
                reasonCode: result.saleReturn.reasonCode,
                refundableMinor: result.account.refundableMinor ?? 0,
                requestId: trusted.requestId,
                returnCreditMinor: result.saleReturn.totalCreditMinor,
                returnHoldLocationId: input.destinationLocationId,
                returnId: result.saleReturn.id,
                returnReceiptId: result.saleReturn.receiptId,
                returnedUnitCount: result.saleReturn.lines.reduce(
                  (total, line) => total + line.quantity,
                  0,
                ),
                salesOrderId: result.saleReturn.salesOrderId,
                settlementStatus: result.account.settlementStatus,
                adjustedPayableMinor: result.account.adjustedPayableMinor ?? 0,
                outstandingMinor: result.account.outstandingMinor ?? 0,
              },
              organizationId: trusted.organizationId,
              resource: "POS_RETURN",
              resourceId: result.saleReturn.id,
            });
          }
          return posReturnResultContractSchema.parse({
            account: mapReturnAccount(result.account),
            replayed: result.replayed,
            saleReturn: mapSaleReturn(result.saleReturn),
          });
        },
      );
    });
  }

  getReturnReceipt(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<PosReturnReceiptContract>(context, async (trusted) => {
      const input = parsePayload(
        getPosReturnReceiptServiceInputSchema,
        payload,
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "RECEIPT",
        },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "PAYMENT",
        },
      );
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "SALES",
        },
      );
      if (!this.dependencies.returnReceipts)
        throw new Error("POS return receipt capability is required.");
      return mapReturnReceipt(
        await getPosReturnReceipt(this.dependencies.returnReceipts, {
          organizationId: trusted.organizationId,
          returnId: input.returnId,
        }),
      );
    });
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    action: "CREATE" | "READ" | "UPDATE",
  ) {
    return requireAuthorization(
      this.dependencies.authorizationService,
      context,
      { action, resource: "POS" },
    );
  }
  private requireUserId(context: ValidatedApplicationExecutionContext) {
    if (!context.userId)
      throw new AuthenticationError("Authenticated user is required.");
    return context.userId;
  }
  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const context = {
      ...rawContext,
      requestId: rawContext.requestId || this.requestIdGenerator(),
    };
    try {
      return {
        data: await action(validateExecutionContext(context)),
        ok: true,
      };
    } catch (error) {
      return {
        error: normalizeError(error).toShape(context.requestId),
        ok: false,
      };
    }
  }
}

function mapCounter(record: SalesCounter): SalesCounterContract {
  return salesCounterContractSchema.parse({
    boothId: record.boothId,
    branchId: record.branchId,
    code: record.code,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    name: record.name,
    status: record.status,
    type: record.type,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}
function mapSession(record: SalesSession): SalesSessionContract {
  return salesSessionContractSchema.parse({
    cartId: record.cartId,
    closedAt: record.closedAt?.toISOString() ?? null,
    counterId: record.counterId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    openedAt: record.openedAt.toISOString(),
    openedByUserId: record.openedByUserId,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}
function mapLine(record: PosCartLine): PosCartLineContract {
  return posCartLineContractSchema.parse({
    cartId: record.cartId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lineSubtotalMinor: record.lineSubtotalMinor,
    productVariantId: record.productVariantId,
    quantity: record.quantity,
    unitPriceMinor: record.unitPriceMinor,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function mapCartDetails(record: PosCartDetails): PosCartDetailsContract {
  return posCartDetailsContractSchema.parse({
    checkoutId: record.checkoutId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lines: record.lines.map((line) => ({
      ...mapLine(line),
      color: line.color,
      productName: line.productName,
      size: line.size,
      sku: line.sku,
    })),
    salesSessionId: record.salesSessionId,
    sessionStatus: record.sessionStatus,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function mapCheckout(record: PosCheckout): PosCheckoutContract {
  return posCheckoutContractSchema.parse({
    cartId: record.cartId,
    completedAt: record.completedAt.toISOString(),
    counterId: record.counterId,
    counterName: record.counterName,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    orderNumber: record.orderNumber,
    outstandingMinor: record.outstandingMinor,
    paidMinor: record.paidMinor,
    paymentStatus: record.paymentStatus,
    receiptId: record.receiptId,
    receiptNumber: record.receiptNumber,
    salesOrderId: record.salesOrderId,
    salesSessionId: record.salesSessionId,
    staffName: record.staffName,
    status: record.status,
    subtotalMinor: record.subtotalMinor,
    totalMinor: record.totalMinor,
    updatedAt: record.updatedAt.toISOString(),
  });
}
function mapReceipt(record: SalesReceipt): SalesReceiptContract {
  return salesReceiptContractSchema.parse({
    ...record,
    issuedAt: record.issuedAt.toISOString(),
  });
}
function mapPaymentCollection(record: PaymentCollection) {
  return {
    acceptedByName: record.acceptedByName,
    amountMinor: record.amountMinor,
    balanceAfterMinor: record.balanceAfterMinor,
    balanceBeforeMinor: record.balanceBeforeMinor,
    checkoutId: record.checkoutId,
    createdAt: record.createdAt.toISOString(),
    currencyCode: record.currencyCode,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    lines: record.lines.map((line) => ({
      amountMinor: line.amountMinor,
      collectionId: line.collectionId,
      createdAt: line.createdAt.toISOString(),
      id: line.id,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    receiptId: record.receiptId,
    receiptNumber: record.receiptNumber,
  };
}
function mapPaymentAccount(record: PaymentAccount): PaymentAccountContract {
  return paymentAccountContractSchema.parse({
    adjustedPayableMinor: record.adjustedPayableMinor,
    checkoutId: record.checkoutId,
    collections: record.collections.map(mapPaymentCollection),
    cumulativePaidMinor: record.cumulativePaidMinor,
    currencyCode: record.currencyCode,
    initialPaidMinor: record.initialPaidMinor,
    initialPayments: record.initialPayments,
    legacyPaymentRecorded: record.legacyPaymentRecorded,
    orderNumber: record.orderNumber,
    originalPayableMinor: record.originalPayableMinor,
    outstandingMinor: record.outstandingMinor,
    refundableMinor: record.refundableMinor,
    returnCreditMinor: record.returnCreditMinor,
    settlementStatus: record.settlementStatus,
    status: record.status,
    totalMinor: record.totalMinor,
  });
}
function mapPaymentCollectionReceipt(
  record: PaymentCollectionReceipt,
): PaymentCollectionReceiptContract {
  return paymentCollectionReceiptContractSchema.parse({
    ...record,
    collectedAt: record.collectedAt.toISOString(),
  });
}
function mapSaleReturn(record: PosSaleReturn) {
  return {
    acceptedByName: record.acceptedByName,
    checkoutId: record.checkoutId,
    createdAt: record.createdAt.toISOString(),
    destinationLocationId: record.destinationLocationId,
    destinationLocationName: record.destinationLocationName,
    id: record.id,
    inventoryMovementId: record.inventoryMovementId,
    lines: record.lines.map((line) => ({
      colorSnapshot: line.colorSnapshot,
      id: line.id,
      lineCreditMinor: line.lineCreditMinor,
      lineNumber: line.lineNumber,
      productNameSnapshot: line.productNameSnapshot,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      salesOrderLineId: line.salesOrderLineId,
      sizeSnapshot: line.sizeSnapshot,
      skuSnapshot: line.skuSnapshot,
      unitPriceMinor: line.unitPriceMinor,
    })),
    reasonCode: record.reasonCode,
    reasonNote: record.reasonNote,
    receiptId: record.receiptId,
    receiptNumber: record.receiptNumber,
    returnedAt: record.returnedAt.toISOString(),
    totalCreditMinor: record.totalCreditMinor,
  };
}
function mapReturnAccount(record: PosReturnAccount): PosReturnAccountContract {
  return posReturnAccountContractSchema.parse({
    adjustedPayableMinor: record.adjustedPayableMinor,
    checkoutId: record.checkoutId,
    cumulativeReceivedMinor: record.cumulativeReceivedMinor,
    legacyPaymentRecorded: record.legacyPaymentRecorded,
    lines: record.lines,
    orderNumber: record.orderNumber,
    originalTotalMinor: record.originalTotalMinor,
    outstandingMinor: record.outstandingMinor,
    refundableMinor: record.refundableMinor,
    returnCreditMinor: record.returnCreditMinor,
    returns: record.returns.map(mapSaleReturn),
    settlementStatus: record.settlementStatus,
  });
}
function mapReturnReceipt(record: PosReturnReceipt): PosReturnReceiptContract {
  return posReturnReceiptContractSchema.parse({
    ...record,
    returnedAt: record.returnedAt.toISOString(),
  });
}
function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues.at(0);
  throw new ValidationApplicationServiceError(
    issue
      ? `${issue.path.join(".") || "payload"}: ${issue.message}`
      : "Input is invalid.",
  );
}
function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError)
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  if (error instanceof AuthenticationError)
    return new ApplicationServiceError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  if (error instanceof AuthorizationError)
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  if (error instanceof NotFoundError)
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  if (error instanceof ConcurrencyError)
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The information changed. Please reload.",
      retryable: true,
    });
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: error.message.includes("idempotency key")
        ? "IDEMPOTENCY_CONFLICT"
        : "CONFLICT",
      message: error.message.includes("idempotency key")
        ? "This return attempt was already used with different details."
        : "The request conflicts with the current information.",
    });
  if (error instanceof BusinessRuleError)
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: mapBusinessRuleMessage(error.message),
    });
  return new ApplicationServiceError({
    code:
      error instanceof ApplicationError ? "INTERNAL_ERROR" : "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

function mapBusinessRuleMessage(message: string): string {
  if (message.includes("legacy payment checkout"))
    return "Returns are not available for this older sale yet.";
  if (message.includes("Return hold"))
    return "Choose an active Return hold location.";
  if (message.includes("remaining returnable quantity"))
    return "This quantity is more than the customer can still return.";
  if (message.includes("already fully returned"))
    return "This item has already been fully returned.";
  if (message.includes("does not belong to this sale"))
    return "Choose an item from this sale.";
  if (message.includes("fulfilled POS sales"))
    return "Only completed POS sales can be returned.";
  return "The request cannot be completed.";
}

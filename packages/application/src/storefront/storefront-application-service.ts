import { createHash, randomUUID } from "node:crypto";
import {
  ApplicationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  createSalesOrder,
  reserveSalesOrder,
  type StorefrontCatalog,
  type StorefrontProduct,
  type StorefrontRepository,
} from "@senvo/domain";
import {
  storefrontCatalogQuerySchema,
  storefrontCheckoutInputSchema,
  storefrontCheckoutResultSchema,
  storefrontProductQuerySchema,
  type StorefrontCheckoutResultContract,
  type PrimaryProductImageContract,
} from "@senvo/contracts";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import type { OnlinePaymentApplicationService } from "../payment/online-payment-application-service.js";
import { validateExecutionContext } from "../context/execution-context.js";
import {
  ApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";
import type { CatalogMediaApplicationService } from "../catalog/catalog-media-application-service.js";

export type StorefrontApplicationServiceDependencies = {
  organizationCode: string;
  repository: StorefrontRepository;
  requestIdGenerator?: () => string;
  transactionManager: ApplicationTransactionManager;
  mediaService?: CatalogMediaApplicationService;
  onlinePayments?: OnlinePaymentApplicationService;
};

export class StorefrontApplicationService {
  private readonly organizationCode: string;
  private readonly repository: StorefrontRepository;
  private readonly requestIdGenerator: () => string;
  private readonly transactionManager: ApplicationTransactionManager;
  private readonly mediaService?: CatalogMediaApplicationService;
  private readonly onlinePayments?: OnlinePaymentApplicationService;

  constructor(dependencies: StorefrontApplicationServiceDependencies) {
    this.organizationCode = dependencies.organizationCode.trim().toUpperCase();
    this.repository = dependencies.repository;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => `req_${randomUUID()}`);
    this.transactionManager = dependencies.transactionManager;
    this.mediaService = dependencies.mediaService;
    this.onlinePayments = dependencies.onlinePayments;
  }

  listCatalog(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StorefrontCatalog>> {
    return this.execute(requestId, async () => {
      const input = storefrontCatalogQuerySchema.parse(payload);
      const organization = await this.resolveOrganization();
      const catalog = await this.repository.listCatalog({
        ...input,
        organizationId: organization.id,
      });
      const images = this.mediaService
        ? await this.mediaService.readProjections(
            organization.id,
            catalog.products.map((product) => product.id),
          )
        : new Map<string, PrimaryProductImageContract>();
      return {
        ...catalog,
        products: catalog.products.map((product) => ({
          ...product,
          media: [],
          primaryImage: images.get(product.id) ?? null,
        })),
      };
    });
  }

  getProduct(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StorefrontProduct>> {
    return this.execute(requestId, async () => {
      const input = storefrontProductQuerySchema.parse(payload);
      const organization = await this.resolveOrganization();
      const product = await this.repository.getProductBySlug(
        organization.id,
        input.slug,
      );
      if (!product)
        throw new NotFoundError("Storefront product was not found.");
      return {
        ...product,
        ...(this.mediaService
          ? await this.storefrontMedia(organization.id, product.id)
          : { media: [], primaryImage: null }),
      };
    });
  }

  private async storefrontMedia(organizationId: string, productId: string) {
    if (!this.mediaService) return { media: [], primaryImage: null };
    const media = await this.mediaService.readMediaProjection(
      organizationId,
      productId,
    );
    const primary = media.find((item) => item.role === "PRIMARY") ?? null;
    return {
      media,
      primaryImage: primary
        ? {
            altText: primary.altText,
            assetId: primary.assetId,
            byteSize: primary.byteSize,
            contentType: primary.contentType,
            url: primary.url,
          }
        : null,
    };
  }

  checkout(
    requestId: string,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StorefrontCheckoutResultContract>> {
    return this.execute(requestId, async () => {
      const input = storefrontCheckoutInputSchema.parse(payload);
      const organization = await this.resolveOrganization();
      const normalized = normalizeCheckout(input);
      const signature = createHash("sha256")
        .update(JSON.stringify(normalized))
        .digest("hex");
      const context = validateExecutionContext({
        actorType: "ANONYMOUS",
        authenticationState: "ANONYMOUS",
        organizationId: organization.id,
        permissions: null,
        requestId: requestId || this.requestIdGenerator(),
        source: "STOREFRONT",
        userId: null,
      });
      const checkout = await this.transactionManager.execute(
        context,
        async (transaction) => {
          const storefront = transaction.storefrontRepository;
          const sales = transaction.salesOrderLifecycleRepository;
          if (!storefront || !sales) {
            throw new Error(
              "Storefront transaction capabilities are unavailable.",
            );
          }
          await storefront.lockCheckoutAttempt(
            organization.id,
            normalized.idempotencyKey,
          );
          const replay = await storefront.findCheckoutByIdempotencyKey(
            organization.id,
            normalized.idempotencyKey,
          );
          if (replay) {
            if (replay.requestSignature !== signature) {
              throw new ConflictError(
                "Storefront idempotency key was already used with different details.",
              );
            }
            if (
              replay.paymentPreference === "CASH_ON_DELIVERY" &&
              replay.status !== "RESERVED"
            ) {
              throw new ConflictError(
                "The existing storefront order is no longer reserved.",
              );
            }
            return storefrontCheckoutResultSchema.parse({
              currencyCode: replay.currencyCode,
              orderId: replay.orderId,
              orderNumber: replay.orderNumber,
              payment: null,
              paymentPreference: replay.paymentPreference,
              status: replay.status,
              totalMinor: replay.totalMinor,
            });
          }

          const facts = await storefront.loadCheckoutFacts(
            organization.id,
            normalized.lines.map((line) => line.productVariantId),
          );
          const prices = new Map(
            facts.variants.map((variant) => [
              variant.id,
              variant.sellingPriceMinor,
            ]),
          );
          for (const line of normalized.lines) {
            const currentPrice = prices.get(line.productVariantId);
            if (currentPrice === undefined) {
              throw new NotFoundError(
                "A selected product is no longer available.",
              );
            }
            if (currentPrice !== line.reviewedUnitPriceMinor) {
              throw new ApplicationServiceError({
                code: "BUSINESS_RULE_VIOLATION",
                message:
                  "Product prices changed. Refresh and review the current total.",
              });
            }
          }
          const reference = createHash("sha256")
            .update(`${organization.id}:${normalized.idempotencyKey}`)
            .digest("hex")
            .slice(0, 20)
            .toUpperCase();
          const draft = await createSalesOrder(sales, {
            allocationPolicyId: facts.allocationPolicyId,
            channel: "ONLINE",
            currencyCode: "BDT",
            customerEmail: normalized.customer.email ?? null,
            customerName: normalized.customer.name,
            customerPhone: normalized.customer.phone,
            deliveryAddressLine1: normalized.deliveryAddress.line1,
            deliveryAddressLine2: normalized.deliveryAddress.line2 ?? null,
            deliveryCity: normalized.deliveryAddress.city,
            deliveryDistrict: normalized.deliveryAddress.district,
            deliveryPostalCode: normalized.deliveryAddress.postalCode ?? null,
            idempotencyKey: normalized.idempotencyKey,
            lines: normalized.lines.map((line) => {
              const unitPriceMinor = prices.get(line.productVariantId);
              if (unitPriceMinor === undefined) {
                throw new NotFoundError(
                  "A selected product is no longer available.",
                );
              }
              return {
                productVariantId: line.productVariantId,
                quantity: line.quantity,
                unitPriceMinor,
              };
            }),
            note: normalized.note ?? null,
            orderNumber: `WEB-${reference}`,
            organizationId: organization.id,
          });
          const reserved = await reserveSalesOrder(sales, {
            expectedVersion: draft.version,
            organizationId: organization.id,
            reservationIdempotencyKey: `storefront-reservation:${normalized.idempotencyKey}`,
            reservationNumber: `WEB-RSV-${reference}`,
            salesOrderId: draft.id,
          });
          await storefront.createCommerceProfile({
            id: randomUUID(),
            organizationId: organization.id,
            paymentPreference: normalized.paymentPreference,
            requestSignature: signature,
            salesOrderId: reserved.id,
            source: "STOREFRONT",
          });
          await transaction.auditWriter.recordWithinTransaction({
            action: "STOREFRONT_ORDER_PLACED",
            actor: { userId: null },
            metadata: {
              channel: "ONLINE",
              lineCount: reserved.lines.length,
              orderNumber: reserved.orderNumber,
              paymentPreference: normalized.paymentPreference,
              requestId: context.requestId,
              totalMinor: reserved.totalMinor,
              unitCount: reserved.lines.reduce(
                (total, line) => total + line.quantity,
                0,
              ),
            },
            organizationId: organization.id,
            resource: "SALES_ORDER",
            resourceId: reserved.id,
          });
          return storefrontCheckoutResultSchema.parse({
            currencyCode: reserved.currencyCode,
            orderId: reserved.id,
            orderNumber: reserved.orderNumber,
            payment: null,
            paymentPreference: normalized.paymentPreference,
            status: reserved.status,
            totalMinor: reserved.totalMinor,
          });
        },
      );
      if (checkout.paymentPreference !== "ONLINE_PAYMENT") return checkout;
      if (!this.onlinePayments) {
        throw new BusinessRuleError("Online payment is unavailable.");
      }
      const paymentKey = createHash("sha256")
        .update(`storefront-payment:${normalized.idempotencyKey}`)
        .digest("hex");
      const attempt = await this.onlinePayments.initiateForCheckout({
        idempotencyKey: paymentKey,
        organizationId: organization.id,
        requestId: context.requestId,
        salesOrderId: checkout.orderId,
      });
      return storefrontCheckoutResultSchema.parse({
        ...checkout,
        payment: {
          publicToken: attempt.publicToken,
          redirectUrl: attempt.redirectUrl,
          resolutionStatus: attempt.resolutionStatus,
          status: attempt.status,
        },
      });
    });
  }

  paymentOptions(requestId: string) {
    if (!this.onlinePayments) {
      return Promise.resolve({
        data: {
          methods: ["CASH_ON_DELIVERY"] as Array<
            "CASH_ON_DELIVERY" | "ONLINE_PAYMENT"
          >,
        },
        ok: true as const,
      });
    }
    return this.onlinePayments.options(requestId);
  }

  paymentStatus(requestId: string, payload: unknown) {
    if (!this.onlinePayments) return unavailablePaymentResult(requestId);
    return this.onlinePayments.status(requestId, payload);
  }

  retryPayment(requestId: string, payload: unknown) {
    if (!this.onlinePayments) return unavailablePaymentResult(requestId);
    return this.onlinePayments.retry(requestId, payload);
  }

  paymentNotification(requestId: string, payload: unknown) {
    if (!this.onlinePayments) return unavailablePaymentResult(requestId);
    return this.onlinePayments.notification(requestId, payload);
  }

  private async resolveOrganization() {
    if (!this.organizationCode) {
      throw new BusinessRuleError("Storefront tenant is not configured.");
    }
    const organization = await this.repository.resolveActiveOrganizationByCode(
      this.organizationCode,
    );
    if (!organization) throw new NotFoundError("Storefront is unavailable.");
    return organization;
  }

  private async execute<T>(
    requestId: string,
    operation: () => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const resolvedRequestId = requestId || this.requestIdGenerator();
    try {
      return { data: await operation(), ok: true };
    } catch (error) {
      return {
        error: normalizeError(error).toShape(resolvedRequestId),
        ok: false,
      };
    }
  }
}

function unavailablePaymentResult(requestId: string) {
  return Promise.resolve({
    error: new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: "Online payment is unavailable.",
    }).toShape(requestId),
    ok: false as const,
  });
}

function normalizeCheckout(
  input: ReturnType<typeof storefrontCheckoutInputSchema.parse>,
) {
  const selections = new Map<
    string,
    { quantity: number; reviewedUnitPriceMinor: number }
  >();
  for (const line of input.lines) {
    const existing = selections.get(line.productVariantId);
    if (
      existing &&
      existing.reviewedUnitPriceMinor !== line.reviewedUnitPriceMinor
    ) {
      throw new ValidationApplicationError(
        "A product cannot have conflicting reviewed prices.",
      );
    }
    selections.set(line.productVariantId, {
      quantity: (existing?.quantity ?? 0) + line.quantity,
      reviewedUnitPriceMinor: line.reviewedUnitPriceMinor,
    });
  }
  const lines = [...selections.entries()]
    .map(([productVariantId, selection]) => {
      const { quantity, reviewedUnitPriceMinor } = selection;
      if (quantity > 20)
        throw new ValidationApplicationError(
          "A product quantity cannot exceed 20.",
        );
      return { productVariantId, quantity, reviewedUnitPriceMinor };
    })
    .sort((left, right) =>
      left.productVariantId.localeCompare(right.productVariantId),
    );
  return {
    ...input,
    customer: {
      ...input.customer,
      phone: normalizeBangladeshPhone(input.customer.phone),
    },
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    lines,
  };
}

function normalizeBangladeshPhone(value: string): string {
  const digits = value.replace(/\D/gu, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  if (!/^01[3-9][0-9]{8}$/u.test(local)) {
    throw new ValidationApplicationError(
      "Enter a valid Bangladesh mobile number.",
    );
  }
  return `+880${local.slice(1)}`;
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (
    error instanceof ValidationApplicationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  }
  if (error instanceof NotFoundError) {
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: error.publicMessage,
    });
  }
  if (error instanceof ConflictError) {
    return new ApplicationServiceError({
      code: error.message.toLowerCase().includes("idempotency")
        ? "IDEMPOTENCY_CONFLICT"
        : "CONFLICT",
      message: "This request was already used with different details.",
    });
  }
  if (error instanceof BusinessRuleError) {
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: error.publicMessage,
    });
  }
  if (error instanceof ApplicationError) {
    return new ApplicationServiceError({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
    });
  }
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    retryable: true,
  });
}

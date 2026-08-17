import { createHash } from "node:crypto";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  type CatalogMediaRepository,
  type CatalogProductManagementRepository,
  type PrimaryProductMedia,
} from "@senvo/domain";
import {
  primaryProductImageSchema,
  removePrimaryProductImageServiceInputSchema,
  setPrimaryProductImageServiceInputSchema,
  type PrimaryProductImageContract,
} from "@senvo/contracts";
import {
  productImageObjectKey,
  type ObjectStorageProvider,
  type ProductImageContentType,
} from "@senvo/storage";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

const maximumProductImageBytes = 5_242_880;

export type CatalogMediaApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  media: CatalogMediaRepository;
  products: CatalogProductManagementRepository;
  requestIdGenerator?: () => string;
  storage: ObjectStorageProvider;
  transactionManager: ApplicationTransactionManager;
};

export class CatalogMediaApplicationService {
  private readonly requestIdGenerator: () => string;

  constructor(
    private readonly dependencies: CatalogMediaApplicationServiceDependencies,
  ) {
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
  }

  getPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract | null>> {
    return this.execute(context, async (validated) => {
      const input = removePrimaryProductImageServiceInputSchema.parse(payload);
      await this.authorize(validated, "READ");
      await this.requireProduct(validated.organizationId, input.productId);
      return this.readProjection(validated.organizationId, input.productId);
    });
  }

  setPrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<PrimaryProductImageContract>> {
    return this.execute(context, async (validated) => {
      const input = setPrimaryProductImageServiceInputSchema.parse(payload);
      await this.authorize(validated, "UPDATE");
      await this.requireProduct(validated.organizationId, input.productId);
      const body = decodeAndValidateImage(
        input.contentBase64,
        input.contentType,
      );
      const requestSignature = signature({ ...input, body });
      const replay = await this.dependencies.media.findByIdempotencyKey(
        validated.organizationId,
        input.idempotencyKey,
      );
      if (replay) {
        if (replay.asset.requestSignature !== requestSignature) {
          throw new ApplicationServiceError({
            code: "IDEMPOTENCY_CONFLICT",
            message: "This request was already used with different details.",
          });
        }
        return this.toProjection(replay);
      }

      const assetId = crypto.randomUUID();
      const storageKey = productImageObjectKey({
        assetId,
        contentType: input.contentType,
        organizationId: validated.organizationId,
        productId: input.productId,
      });
      try {
        await this.dependencies.storage.upload({
          body,
          contentType: input.contentType,
          key: storageKey,
          metadata: {
            organizationId: validated.organizationId,
            productId: input.productId,
          },
        });
      } catch {
        throw storageFailure();
      }

      let current: PrimaryProductMedia;
      try {
        const result = await this.dependencies.transactionManager.execute(
          validated,
          async (transaction) => {
            if (!transaction.catalogMediaRepository) {
              throw new Error("Transactional media repository is unavailable.");
            }
            return transaction.catalogMediaRepository.replacePrimary({
              altText: input.altText,
              byteSize: body.byteLength,
              contentType: input.contentType,
              id: assetId,
              idempotencyKey: input.idempotencyKey,
              linkId: crypto.randomUUID(),
              mediaType: "IMAGE",
              organizationId: validated.organizationId,
              productId: input.productId,
              requestSignature,
              storageKey,
            });
          },
        );
        current = result.current;
      } catch (error) {
        await this.dependencies.storage
          .delete(storageKey)
          .catch(() => undefined);
        throw error;
      }
      if (current.asset.id !== assetId) {
        await this.dependencies.storage
          .delete(storageKey)
          .catch(() => undefined);
      }
      await this.cleanupArchived(validated.organizationId);
      return this.toProjection(current);
    });
  }

  removePrimaryProductImage(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<null>> {
    return this.execute(context, async (validated) => {
      const input = removePrimaryProductImageServiceInputSchema.parse(payload);
      await this.authorize(validated, "UPDATE");
      await this.requireProduct(validated.organizationId, input.productId);
      const archived = await this.dependencies.transactionManager.execute(
        validated,
        async (transaction) => {
          if (!transaction.catalogMediaRepository) {
            throw new Error("Transactional media repository is unavailable.");
          }
          return transaction.catalogMediaRepository.archivePrimary({
            organizationId: validated.organizationId,
            productId: input.productId,
          });
        },
      );
      if (!archived) throw new NotFoundError("Primary image was not found.");
      await this.cleanupArchived(validated.organizationId);
      return null;
    });
  }

  async readProjection(
    organizationId: string,
    productId: string,
  ): Promise<PrimaryProductImageContract | null> {
    const media = await this.dependencies.media.findPrimary(
      organizationId,
      productId,
    );
    return media ? this.toProjection(media) : null;
  }

  async readProjections(
    organizationId: string,
    productIds: readonly string[],
  ): Promise<Map<string, PrimaryProductImageContract>> {
    const media = await this.dependencies.media.listPrimary(
      organizationId,
      productIds,
    );
    return new Map(
      await Promise.all(
        media.map(
          async (item) =>
            [item.link.productId, await this.toProjection(item)] as const,
        ),
      ),
    );
  }

  private async toProjection(
    media: PrimaryProductMedia,
  ): Promise<PrimaryProductImageContract> {
    try {
      return primaryProductImageSchema.parse({
        altText: media.asset.altText,
        assetId: media.asset.id,
        byteSize: media.asset.byteSize,
        contentType: media.asset.contentType,
        url: await this.dependencies.storage.getUrl(media.asset.storageKey),
      });
    } catch {
      throw storageFailure();
    }
  }

  private async cleanupArchived(organizationId: string): Promise<void> {
    const keys = await this.dependencies.media.listArchivedStorageKeys(
      organizationId,
      20,
    );
    await Promise.all(
      keys.map((key) =>
        this.dependencies.storage.delete(key).catch(() => undefined),
      ),
    );
  }

  private async requireProduct(
    organizationId: string,
    productId: string,
  ): Promise<void> {
    if (
      !(await this.dependencies.products.findById(productId, organizationId))
    ) {
      throw new NotFoundError("Product was not found.");
    }
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    action: "READ" | "UPDATE",
  ): Promise<void> {
    return requireAuthorization(
      this.dependencies.authorizationService,
      context,
      {
        action,
        resource: "CATALOG",
      },
    );
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
        error: normalizeMediaError(error).toShape(context.requestId),
        ok: false,
      };
    }
  }
}

function decodeAndValidateImage(
  contentBase64: string,
  contentType: ProductImageContentType,
): Uint8Array {
  const body = Buffer.from(contentBase64, "base64");
  if (body.byteLength === 0 || body.byteLength > maximumProductImageBytes) {
    throw new ValidationApplicationServiceError(
      "contentBase64: Image must be 5 MB or smaller.",
    );
  }
  const valid =
    (contentType === "image/jpeg" &&
      body[0] === 0xff &&
      body[1] === 0xd8 &&
      body[2] === 0xff) ||
    (contentType === "image/png" &&
      body
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === "image/webp" &&
      body.subarray(0, 4).toString() === "RIFF" &&
      body.subarray(8, 12).toString() === "WEBP");
  if (!valid) {
    throw new ValidationApplicationServiceError(
      "contentBase64: File content does not match the selected image type.",
    );
  }
  return body;
}

function signature(input: {
  altText: string;
  body: Uint8Array;
  contentType: string;
  productId: string;
}): string {
  return createHash("sha256")
    .update(input.productId)
    .update("\0")
    .update(input.altText)
    .update("\0")
    .update(input.contentType)
    .update("\0")
    .update(input.body)
    .digest("hex");
}

function normalizeMediaError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
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
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: "The request conflicts with the current state.",
    });
  if (error instanceof Error && error.name === "ZodError")
    return new ValidationApplicationServiceError();
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

function storageFailure(): ApplicationServiceError {
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "Image storage is temporarily unavailable.",
    retryable: true,
  });
}

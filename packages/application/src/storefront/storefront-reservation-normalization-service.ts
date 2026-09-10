import { randomUUID } from "node:crypto";
import {
  assertValidReservationCutoff,
  calculateHistoricalReservationExpiry,
  type LegacyNullExpiryCandidateRecord,
  type LegacyReservationExclusionReason,
  type NormalizeLegacyStorefrontReservationResult,
  type SalesOrderRepository,
} from "@senvo/domain";
import type { Clock } from "../context/clock.js";
import { systemClock } from "../context/clock.js";
import type { ValidatedApplicationExecutionContext } from "../context/execution-context.js";
import { validateExecutionContext } from "../context/execution-context.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";

export const DEFAULT_NORMALIZATION_BATCH_SIZE = 25;
export const MAX_NORMALIZATION_BATCH_SIZE = 100;
export const NORMALIZATION_POLICY_VERSION = "phase-2b-v1";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidOrganizationId(organizationId: string): string {
  if (!organizationId || !UUID_REGEX.test(organizationId)) {
    throw new Error(
      `Organization ID must be a valid UUID. Received: "${organizationId}"`,
    );
  }
  return organizationId;
}

export function assertValidBatchSize(batchSize?: number): number {
  const size = batchSize ?? DEFAULT_NORMALIZATION_BATCH_SIZE;
  if (
    !Number.isInteger(size) ||
    size <= 0 ||
    size > MAX_NORMALIZATION_BATCH_SIZE
  ) {
    throw new Error(
      `Batch size must be an integer between 1 and ${MAX_NORMALIZATION_BATCH_SIZE}. Received: ${batchSize}`,
    );
  }
  return size;
}

export type CandidateManifestEntry = {
  baselineVersion: number;
  calculatedExpiresAt: string;
  dueClassification: "DUE" | "STILL_VALID";
  organizationId: string;
  paymentPreference: string | null;
  policyVersion: typeof NORMALIZATION_POLICY_VERSION;
  reservationId: string;
  reservationNumber: string;
  reservedAt: string | null;
  runReferenceTime: string;
  salesOrderId: string;
};

export type CandidateManifest = {
  candidates: CandidateManifestEntry[];
  cutoff: string;
  generatedAt: string;
  organizationId: string;
  policyVersion: typeof NORMALIZATION_POLICY_VERSION;
  totalCandidates: number;
};

export type DryRunInput = {
  batchSize?: number;
  cutoff?: Date;
  maxWork?: number;
  organizationId: string;
};

export type DryRunReport = {
  ageBuckets: {
    lessThan1Hour: number;
    oneHourTo24Hours: number;
    oneDayTo7Days: number;
    moreThan7Days: number;
  };
  batchSize: number;
  candidatesFound: number;
  cutoff: Date;
  dueCount: number;
  exclusionCounts: Record<LegacyReservationExclusionReason, number>;
  manifest: CandidateManifest;
  organizationId: string;
  paymentPreferenceCounts: Record<string, number>;
  scannedCount: number;
  stillValidCount: number;
};

export type ExecuteApprovedManifestInput = {
  applicationTime?: Date;
  approvedManifest?: CandidateManifest;
  approvedSalesOrderIds?: string[];
  cutoff?: Date;
  expectedVersions?: Record<string, number>;
  organizationId: string;
};

export type ExecutionReport = {
  committedCount: number;
  cutoff: Date;
  deferredCount: number;
  details: NormalizeLegacyStorefrontReservationResult[];
  failedCount: number;
  organizationId: string;
  reclaimedCount: number;
  skippedCount: number;
  totalProcessed: number;
};

export class NormalizationExecutionStoppedError extends Error {
  readonly partialReport: ExecutionReport;
  readonly failedSalesOrderId?: string;
  override readonly cause?: unknown;

  constructor(
    message: string,
    partialReport: ExecutionReport,
    failedSalesOrderId?: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "NormalizationExecutionStoppedError";
    this.partialReport = partialReport;
    this.failedSalesOrderId = failedSalesOrderId;
    this.cause = cause;
  }
}

export type StorefrontReservationNormalizationDependencies = {
  clock?: Clock;
  requestIdGenerator?: () => string;
  salesOrders?: SalesOrderRepository;
  salesOrderRepository?: SalesOrderRepository;
  transactionManager: ApplicationTransactionManager;
};

export class StorefrontReservationNormalizationService {
  private readonly clock: Clock;
  private readonly requestIdGenerator: () => string;
  private readonly salesOrders?: SalesOrderRepository;
  private readonly transactionManager: ApplicationTransactionManager;

  constructor(dependencies: StorefrontReservationNormalizationDependencies) {
    this.clock = dependencies.clock ?? systemClock;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => `req_norm_${randomUUID()}`);
    this.salesOrders =
      dependencies.salesOrders ?? dependencies.salesOrderRepository;
    this.transactionManager = dependencies.transactionManager;
  }

  async dryRun(input: DryRunInput): Promise<DryRunReport> {
    const organizationId = assertValidOrganizationId(input.organizationId);
    const batchSize = assertValidBatchSize(input.batchSize);
    const cutoff = assertValidReservationCutoff(
      input.cutoff ?? this.clock.now(),
    );

    if (cutoff.getTime() > this.clock.now().getTime()) {
      throw new Error("Cutoff timestamp cannot be in the future.");
    }

    const maxWork =
      input.maxWork && input.maxWork > 0 ? input.maxWork : Infinity;

    const manifestEntries: CandidateManifestEntry[] = [];
    const paymentPreferenceCounts: Record<string, number> = {};
    const exclusionCounts: Record<LegacyReservationExclusionReason, number> = {
      ALREADY_HAS_EXPIRY: 0,
      INTEGRITY_MISMATCH: 0,
      INVALID_RESERVED_AT: 0,
      NOT_ACTIVE: 0,
      NOT_STOREFRONT: 0,
      PAYMENT_BATCH_EXPOSED: 0,
      PAYMENT_EXPOSED: 0,
      TERMINAL_ORDER: 0,
    };
    const ageBuckets = {
      lessThan1Hour: 0,
      moreThan7Days: 0,
      oneDayTo7Days: 0,
      oneHourTo24Hours: 0,
    };

    let dueCount = 0;
    let stillValidCount = 0;
    let scannedCount = 0;
    let cursor: { createdAt: Date; id: string } | undefined;

    while (scannedCount < maxWork) {
      const takeLimit = Math.min(batchSize, maxWork - scannedCount);
      const batch: LegacyNullExpiryCandidateRecord[] =
        await this.fetchCandidatesBatch(organizationId, takeLimit, cursor);

      if (batch.length === 0) {
        break;
      }

      for (const candidate of batch) {
        scannedCount += 1;
        cursor = { createdAt: candidate.createdAt, id: candidate.id };

        const prefKey = candidate.paymentPreference ?? "UNKNOWN";
        paymentPreferenceCounts[prefKey] =
          (paymentPreferenceCounts[prefKey] ?? 0) + 1;

        if (!candidate.reservedAt) {
          exclusionCounts.INVALID_RESERVED_AT += 1;
          continue;
        }

        if (candidate.hasOnlinePaymentAttempts) {
          exclusionCounts.PAYMENT_EXPOSED += 1;
          continue;
        }

        if (candidate.hasPaymentBatches) {
          exclusionCounts.PAYMENT_BATCH_EXPOSED += 1;
          continue;
        }

        const ageMs = cutoff.getTime() - candidate.reservedAt.getTime();
        if (ageMs < 0) {
          exclusionCounts.INVALID_RESERVED_AT += 1;
          continue;
        }

        if (ageMs < 60 * 60 * 1000) {
          ageBuckets.lessThan1Hour += 1;
        } else if (ageMs < 24 * 60 * 60 * 1000) {
          ageBuckets.oneHourTo24Hours += 1;
        } else if (ageMs < 7 * 24 * 60 * 60 * 1000) {
          ageBuckets.oneDayTo7Days += 1;
        } else {
          ageBuckets.moreThan7Days += 1;
        }

        if (
          candidate.paymentPreference !== "ONLINE_PAYMENT" &&
          candidate.paymentPreference !== "CASH_ON_DELIVERY"
        ) {
          exclusionCounts.INTEGRITY_MISMATCH += 1;
          continue;
        }

        try {
          const { calculatedExpiresAt, isDue } =
            calculateHistoricalReservationExpiry({
              paymentPreference: candidate.paymentPreference,
              referenceTime: cutoff,
              reservedAt: candidate.reservedAt,
            });

          if (isDue) {
            dueCount += 1;
          } else {
            stillValidCount += 1;
          }

          manifestEntries.push({
            baselineVersion: candidate.reservationVersion,
            calculatedExpiresAt: calculatedExpiresAt.toISOString(),
            dueClassification: isDue ? "DUE" : "STILL_VALID",
            organizationId,
            paymentPreference: candidate.paymentPreference,
            policyVersion: NORMALIZATION_POLICY_VERSION,
            reservationId: candidate.inventoryReservationId,
            reservationNumber: candidate.reservationNumber,
            reservedAt: candidate.reservedAt.toISOString(),
            runReferenceTime: cutoff.toISOString(),
            salesOrderId: candidate.id,
          });
        } catch {
          exclusionCounts.INVALID_RESERVED_AT += 1;
        }
      }

      if (batch.length < takeLimit) {
        break;
      }
    }

    const manifest: CandidateManifest = {
      candidates: manifestEntries,
      cutoff: cutoff.toISOString(),
      generatedAt: this.clock.now().toISOString(),
      organizationId,
      policyVersion: NORMALIZATION_POLICY_VERSION,
      totalCandidates: manifestEntries.length,
    };

    return {
      ageBuckets,
      batchSize,
      candidatesFound: manifestEntries.length,
      cutoff,
      dueCount,
      exclusionCounts,
      manifest,
      organizationId,
      paymentPreferenceCounts,
      scannedCount,
      stillValidCount,
    };
  }

  async executeApprovedManifest(
    input: ExecuteApprovedManifestInput,
  ): Promise<ExecutionReport> {
    const organizationId = assertValidOrganizationId(input.organizationId);
    let effectiveCutoff: Date;
    let targetIds: string[] = [];
    const expectedVersions: Record<string, number> = {
      ...(input.expectedVersions ?? {}),
    };

    if (input.approvedManifest) {
      const manifest = input.approvedManifest;
      const manifestPolicy = (manifest as { policyVersion?: unknown })
        .policyVersion;
      if (manifestPolicy !== NORMALIZATION_POLICY_VERSION) {
        throw new Error(
          `Unsupported policy version: "${String(manifestPolicy)}". Expected: "${NORMALIZATION_POLICY_VERSION}".`,
        );
      }
      if (manifest.organizationId !== organizationId) {
        throw new Error(
          `Manifest organization (${manifest.organizationId}) does not match requested organization (${organizationId}).`,
        );
      }
      if (!Array.isArray(manifest.candidates)) {
        throw new Error("Malformed manifest: candidates must be an array.");
      }
      if (manifest.totalCandidates !== manifest.candidates.length) {
        throw new Error(
          `Malformed manifest: candidate count mismatch (totalCandidates: ${manifest.totalCandidates}, array length: ${manifest.candidates.length}).`,
        );
      }

      const manifestCutoff = new Date(manifest.cutoff);
      if (Number.isNaN(manifestCutoff.getTime())) {
        throw new Error("Manifest has invalid cutoff timestamp.");
      }

      if (input.cutoff && input.cutoff.getTime() !== manifestCutoff.getTime()) {
        throw new Error(
          "Conflicting cutoff override: requested cutoff does not match approved manifest cutoff.",
        );
      }

      effectiveCutoff = manifestCutoff;

      for (const entry of manifest.candidates) {
        if (!entry.salesOrderId || typeof entry.salesOrderId !== "string") {
          throw new Error(
            "Malformed manifest: candidate entry is missing salesOrderId.",
          );
        }
        const candidatePolicy = (entry as { policyVersion?: unknown })
          .policyVersion;
        if (candidatePolicy !== NORMALIZATION_POLICY_VERSION) {
          throw new Error(
            `Malformed manifest: candidate entry policy version "${String(candidatePolicy)}" is unsupported.`,
          );
        }
        targetIds.push(entry.salesOrderId);
        expectedVersions[entry.salesOrderId] = entry.baselineVersion;
      }
    } else if (
      input.approvedSalesOrderIds &&
      input.approvedSalesOrderIds.length > 0
    ) {
      effectiveCutoff = assertValidReservationCutoff(
        input.cutoff ?? this.clock.now(),
      );
      targetIds = [...input.approvedSalesOrderIds];
    } else {
      throw new Error(
        "Execution requires an approved candidate manifest or explicit approved order IDs.",
      );
    }

    // PRODUCTION SAFETY: Reject invalid/future cutoff BEFORE starting mutations.
    // Future cutoff must produce zero mutations and zero audits.
    if (effectiveCutoff.getTime() > this.clock.now().getTime()) {
      throw new Error("Cutoff timestamp cannot be in the future.");
    }

    const applicationTime = input.applicationTime ?? this.clock.now();

    let committedCount = 0;
    let skippedCount = 0;
    let deferredCount = 0;
    let failedCount = 0;
    let reclaimedCount = 0;
    const details: NormalizeLegacyStorefrontReservationResult[] = [];

    for (const salesOrderId of targetIds) {
      const execContext = this.createExecutionContext(organizationId);

      try {
        const result = await this.transactionManager.execute(
          execContext,
          async (transactionContext) => {
            const sales = transactionContext.salesOrderLifecycleRepository;
            if (!sales) {
              throw new Error(
                "Sales order lifecycle repository is unavailable in transaction context.",
              );
            }

            const outcome = await sales.normalizeLegacyStorefrontReservation({
              applicationTime,
              cutoff: effectiveCutoff,
              expectedReservationVersion: expectedVersions[salesOrderId],
              organizationId,
              salesOrderId,
            });

            if (outcome.status === "NORMALIZED_STILL_VALID") {
              await transactionContext.auditWriter.recordWithinTransaction({
                action: "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
                actor: { userId: null },
                metadata: {
                  calculatedExpiresAt: outcome.calculatedExpiresAt
                    ? outcome.calculatedExpiresAt.toISOString()
                    : null,
                  cutoff: effectiveCutoff.toISOString(),
                  orderNumber: outcome.orderNumber ?? null,
                  paymentPreference: outcome.paymentPreference ?? null,
                  policyVersion: NORMALIZATION_POLICY_VERSION,
                  previousExpiresAt: null,
                  reclaimed: false,
                  reservationId: outcome.reservationId ?? null,
                  reservationNumber: outcome.reservationNumber ?? null,
                  reservedAt: outcome.reservedAt
                    ? outcome.reservedAt.toISOString()
                    : null,
                  versionTransition: `${outcome.reservationVersionBefore}->${outcome.reservationVersionAfter}`,
                },
                organizationId,
                resource: "SALES_ORDER",
                resourceId: outcome.orderId,
              });
            } else if (outcome.status === "NORMALIZED_AND_RECLAIMED") {
              await transactionContext.auditWriter.recordWithinTransaction({
                action: "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
                actor: { userId: null },
                metadata: {
                  calculatedExpiresAt: outcome.calculatedExpiresAt
                    ? outcome.calculatedExpiresAt.toISOString()
                    : null,
                  cutoff: effectiveCutoff.toISOString(),
                  orderNumber: outcome.orderNumber ?? null,
                  paymentPreference: outcome.paymentPreference ?? null,
                  policyVersion: NORMALIZATION_POLICY_VERSION,
                  previousExpiresAt: null,
                  reclaimed: true,
                  reservationId: outcome.reservationId ?? null,
                  reservationNumber: outcome.reservationNumber ?? null,
                  reservedAt: outcome.reservedAt
                    ? outcome.reservedAt.toISOString()
                    : null,
                  versionTransition: `${outcome.reservationVersionBefore}->${outcome.reservationVersionAfter}`,
                },
                organizationId,
                resource: "SALES_ORDER",
                resourceId: outcome.orderId,
              });

              await transactionContext.auditWriter.recordWithinTransaction({
                action: "STOREFRONT_RESERVATION_EXPIRED",
                actor: { userId: null },
                metadata: {
                  expiresAt: outcome.calculatedExpiresAt
                    ? outcome.calculatedExpiresAt.toISOString()
                    : null,
                  expiryCutoff: effectiveCutoff.toISOString(),
                  orderNumber: outcome.orderNumber ?? null,
                  reservationId: outcome.reservationId ?? null,
                  reservationNumber: outcome.reservationNumber ?? null,
                },
                organizationId,
                resource: "SALES_ORDER",
                resourceId: outcome.orderId,
              });
            }

            return outcome;
          },
        );

        details.push(result);

        if (
          result.status === "NORMALIZED_STILL_VALID" ||
          result.status === "NORMALIZED_AND_RECLAIMED"
        ) {
          committedCount += 1;
          if (result.reclaimed) {
            reclaimedCount += 1;
          }
        } else if (result.status === "SKIPPED") {
          skippedCount += 1;
        } else if (result.status === "DEFERRED") {
          deferredCount += 1;
        }
      } catch (err: unknown) {
        failedCount += 1;
        const partialReport: ExecutionReport = {
          committedCount,
          cutoff: effectiveCutoff,
          deferredCount,
          details,
          failedCount,
          organizationId,
          reclaimedCount,
          skippedCount,
          totalProcessed: targetIds.length,
        };
        throw new NormalizationExecutionStoppedError(
          `Normalization stopped due to unexpected error on order ${salesOrderId}: ${(err as Error).message}`,
          partialReport,
          salesOrderId,
          err,
        );
      }
    }

    return {
      committedCount,
      cutoff: effectiveCutoff,
      deferredCount,
      details,
      failedCount,
      organizationId,
      reclaimedCount,
      skippedCount,
      totalProcessed: targetIds.length,
    };
  }

  private async fetchCandidatesBatch(
    organizationId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<LegacyNullExpiryCandidateRecord[]> {
    if (this.salesOrders) {
      return this.salesOrders.findLegacyNullExpiryCandidates({
        cursor,
        limit,
        organizationId,
      });
    }

    const scanContext = this.createExecutionContext(organizationId);
    return this.transactionManager.execute(
      scanContext,
      async (transactionContext) => {
        const sales = transactionContext.salesOrderLifecycleRepository;
        if (!sales) {
          return [];
        }
        return sales.findLegacyNullExpiryCandidates({
          cursor,
          limit,
          organizationId,
        });
      },
    );
  }

  private createExecutionContext(
    organizationId: string,
  ): ValidatedApplicationExecutionContext {
    return validateExecutionContext({
      actorType: "SYSTEM",
      authenticationState: "ANONYMOUS",
      organizationId,
      permissions: null,
      requestId: this.requestIdGenerator(),
      source: "STOREFRONT",
      userId: null,
    });
  }
}

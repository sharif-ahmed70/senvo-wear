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

export function assertValidCandidateManifest(
  manifest: unknown,
  expectedOrganizationId?: string,
): CandidateManifest {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Candidate manifest must be a non-null object.");
  }

  const raw = manifest as Record<string, unknown>;

  if (
    typeof raw.organizationId !== "string" ||
    !UUID_REGEX.test(raw.organizationId)
  ) {
    throw new Error(
      `Candidate manifest organizationId must be a valid UUID. Received: "${String(raw.organizationId)}"`,
    );
  }

  if (expectedOrganizationId && raw.organizationId !== expectedOrganizationId) {
    throw new Error(
      `Manifest organization (${raw.organizationId}) does not match requested organization (${expectedOrganizationId}).`,
    );
  }

  if (raw.policyVersion !== NORMALIZATION_POLICY_VERSION) {
    throw new Error(
      `Unsupported policy version: "${String(raw.policyVersion)}". Expected: "${NORMALIZATION_POLICY_VERSION}".`,
    );
  }

  if (typeof raw.cutoff !== "string") {
    throw new Error("Manifest cutoff must be an ISO date string.");
  }
  const cutoffDate = new Date(raw.cutoff);
  if (Number.isNaN(cutoffDate.getTime())) {
    throw new Error("Manifest has invalid cutoff timestamp.");
  }

  if (typeof raw.generatedAt !== "string") {
    throw new Error("Manifest generatedAt must be an ISO date string.");
  }
  const generatedAtDate = new Date(raw.generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) {
    throw new Error("Manifest has invalid generatedAt timestamp.");
  }

  if (!Array.isArray(raw.candidates)) {
    throw new Error("Malformed manifest: candidates must be an array.");
  }

  if (
    typeof raw.totalCandidates !== "number" ||
    !Number.isInteger(raw.totalCandidates) ||
    raw.totalCandidates < 0 ||
    raw.totalCandidates !== raw.candidates.length
  ) {
    throw new Error(
      `Malformed manifest: candidate count mismatch (totalCandidates: ${String(raw.totalCandidates)}, array length: ${raw.candidates.length}).`,
    );
  }

  const seenSalesOrderIds = new Set<string>();
  const validatedCandidates: CandidateManifestEntry[] = [];
  const rawCandidates = raw.candidates as unknown[];

  for (let i = 0; i < rawCandidates.length; i++) {
    const item = rawCandidates[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `Malformed manifest: candidate entry at index ${i} must be an object.`,
      );
    }

    const c = item as Record<string, unknown>;

    if (
      typeof c.salesOrderId !== "string" ||
      !UUID_REGEX.test(c.salesOrderId)
    ) {
      throw new Error(
        `Malformed manifest: candidate entry at index ${i} has invalid salesOrderId.`,
      );
    }
    if (seenSalesOrderIds.has(c.salesOrderId)) {
      throw new Error(
        `Malformed manifest: duplicate salesOrderId "${c.salesOrderId}" found in candidates.`,
      );
    }
    seenSalesOrderIds.add(c.salesOrderId);

    if (
      typeof c.reservationId !== "string" ||
      !UUID_REGEX.test(c.reservationId)
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid reservationId.`,
      );
    }

    if (
      typeof c.reservationNumber !== "string" ||
      c.reservationNumber.trim().length === 0
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid reservationNumber.`,
      );
    }

    if (
      typeof c.organizationId !== "string" ||
      c.organizationId !== raw.organizationId
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has mismatched organizationId.`,
      );
    }

    if (
      typeof c.baselineVersion !== "number" ||
      !Number.isInteger(c.baselineVersion) ||
      c.baselineVersion <= 0
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid baselineVersion. Must be a positive integer.`,
      );
    }

    if (c.policyVersion !== NORMALIZATION_POLICY_VERSION) {
      throw new Error(
        `Malformed manifest: candidate entry policy version "${String(c.policyVersion)}" is unsupported.`,
      );
    }

    if (
      c.paymentPreference !== "ONLINE_PAYMENT" &&
      c.paymentPreference !== "CASH_ON_DELIVERY"
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has unsupported paymentPreference "${String(c.paymentPreference)}".`,
      );
    }

    if (typeof c.reservedAt !== "string") {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid reservedAt.`,
      );
    }
    const reservedAtDate = new Date(c.reservedAt);
    if (Number.isNaN(reservedAtDate.getTime())) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has unparseable reservedAt date.`,
      );
    }

    if (typeof c.calculatedExpiresAt !== "string") {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid calculatedExpiresAt.`,
      );
    }
    const calculatedExpiresAtDate = new Date(c.calculatedExpiresAt);
    if (Number.isNaN(calculatedExpiresAtDate.getTime())) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has unparseable calculatedExpiresAt date.`,
      );
    }

    if (
      c.dueClassification !== "DUE" &&
      c.dueClassification !== "STILL_VALID"
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid dueClassification "${String(c.dueClassification)}".`,
      );
    }

    if (typeof c.runReferenceTime !== "string") {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has invalid runReferenceTime.`,
      );
    }
    const runRefDate = new Date(c.runReferenceTime);
    if (Number.isNaN(runRefDate.getTime())) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} has unparseable runReferenceTime date.`,
      );
    }
    if (runRefDate.getTime() !== cutoffDate.getTime()) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} runReferenceTime does not match manifest cutoff.`,
      );
    }

    let recalculated: ReturnType<typeof calculateHistoricalReservationExpiry>;
    try {
      recalculated = calculateHistoricalReservationExpiry({
        paymentPreference: c.paymentPreference,
        referenceTime: cutoffDate,
        reservedAt: reservedAtDate,
      });
    } catch (err: unknown) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} failed policy recalculation: ${(err as Error).message}`,
      );
    }

    if (
      recalculated.calculatedExpiresAt.getTime() !==
      calculatedExpiresAtDate.getTime()
    ) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} calculatedExpiresAt does not match policy recalculation.`,
      );
    }

    const expectedDue = recalculated.isDue ? "DUE" : "STILL_VALID";
    if (c.dueClassification !== expectedDue) {
      throw new Error(
        `Malformed manifest: candidate entry for order ${c.salesOrderId} dueClassification does not match policy recalculation.`,
      );
    }

    validatedCandidates.push({
      baselineVersion: c.baselineVersion,
      calculatedExpiresAt: c.calculatedExpiresAt,
      dueClassification: c.dueClassification,
      organizationId: c.organizationId,
      paymentPreference: c.paymentPreference,
      policyVersion: NORMALIZATION_POLICY_VERSION,
      reservationId: c.reservationId,
      reservationNumber: c.reservationNumber,
      reservedAt: c.reservedAt,
      runReferenceTime: c.runReferenceTime,
      salesOrderId: c.salesOrderId,
    });
  }

  return {
    candidates: validatedCandidates,
    cutoff: raw.cutoff,
    generatedAt: raw.generatedAt,
    organizationId: raw.organizationId,
    policyVersion: NORMALIZATION_POLICY_VERSION,
    totalCandidates: raw.totalCandidates,
  };
}

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
          (candidate.channel !== undefined && candidate.channel !== "ONLINE") ||
          (candidate.reservationReferenceType !== undefined &&
            candidate.reservationReferenceType !== "SALES_ORDER") ||
          (candidate.reservationReferenceId !== undefined &&
            candidate.reservationReferenceId !== candidate.id) ||
          candidate.confirmedAt != null ||
          candidate.cancelledAt != null ||
          candidate.fulfilledAt != null ||
          candidate.fulfillmentMovementId != null ||
          candidate.reservationConfirmedAt != null ||
          candidate.reservationReleasedAt != null ||
          candidate.reservationExpiredAt != null ||
          (candidate.paymentPreference !== "ONLINE_PAYMENT" &&
            candidate.paymentPreference !== "CASH_ON_DELIVERY")
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
    const expectedVersions: Record<string, number> = {
      ...(input.expectedVersions ?? {}),
    };

    interface ExecutionTarget {
      expectedReservationId?: string;
      expectedReservationNumber?: string;
      expectedReservationVersion?: number;
      salesOrderId: string;
    }

    let targets: ExecutionTarget[] = [];

    if (input.approvedManifest) {
      const validatedManifest = assertValidCandidateManifest(
        input.approvedManifest,
        organizationId,
      );

      const manifestCutoff = new Date(validatedManifest.cutoff);
      if (input.cutoff && input.cutoff.getTime() !== manifestCutoff.getTime()) {
        throw new Error(
          "Conflicting cutoff override: requested cutoff does not match approved manifest cutoff.",
        );
      }

      effectiveCutoff = manifestCutoff;

      targets = validatedManifest.candidates.map((entry) => ({
        expectedReservationId: entry.reservationId,
        expectedReservationNumber: entry.reservationNumber,
        expectedReservationVersion:
          expectedVersions[entry.salesOrderId] ?? entry.baselineVersion,
        salesOrderId: entry.salesOrderId,
      }));
    } else if (
      input.approvedSalesOrderIds &&
      input.approvedSalesOrderIds.length > 0
    ) {
      effectiveCutoff = assertValidReservationCutoff(
        input.cutoff ?? this.clock.now(),
      );
      targets = input.approvedSalesOrderIds.map((id) => ({
        expectedReservationVersion: expectedVersions[id],
        salesOrderId: id,
      }));
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
    let totalAttempted = 0;
    const details: NormalizeLegacyStorefrontReservationResult[] = [];

    for (const target of targets) {
      totalAttempted += 1;
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
              expectedReservationId: target.expectedReservationId,
              expectedReservationNumber: target.expectedReservationNumber,
              expectedReservationVersion: target.expectedReservationVersion,
              organizationId,
              salesOrderId: target.salesOrderId,
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
          totalProcessed: totalAttempted,
        };
        throw new NormalizationExecutionStoppedError(
          `Normalization stopped due to unexpected error on order ${target.salesOrderId}: ${(err as Error).message}`,
          partialReport,
          target.salesOrderId,
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
      totalProcessed: totalAttempted,
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

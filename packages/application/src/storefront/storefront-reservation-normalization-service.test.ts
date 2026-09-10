import { describe, expect, it, vi } from "vitest";
import {
  NormalizationExecutionStoppedError,
  StorefrontReservationNormalizationService,
  assertValidBatchSize,
  assertValidCandidateManifest,
  assertValidOrganizationId,
} from "./storefront-reservation-normalization-service.js";
import type {
  LegacyNullExpiryCandidateRecord,
  NormalizeLegacyStorefrontReservationRecord,
  NormalizeLegacyStorefrontReservationResult,
  SalesOrderRepository,
} from "@senvo/domain";
import type { ApplicationTransactionManager } from "../context/transaction.js";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const FIXED_NOW = new Date("2026-09-10T12:00:00.000Z");

function createMockClock(now = FIXED_NOW) {
  return { now: () => now };
}

describe("StorefrontReservationNormalizationService", () => {
  describe("validation helpers", () => {
    it("validates organization UUID format", () => {
      expect(assertValidOrganizationId(ORG_ID)).toBe(ORG_ID);
      expect(() => assertValidOrganizationId("invalid-uuid")).toThrow(
        "Organization ID must be a valid UUID",
      );
      expect(() => assertValidOrganizationId("")).toThrow(
        "Organization ID must be a valid UUID",
      );
    });

    it("validates batch size bounds", () => {
      expect(assertValidBatchSize(undefined)).toBe(25);
      expect(assertValidBatchSize(50)).toBe(50);
      expect(assertValidBatchSize(100)).toBe(100);
      expect(() => assertValidBatchSize(0)).toThrow(
        "Batch size must be an integer between 1 and 100",
      );
      expect(() => assertValidBatchSize(101)).toThrow(
        "Batch size must be an integer between 1 and 100",
      );
      expect(() => assertValidBatchSize(-5)).toThrow(
        "Batch size must be an integer between 1 and 100",
      );
    });
  });

  describe("dryRun", () => {
    it("rejects future cutoff dates", async () => {
      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: {} as ApplicationTransactionManager,
      });

      await expect(
        service.dryRun({
          cutoff: new Date("2026-09-10T13:00:00.000Z"),
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow("Cutoff timestamp cannot be in the future.");
    });

    it("discovers candidates, classifies due vs still-valid, and groups by age/preference", async () => {
      const candidates: LegacyNullExpiryCandidateRecord[] = [
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          id: "11111111-1111-4111-8111-111111111111",
          inventoryReservationId: "res-1",
          orderNumber: "ORD-001",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-001",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"), // +30m = 11:30 <= 12:00 (DUE)
        },
        {
          createdAt: new Date("2026-09-10T11:45:00.000Z"),
          id: "22222222-1111-4111-8111-111111111111",
          inventoryReservationId: "res-2",
          orderNumber: "ORD-002",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-002",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:45:00.000Z"), // +30m = 12:15 > 12:00 (STILL_VALID)
        },
        {
          createdAt: new Date("2026-09-09T10:00:00.000Z"),
          id: "33333333-1111-4111-8111-111111111111",
          inventoryReservationId: "res-3",
          orderNumber: "ORD-003",
          paymentPreference: "CASH_ON_DELIVERY",
          reservationNumber: "RES-003",
          reservationVersion: 2,
          reservedAt: new Date("2026-09-09T10:00:00.000Z"), // +24h = 09-10 10:00 <= 12:00 (DUE, 26h ago)
        },
        {
          createdAt: new Date("2026-09-10T08:00:00.000Z"),
          id: "44444444-1111-4111-8111-111111111111",
          inventoryReservationId: "res-4",
          orderNumber: "ORD-004",
          paymentPreference: null, // unsupported
          reservationNumber: "RES-004",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T08:00:00.000Z"),
        },
      ];

      const mockSalesOrders: Partial<SalesOrderRepository> = {
        findLegacyNullExpiryCandidates: vi.fn().mockResolvedValue(candidates),
      };

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        salesOrders: mockSalesOrders as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      });

      const report = await service.dryRun({
        cutoff: FIXED_NOW,
        organizationId: ORG_ID,
      });

      expect(report.candidatesFound).toBe(3); // 3 valid preferences
      expect(report.dueCount).toBe(2);
      expect(report.stillValidCount).toBe(1);
      expect(report.scannedCount).toBe(4);
      expect(report.paymentPreferenceCounts.ONLINE_PAYMENT).toBe(2);
      expect(report.paymentPreferenceCounts.CASH_ON_DELIVERY).toBe(1);
      expect(report.paymentPreferenceCounts.UNKNOWN).toBe(1);
      expect(report.exclusionCounts.INTEGRITY_MISMATCH).toBe(1);

      expect(report.manifest.candidates).toHaveLength(3);
      expect(report.manifest.candidates[0]).toEqual({
        baselineVersion: 1,
        calculatedExpiresAt: "2026-09-10T11:30:00.000Z",
        dueClassification: "DUE",
        organizationId: ORG_ID,
        paymentPreference: "ONLINE_PAYMENT",
        policyVersion: "phase-2b-v1",
        reservationId: "res-1",
        reservationNumber: "RES-001",
        reservedAt: "2026-09-10T11:00:00.000Z",
        runReferenceTime: FIXED_NOW.toISOString(),
        salesOrderId: "11111111-1111-4111-8111-111111111111",
      });
    });
  });

  describe("executeApprovedManifest", () => {
    it("processes each order in separate transaction and writes expected audits", async () => {
      const recordsToReturn: Record<
        string,
        NormalizeLegacyStorefrontReservationResult
      > = {
        "ord-1": {
          calculatedExpiresAt: new Date("2026-09-10T12:30:00.000Z"),
          orderId: "ord-1",
          orderNumber: "ORD-001",
          paymentPreference: "ONLINE_PAYMENT",
          previousExpiresAt: null,
          reclaimed: false,
          reservationId: "res-1",
          reservationNumber: "RES-001",
          reservationVersionAfter: 2,
          reservationVersionBefore: 1,
          reservedAt: new Date("2026-09-10T12:00:00.000Z"),
          status: "NORMALIZED_STILL_VALID",
        },
        "ord-2": {
          calculatedExpiresAt: new Date("2026-09-10T11:30:00.000Z"),
          orderId: "ord-2",
          orderNumber: "ORD-002",
          paymentPreference: "ONLINE_PAYMENT",
          previousExpiresAt: null,
          reclaimed: true,
          reservationId: "res-2",
          reservationNumber: "RES-002",
          reservationVersionAfter: 3,
          reservationVersionBefore: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
          status: "NORMALIZED_AND_RECLAIMED",
        },
      };

      const recordedAudits: Array<{ action: string; resourceId: string }> = [];

      const mockTransactionManager = {
        execute: async <T>(
          _context: unknown,
          operation: (txContext: unknown) => Promise<T>,
        ): Promise<T> => {
          const transactionContext = {
            auditWriter: {
              recordWithinTransaction: (entry: {
                action: string;
                resourceId: string;
              }): Promise<void> => {
                recordedAudits.push({
                  action: entry.action,
                  resourceId: entry.resourceId,
                });
                return Promise.resolve();
              },
            },
            salesOrderLifecycleRepository: {
              normalizeLegacyStorefrontReservation: (
                record: NormalizeLegacyStorefrontReservationRecord,
              ): Promise<NormalizeLegacyStorefrontReservationResult> => {
                return Promise.resolve(recordsToReturn[record.salesOrderId]!);
              },
            },
          };
          return await operation(transactionContext);
        },
      } as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: mockTransactionManager,
      });

      const report = await service.executeApprovedManifest({
        approvedSalesOrderIds: ["ord-1", "ord-2"],
        cutoff: FIXED_NOW,
        organizationId: ORG_ID,
      });

      expect(report.totalProcessed).toBe(2);
      expect(report.committedCount).toBe(2);
      expect(report.reclaimedCount).toBe(1);
      expect(report.skippedCount).toBe(0);
      expect(report.deferredCount).toBe(0);
      expect(report.failedCount).toBe(0);

      // ord-1: 1 audit (NORMALIZED)
      // ord-2: 2 audits (NORMALIZED + EXPIRED)
      expect(recordedAudits).toEqual([
        {
          action: "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
          resourceId: "ord-1",
        },
        {
          action: "STOREFRONT_RESERVATION_EXPIRY_NORMALIZED",
          resourceId: "ord-2",
        },
        {
          action: "STOREFRONT_RESERVATION_EXPIRED",
          resourceId: "ord-2",
        },
      ]);
    });

    it("rejects manifest with mismatched organization ID", async () => {
      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: {} as ApplicationTransactionManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: FIXED_NOW.toISOString(),
            generatedAt: FIXED_NOW.toISOString(),
            organizationId: "33333333-3333-4333-8333-333333333333",
            policyVersion: "phase-2b-v1",
            totalCandidates: 0,
          },
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow("does not match requested organization");
    });

    it("rejects manifest with unsupported policy version", async () => {
      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: {} as ApplicationTransactionManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: FIXED_NOW.toISOString(),
            generatedAt: FIXED_NOW.toISOString(),
            organizationId: ORG_ID,
            policyVersion: "unsupported-v2" as unknown as "phase-2b-v1",
            totalCandidates: 0,
          },
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow('Unsupported policy version: "unsupported-v2"');
    });

    it("rejects execution if cutoff override conflicts with manifest cutoff", async () => {
      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: {} as ApplicationTransactionManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: "2026-09-10T10:00:00.000Z",
            generatedAt: FIXED_NOW.toISOString(),
            organizationId: ORG_ID,
            policyVersion: "phase-2b-v1",
            totalCandidates: 0,
          },
          cutoff: new Date("2026-09-10T11:00:00.000Z"),
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow("Conflicting cutoff override");
    });

    it("rejects execution if effective cutoff is in the future", async () => {
      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(new Date("2026-09-10T10:00:00.000Z")),
        transactionManager: {} as ApplicationTransactionManager,
      });

      await expect(
        service.executeApprovedManifest({
          approvedManifest: {
            candidates: [],
            cutoff: "2026-09-10T12:00:00.000Z",
            generatedAt: "2026-09-10T12:00:00.000Z",
            organizationId: ORG_ID,
            policyVersion: "phase-2b-v1",
            totalCandidates: 0,
          },
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow("Cutoff timestamp cannot be in the future.");
    });

    it("stops loop and throws NormalizationExecutionStoppedError on unexpected transaction error", async () => {
      let callCount = 0;
      const mockTransactionManager = {
        execute: async <T>(
          _context: unknown,
          operation: (txContext: unknown) => Promise<T>,
        ): Promise<T> => {
          callCount++;
          if (callCount === 2) {
            throw new Error("Database deadlock / connection lost");
          }
          const transactionContext = {
            auditWriter: {
              recordWithinTransaction: () => Promise.resolve(),
            },
            salesOrderLifecycleRepository: {
              normalizeLegacyStorefrontReservation: () =>
                Promise.resolve({
                  calculatedExpiresAt: new Date("2026-09-10T12:30:00.000Z"),
                  orderId: "ord-1",
                  orderNumber: "ORD-001",
                  paymentPreference: "ONLINE_PAYMENT",
                  previousExpiresAt: null,
                  reclaimed: false,
                  reservationId: "res-1",
                  reservationNumber: "RES-001",
                  reservationVersionAfter: 2,
                  reservationVersionBefore: 1,
                  reservedAt: new Date("2026-09-10T12:00:00.000Z"),
                  status: "NORMALIZED_STILL_VALID",
                }),
            },
          };
          return await operation(transactionContext);
        },
      } as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: mockTransactionManager,
      });

      try {
        await service.executeApprovedManifest({
          approvedSalesOrderIds: ["ord-1", "ord-2", "ord-3"],
          cutoff: FIXED_NOW,
          organizationId: ORG_ID,
        });
        expect.unreachable(
          "Should have thrown NormalizationExecutionStoppedError",
        );
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(NormalizationExecutionStoppedError);
        const stoppedError = error as NormalizationExecutionStoppedError;
        expect(stoppedError.name).toBe("NormalizationExecutionStoppedError");
        expect(stoppedError.message).toContain("order ord-2");
        expect(stoppedError.failedSalesOrderId).toBe("ord-2");
        expect(stoppedError.partialReport.totalProcessed).toBe(2);
        expect(stoppedError.partialReport.details).toHaveLength(1);
        expect(stoppedError.partialReport.committedCount).toBe(1);
        expect(stoppedError.partialReport.failedCount).toBe(1);
        expect(callCount).toBe(2); // Stopped immediately, ord-3 never attempted
      }
    });
  });

  describe("payment attempt and batch exclusion in dryRun", () => {
    it("excludes candidates with online payment attempts or payment batches", async () => {
      const candidates: LegacyNullExpiryCandidateRecord[] = [
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          hasOnlinePaymentAttempts: true,
          id: "11111111-1111-4111-8111-111111111111",
          inventoryReservationId: "res-1",
          orderNumber: "ORD-001",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-001",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          hasPaymentBatches: true,
          id: "22222222-1111-4111-8111-111111111111",
          inventoryReservationId: "res-2",
          orderNumber: "ORD-002",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-002",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
      ];

      const mockSalesOrders: Partial<SalesOrderRepository> = {
        findLegacyNullExpiryCandidates: vi.fn().mockResolvedValue(candidates),
      };

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        salesOrders: mockSalesOrders as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      });

      const report = await service.dryRun({
        cutoff: FIXED_NOW,
        organizationId: ORG_ID,
      });

      expect(report.scannedCount).toBe(2);
      expect(report.candidatesFound).toBe(0);
      expect(report.manifest.candidates).toHaveLength(0);
      expect(report.exclusionCounts.PAYMENT_EXPOSED).toBe(1);
      expect(report.exclusionCounts.PAYMENT_BATCH_EXPOSED).toBe(1);
    });
  });

  describe("assertValidCandidateManifest", () => {
    const validCandidate = {
      baselineVersion: 1,
      calculatedExpiresAt: "2026-09-10T11:30:00.000Z",
      dueClassification: "DUE",
      organizationId: ORG_ID,
      paymentPreference: "ONLINE_PAYMENT",
      policyVersion: "phase-2b-v1",
      reservationId: "33333333-3333-4333-8333-333333333333",
      reservationNumber: "RES-001",
      reservedAt: "2026-09-10T11:00:00.000Z",
      runReferenceTime: FIXED_NOW.toISOString(),
      salesOrderId: "44444444-4444-4444-8444-444444444444",
    };

    const validManifest = {
      candidates: [validCandidate],
      cutoff: FIXED_NOW.toISOString(),
      generatedAt: FIXED_NOW.toISOString(),
      organizationId: ORG_ID,
      policyVersion: "phase-2b-v1",
      totalCandidates: 1,
    };

    it("accepts a valid candidate manifest", () => {
      const validated = assertValidCandidateManifest(validManifest, ORG_ID);
      expect(validated.totalCandidates).toBe(1);
      expect(validated.candidates[0]?.salesOrderId).toBe(
        "44444444-4444-4444-8444-444444444444",
      );
    });

    it("rejects non-object manifest", () => {
      expect(() => assertValidCandidateManifest(null)).toThrow(
        "non-null object",
      );
      expect(() => assertValidCandidateManifest([])).toThrow("non-null object");
      expect(() => assertValidCandidateManifest("invalid")).toThrow(
        "non-null object",
      );
    });

    it("rejects invalid or mismatched organizationId", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          organizationId: "bad",
        }),
      ).toThrow("must be a valid UUID");
      expect(() =>
        assertValidCandidateManifest(
          validManifest,
          "99999999-9999-4999-8999-999999999999",
        ),
      ).toThrow("does not match requested organization");
    });

    it("rejects unsupported policy version", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          policyVersion: "unsupported-v2",
        }),
      ).toThrow("Unsupported policy version");
    });

    it("rejects invalid cutoff and generatedAt timestamps", () => {
      expect(() =>
        assertValidCandidateManifest({ ...validManifest, cutoff: "bad-date" }),
      ).toThrow("invalid cutoff timestamp");
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          generatedAt: "bad-date",
        }),
      ).toThrow("invalid generatedAt timestamp");
    });

    it("rejects candidate count mismatch or non-array candidates", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: "not-array",
        }),
      ).toThrow("candidates must be an array");
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          totalCandidates: 2,
        }),
      ).toThrow("candidate count mismatch");
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          totalCandidates: -1,
        }),
      ).toThrow("candidate count mismatch");
    });

    it("rejects candidate with invalid or duplicate salesOrderId", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, salesOrderId: "not-uuid" }],
        }),
      ).toThrow("invalid salesOrderId");

      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [validCandidate, validCandidate],
          totalCandidates: 2,
        }),
      ).toThrow("duplicate salesOrderId");
    });

    it("rejects candidate with invalid reservationId or empty reservationNumber", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, reservationId: "not-uuid" }],
        }),
      ).toThrow("invalid reservationId");

      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, reservationNumber: "   " }],
        }),
      ).toThrow("invalid reservationNumber");
    });

    it("rejects candidate with mismatched organizationId", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [
            {
              ...validCandidate,
              organizationId: "99999999-9999-4999-8999-999999999999",
            },
          ],
        }),
      ).toThrow("mismatched organizationId");
    });

    it("rejects candidate with invalid baselineVersion", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, baselineVersion: 0 }],
        }),
      ).toThrow("positive integer");

      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, baselineVersion: -1 }],
        }),
      ).toThrow("positive integer");

      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, baselineVersion: 1.5 }],
        }),
      ).toThrow("positive integer");
    });

    it("rejects candidate with unsupported paymentPreference", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [{ ...validCandidate, paymentPreference: "BITCOIN" }],
        }),
      ).toThrow("unsupported paymentPreference");
    });

    it("rejects candidate with runReferenceTime not matching cutoff", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [
            {
              ...validCandidate,
              runReferenceTime: "2026-09-10T11:00:00.000Z",
            },
          ],
        }),
      ).toThrow("runReferenceTime does not match manifest cutoff");
    });

    it("rejects candidate where calculatedExpiresAt does not match policy recalculation", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [
            {
              ...validCandidate,
              calculatedExpiresAt: "2026-09-10T11:59:00.000Z",
            },
          ],
        }),
      ).toThrow("calculatedExpiresAt does not match policy recalculation");
    });

    it("rejects candidate where dueClassification does not match policy recalculation", () => {
      expect(() =>
        assertValidCandidateManifest({
          ...validManifest,
          candidates: [
            {
              ...validCandidate,
              dueClassification: "STILL_VALID", // but reservedAt 11:00 + 30m = 11:30 <= 12:00 -> DUE
            },
          ],
        }),
      ).toThrow("dueClassification does not match policy recalculation");
    });
  });

  describe("dryRun integrity parity with execution", () => {
    it("excludes candidates violating channel, reference, or terminal timestamp rules", async () => {
      const candidates: LegacyNullExpiryCandidateRecord[] = [
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          channel: "POS", // Channel mismatch
          id: "11111111-1111-4111-8111-111111111111",
          inventoryReservationId: "res-1",
          orderNumber: "ORD-001",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-001",
          reservationReferenceId: "11111111-1111-4111-8111-111111111111",
          reservationReferenceType: "SALES_ORDER",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          channel: "ONLINE",
          id: "22222222-1111-4111-8111-111111111111",
          inventoryReservationId: "res-2",
          orderNumber: "ORD-002",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-002",
          reservationReferenceId: "wrong-order-id", // Reference ID mismatch
          reservationReferenceType: "SALES_ORDER",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          channel: "ONLINE",
          id: "33333333-1111-4111-8111-111111111111",
          inventoryReservationId: "res-3",
          orderNumber: "ORD-003",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-003",
          reservationReferenceId: "33333333-1111-4111-8111-111111111111",
          reservationReferenceType: "POS_ORDER", // Reference type mismatch
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          channel: "ONLINE",
          confirmedAt: new Date("2026-09-10T11:05:00.000Z"), // Terminal order
          id: "44444444-1111-4111-8111-111111111111",
          inventoryReservationId: "res-4",
          orderNumber: "ORD-004",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-004",
          reservationReferenceId: "44444444-1111-4111-8111-111111111111",
          reservationReferenceType: "SALES_ORDER",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
        {
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          channel: "ONLINE",
          reservationReleasedAt: new Date("2026-09-10T11:05:00.000Z"), // Terminal reservation
          id: "55555555-1111-4111-8111-111111111111",
          inventoryReservationId: "res-5",
          orderNumber: "ORD-005",
          paymentPreference: "ONLINE_PAYMENT",
          reservationNumber: "RES-005",
          reservationReferenceId: "55555555-1111-4111-8111-111111111111",
          reservationReferenceType: "SALES_ORDER",
          reservationVersion: 1,
          reservedAt: new Date("2026-09-10T11:00:00.000Z"),
        },
      ];

      const mockSalesOrders: Partial<SalesOrderRepository> = {
        findLegacyNullExpiryCandidates: vi.fn().mockResolvedValue(candidates),
      };

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        salesOrders: mockSalesOrders as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      });

      const report = await service.dryRun({
        cutoff: FIXED_NOW,
        organizationId: ORG_ID,
      });

      expect(report.scannedCount).toBe(5);
      expect(report.candidatesFound).toBe(0);
      expect(report.exclusionCounts.INTEGRITY_MISMATCH).toBe(5);
      expect(report.manifest.candidates).toHaveLength(0);
    });
  });

  describe("manifest-based execution identity binding", () => {
    it("passes expectedReservationId, expectedReservationNumber, and baselineVersion to repository", async () => {
      let passedRecord: NormalizeLegacyStorefrontReservationRecord | undefined;

      const mockTransactionManager = {
        execute: async <T>(
          _context: unknown,
          operation: (txContext: unknown) => Promise<T>,
        ): Promise<T> => {
          const transactionContext = {
            auditWriter: {
              recordWithinTransaction: () => Promise.resolve(),
            },
            salesOrderLifecycleRepository: {
              normalizeLegacyStorefrontReservation: (
                record: NormalizeLegacyStorefrontReservationRecord,
              ): Promise<NormalizeLegacyStorefrontReservationResult> => {
                passedRecord = record;
                return Promise.resolve({
                  calculatedExpiresAt: new Date("2026-09-10T11:30:00.000Z"),
                  orderId: record.salesOrderId,
                  orderNumber: "ORD-001",
                  paymentPreference: "ONLINE_PAYMENT",
                  previousExpiresAt: null,
                  reclaimed: false,
                  reservationId: record.expectedReservationId,
                  reservationNumber: record.expectedReservationNumber,
                  reservationVersionAfter: 2,
                  reservationVersionBefore: 1,
                  reservedAt: new Date("2026-09-10T11:00:00.000Z"),
                  status: "NORMALIZED_STILL_VALID",
                });
              },
            },
          };
          return await operation(transactionContext);
        },
      } as unknown as ApplicationTransactionManager;

      const service = new StorefrontReservationNormalizationService({
        clock: createMockClock(),
        transactionManager: mockTransactionManager,
      });

      const manifest = {
        candidates: [
          {
            baselineVersion: 1,
            calculatedExpiresAt: "2026-09-10T11:30:00.000Z",
            dueClassification: "DUE" as const,
            organizationId: ORG_ID,
            paymentPreference: "ONLINE_PAYMENT",
            policyVersion: "phase-2b-v1" as const,
            reservationId: "33333333-3333-4333-8333-333333333333",
            reservationNumber: "RES-001",
            reservedAt: "2026-09-10T11:00:00.000Z",
            runReferenceTime: FIXED_NOW.toISOString(),
            salesOrderId: "44444444-4444-4444-8444-444444444444",
          },
        ],
        cutoff: FIXED_NOW.toISOString(),
        generatedAt: FIXED_NOW.toISOString(),
        organizationId: ORG_ID,
        policyVersion: "phase-2b-v1" as const,
        totalCandidates: 1,
      };

      const report = await service.executeApprovedManifest({
        approvedManifest: manifest,
        organizationId: ORG_ID,
      });

      expect(report.totalProcessed).toBe(1);
      expect(report.committedCount).toBe(1);
      expect(passedRecord).toBeDefined();
      expect(passedRecord?.salesOrderId).toBe(
        "44444444-4444-4444-8444-444444444444",
      );
      expect(passedRecord?.expectedReservationId).toBe(
        "33333333-3333-4333-8333-333333333333",
      );
      expect(passedRecord?.expectedReservationNumber).toBe("RES-001");
      expect(passedRecord?.expectedReservationVersion).toBe(1);
    });
  });
});

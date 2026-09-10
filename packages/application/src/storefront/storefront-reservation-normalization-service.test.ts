import { describe, expect, it, vi } from "vitest";
import {
  NormalizationExecutionStoppedError,
  StorefrontReservationNormalizationService,
  assertValidBatchSize,
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
        expect(stoppedError.partialReport.totalProcessed).toBe(3);
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
});

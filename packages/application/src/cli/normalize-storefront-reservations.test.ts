import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeCliMain,
  parseCliArgs,
  runNormalizationCli,
} from "./normalize-storefront-reservations.js";
import type { CandidateManifest } from "../storefront/storefront-reservation-normalization-service.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import type { SalesOrderRepository } from "@senvo/domain";

const ORG_ID = "22222222-2222-4222-8222-222222222222";

describe("normalize-storefront-reservations CLI", () => {
  describe("parseCliArgs", () => {
    it("parses default arguments (dry-run)", () => {
      const parsed = parseCliArgs(["--organization", ORG_ID]);
      expect(parsed.organizationId).toBe(ORG_ID);
      expect(parsed.execute).toBe(false);
      expect(parsed.help).toBe(false);
    });

    it("parses all optional arguments including execute flag", () => {
      const parsed = parseCliArgs([
        "--execute",
        "--organization",
        ORG_ID,
        "--batch-size",
        "50",
        "--cutoff",
        "2026-09-10T12:00:00.000Z",
        "--max-work",
        "100",
        "--manifest",
        "manifest.json",
        "--out",
        "report.json",
      ]);

      expect(parsed.execute).toBe(true);
      expect(parsed.organizationId).toBe(ORG_ID);
      expect(parsed.batchSize).toBe(50);
      expect(parsed.cutoff).toEqual(new Date("2026-09-10T12:00:00.000Z"));
      expect(parsed.maxWork).toBe(100);
      expect(parsed.manifestPath).toBe("manifest.json");
      expect(parsed.outputPath).toBe("report.json");
    });
  });

  describe("runNormalizationCli", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "senvo-cli-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { force: true, recursive: true });
    });

    it("prints help and exits with code 0 on --help", async () => {
      const exitCode = await runNormalizationCli(["--help"], {
        salesOrders: {} as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      });
      expect(exitCode).toBe(0);
    });

    it("fails with exit code 1 if organization is missing", async () => {
      const exitCode = await runNormalizationCli([], {
        salesOrders: {} as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      });
      expect(exitCode).toBe(1);
    });

    it("fails with exit code 1 if organization is not a valid UUID", async () => {
      const exitCode = await runNormalizationCli(
        ["--organization", "not-a-uuid"],
        {
          salesOrders: {} as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );
      expect(exitCode).toBe(1);
    });

    it("fails with exit code 1 if --execute is used without --manifest", async () => {
      const exitCode = await runNormalizationCli(
        ["--execute", "--organization", ORG_ID],
        {
          salesOrders: {} as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );
      expect(exitCode).toBe(1);
    });

    it("runs dry-run and writes candidate manifest file", async () => {
      const manifestFile = path.join(tmpDir, "candidates.json");
      const mockSalesOrders: Partial<SalesOrderRepository> = {
        findLegacyNullExpiryCandidates: vi.fn().mockResolvedValue([]),
      };

      const exitCode = await runNormalizationCli(
        ["--organization", ORG_ID, "--out", manifestFile],
        {
          salesOrders: mockSalesOrders as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );

      expect(exitCode).toBe(0);
      expect(fs.existsSync(manifestFile)).toBe(true);

      const content = JSON.parse(
        fs.readFileSync(manifestFile, "utf8"),
      ) as CandidateManifest;
      expect(content.organizationId).toBe(ORG_ID);
      expect(content.candidates).toEqual([]);
      expect(content.totalCandidates).toBe(0);
    });

    it("fails with exit code 1 if manifest has unsupported policy version", async () => {
      const manifestFile = path.join(tmpDir, "invalid-policy-manifest.json");
      fs.writeFileSync(
        manifestFile,
        JSON.stringify({
          candidates: [],
          cutoff: "2026-09-10T12:00:00.000Z",
          generatedAt: "2026-09-10T12:00:00.000Z",
          organizationId: ORG_ID,
          policyVersion: "phase-unknown",
          totalCandidates: 0,
        }),
      );

      const exitCode = await runNormalizationCli(
        ["--execute", "--organization", ORG_ID, "--manifest", manifestFile],
        {
          salesOrders: {} as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );
      expect(exitCode).toBe(1);
    });

    it("fails with exit code 1 if conflicting --cutoff override is provided with manifest", async () => {
      const manifestFile = path.join(tmpDir, "manifest.json");
      fs.writeFileSync(
        manifestFile,
        JSON.stringify({
          candidates: [],
          cutoff: "2026-09-10T10:00:00.000Z",
          generatedAt: "2026-09-10T10:00:00.000Z",
          organizationId: ORG_ID,
          policyVersion: "phase-2b-v1",
          totalCandidates: 0,
        }),
      );

      const exitCode = await runNormalizationCli(
        [
          "--execute",
          "--organization",
          ORG_ID,
          "--manifest",
          manifestFile,
          "--cutoff",
          "2026-09-10T11:00:00.000Z",
        ],
        {
          salesOrders: {} as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );
      expect(exitCode).toBe(1);
    });

    it("fails with exit code 1 if manifest has malformed candidate fields", async () => {
      const manifestFile = path.join(
        tmpDir,
        "malformed-candidate-manifest.json",
      );
      fs.writeFileSync(
        manifestFile,
        JSON.stringify({
          candidates: [
            {
              baselineVersion: -1, // invalid
              calculatedExpiresAt: "2026-09-10T11:30:00.000Z",
              dueClassification: "DUE",
              organizationId: ORG_ID,
              paymentPreference: "ONLINE_PAYMENT",
              policyVersion: "phase-2b-v1",
              reservationId: "bad-uuid",
              reservationNumber: "RES-001",
              reservedAt: "2026-09-10T11:00:00.000Z",
              runReferenceTime: "2026-09-10T12:00:00.000Z",
              salesOrderId: "bad-uuid",
            },
          ],
          cutoff: "2026-09-10T12:00:00.000Z",
          generatedAt: "2026-09-10T12:00:00.000Z",
          organizationId: ORG_ID,
          policyVersion: "phase-2b-v1",
          totalCandidates: 1,
        }),
      );

      const exitCode = await runNormalizationCli(
        ["--execute", "--organization", ORG_ID, "--manifest", manifestFile],
        {
          salesOrders: {} as SalesOrderRepository,
          transactionManager: {} as ApplicationTransactionManager,
        },
      );
      expect(exitCode).toBe(1);
    });
  });

  describe("executeCliMain", () => {
    let originalExitCode: string | number | null | undefined;

    beforeEach(() => {
      originalExitCode = process.exitCode;
      process.exitCode = undefined;
    });

    afterEach(() => {
      process.exitCode = originalExitCode as number | undefined;
    });

    it("handles --help without calling dependencyFactory and returns 0", async () => {
      const factoryMock = vi.fn();
      const exitCode = await executeCliMain(["--help"], factoryMock);

      expect(exitCode).toBe(0);
      expect(factoryMock).not.toHaveBeenCalled();
    });

    it("creates dependencies, executes dry-run, disconnects prisma in finally, and returns 0", async () => {
      const disconnectMock = vi.fn().mockResolvedValue(undefined);
      const mockSalesOrders: Partial<SalesOrderRepository> = {
        findLegacyNullExpiryCandidates: vi.fn().mockResolvedValue([]),
      };

      const mockDeps = {
        prisma: { $disconnect: disconnectMock },
        salesOrders: mockSalesOrders as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      };

      const factoryMock = vi.fn().mockResolvedValue(mockDeps);

      const exitCode = await executeCliMain(
        ["--organization", ORG_ID],
        factoryMock,
      );

      expect(exitCode).toBe(0);
      expect(process.exitCode).toBe(0);
      expect(factoryMock).toHaveBeenCalledOnce();
      expect(disconnectMock).toHaveBeenCalledOnce();
    });

    it("disconnects prisma in finally and returns 1 on CLI execution failure", async () => {
      const disconnectMock = vi.fn().mockResolvedValue(undefined);
      const mockDeps = {
        prisma: { $disconnect: disconnectMock },
        salesOrders: {} as SalesOrderRepository,
        transactionManager: {} as ApplicationTransactionManager,
      };

      const factoryMock = vi.fn().mockResolvedValue(mockDeps);

      // Missing required --organization -> returns 1
      const exitCode = await executeCliMain([], factoryMock);

      expect(exitCode).toBe(1);
      expect(process.exitCode).toBe(1);
      expect(disconnectMock).toHaveBeenCalledOnce();
    });

    it("catches fatal error from dependency factory, sets process.exitCode = 1, and returns 1", async () => {
      const factoryMock = vi
        .fn()
        .mockRejectedValue(new Error("Database connection refused"));

      const exitCode = await executeCliMain(
        ["--organization", ORG_ID],
        factoryMock,
      );

      expect(exitCode).toBe(1);
      expect(process.exitCode).toBe(1);
    });
  });
});

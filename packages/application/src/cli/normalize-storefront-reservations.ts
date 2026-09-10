#!/usr/bin/env node
import fs from "node:fs";
import {
  assertValidBatchSize,
  assertValidOrganizationId,
  StorefrontReservationNormalizationService,
  type CandidateManifest,
  type DryRunReport,
  type ExecutionReport,
} from "../storefront/storefront-reservation-normalization-service.js";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import type { SalesOrderRepository } from "@senvo/domain";

export type CliArgs = {
  batchSize?: number;
  cutoff?: Date;
  execute: boolean;
  help: boolean;
  manifestPath?: string;
  maxWork?: number;
  organizationId?: string;
  outputPath?: string;
};

export function parseCliArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {
    execute: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--execute") {
      parsed.execute = true;
    } else if (arg === "--organization") {
      parsed.organizationId = args[++i];
    } else if (arg === "--batch-size") {
      const val = args[++i];
      parsed.batchSize = val ? Number.parseInt(val, 10) : undefined;
    } else if (arg === "--cutoff") {
      const val = args[++i];
      parsed.cutoff = val ? new Date(val) : undefined;
    } else if (arg === "--max-work") {
      const val = args[++i];
      parsed.maxWork = val ? Number.parseInt(val, 10) : undefined;
    } else if (arg === "--manifest") {
      parsed.manifestPath = args[++i];
    } else if (arg === "--out") {
      parsed.outputPath = args[++i];
    }
  }

  return parsed;
}

export async function runNormalizationCli(
  args: string[],
  dependencies: {
    salesOrders?: SalesOrderRepository;
    transactionManager: ApplicationTransactionManager;
  },
): Promise<number> {
  const cliArgs = parseCliArgs(args);

  if (cliArgs.help) {
    console.log(`
SENVO Wear — Storefront Reservation Expiry Normalization CLI
=============================================================
THIS COMMAND MUST NOT BE EXECUTED AGAINST PRODUCTION WITHOUT
A SEPARATE REVIEWED DRY-RUN APPROVAL.

Usage:
  # Dry-run (Default):
  normalize-storefront-reservations --organization <uuid> [options]

  # Execute approved candidates:
  normalize-storefront-reservations --execute --organization <uuid> --manifest <manifest.json> [options]

Options:
  --organization <uuid>   Organization UUID (Required)
  --batch-size <n>        Batch scan limit (1-100, default: 25)
  --cutoff <ISO date>     Fixed reference timestamp (default: now)
  --max-work <n>          Maximum candidates to inspect
  --manifest <path>       Path to candidate manifest (Input for execute; output for dry-run if specified)
  --out <path>            Path to output file for report or manifest
  --execute               Explicit flag required to perform mutations (Default: DRY RUN)
  --help, -h              Display this help message
`);
    return 0;
  }

  if (!cliArgs.organizationId) {
    console.error("ERROR: --organization <uuid> is required.");
    return 1;
  }

  try {
    assertValidOrganizationId(cliArgs.organizationId);
    if (cliArgs.batchSize !== undefined) {
      assertValidBatchSize(cliArgs.batchSize);
    }
  } catch (err: unknown) {
    console.error(`ERROR: ${(err as Error).message}`);
    return 1;
  }

  const service = new StorefrontReservationNormalizationService(dependencies);

  if (cliArgs.execute) {
    console.log("==========================================================");
    console.log("MODE: EXECUTION");
    console.log("==========================================================");

    const manifestFile = cliArgs.manifestPath;
    if (!manifestFile) {
      console.error(
        "ERROR: --execute requires an approved candidate manifest file via --manifest <path>.",
      );
      return 1;
    }

    if (!fs.existsSync(manifestFile)) {
      console.error(`ERROR: Manifest file not found: ${manifestFile}`);
      return 1;
    }

    let manifest: CandidateManifest;
    try {
      const raw = fs.readFileSync(manifestFile, "utf8");
      manifest = JSON.parse(raw) as CandidateManifest;
    } catch (err: unknown) {
      console.error(
        `ERROR: Failed to parse manifest JSON: ${(err as Error).message}`,
      );
      return 1;
    }

    if (manifest.organizationId !== cliArgs.organizationId) {
      console.error(
        `ERROR: Manifest organization ID (${manifest.organizationId}) does not match --organization (${cliArgs.organizationId}).`,
      );
      return 1;
    }

    console.log(
      `Loaded approved manifest with ${manifest.candidates.length} candidates.`,
    );
    console.log(
      "Starting transactional execution (1 order per transaction)...",
    );

    const report: ExecutionReport = await service.executeApprovedManifest({
      approvedManifest: manifest,
      cutoff: cliArgs.cutoff,
      organizationId: cliArgs.organizationId,
    });

    console.log("\nExecution Summary:");
    console.log(`  Total Processed: ${report.totalProcessed}`);
    console.log(`  Committed:       ${report.committedCount}`);
    console.log(`  Reclaimed:       ${report.reclaimedCount}`);
    console.log(`  Skipped:         ${report.skippedCount}`);
    console.log(`  Deferred:        ${report.deferredCount}`);
    console.log(`  Failed:          ${report.failedCount}`);

    if (cliArgs.outputPath) {
      fs.writeFileSync(
        cliArgs.outputPath,
        JSON.stringify(report, null, 2),
        "utf8",
      );
      console.log(`Saved execution report to: ${cliArgs.outputPath}`);
    }

    return report.failedCount > 0 ? 1 : 0;
  }

  // DEFAULT: DRY RUN
  console.log("==========================================================");
  console.log("MODE: DRY RUN (NO DATABASE MUTATIONS OR AUDITS)");
  console.log("==========================================================");

  const dryRunReport: DryRunReport = await service.dryRun({
    batchSize: cliArgs.batchSize,
    cutoff: cliArgs.cutoff,
    maxWork: cliArgs.maxWork,
    organizationId: cliArgs.organizationId,
  });

  console.log("\nCandidate Discovery Summary:");
  console.log(`  Organization ID:   ${dryRunReport.organizationId}`);
  console.log(`  Cutoff Reference:  ${dryRunReport.cutoff.toISOString()}`);
  console.log(`  Scanned Rows:      ${dryRunReport.scannedCount}`);
  console.log(`  Candidates Found:  ${dryRunReport.candidatesFound}`);
  console.log(`  Due for Expiry:    ${dryRunReport.dueCount}`);
  console.log(`  Still Valid:       ${dryRunReport.stillValidCount}`);

  console.log("\nPayment Preferences:");
  for (const [pref, count] of Object.entries(
    dryRunReport.paymentPreferenceCounts,
  )) {
    console.log(`  ${pref}: ${count}`);
  }

  console.log("\nAge Buckets:");
  console.log(`  < 1 Hour:   ${dryRunReport.ageBuckets.lessThan1Hour}`);
  console.log(`  1h - 24h:   ${dryRunReport.ageBuckets.oneHourTo24Hours}`);
  console.log(`  24h - 7d:   ${dryRunReport.ageBuckets.oneDayTo7Days}`);
  console.log(`  > 7 Days:   ${dryRunReport.ageBuckets.moreThan7Days}`);

  console.log("\nExclusions / Deferred:");
  for (const [reason, count] of Object.entries(dryRunReport.exclusionCounts)) {
    if (count > 0) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  const manifestTarget = cliArgs.manifestPath || cliArgs.outputPath;
  if (manifestTarget) {
    fs.writeFileSync(
      manifestTarget,
      JSON.stringify(dryRunReport.manifest, null, 2),
      "utf8",
    );
    console.log(`\nSaved candidate manifest to: ${manifestTarget}`);
  } else {
    console.log(
      `\nCandidate manifest with ${dryRunReport.manifest.candidates.length} entries generated in memory.`,
    );
    console.log(
      "Tip: Pass --manifest <file.json> or --out <file.json> to save the manifest for review.",
    );
  }

  return 0;
}

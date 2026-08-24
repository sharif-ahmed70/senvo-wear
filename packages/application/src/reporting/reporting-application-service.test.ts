import type {
  OperationalReport,
  OperationalReportRepository,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationAuthorizationService } from "../context/authorization.js";
import { ApplicationServiceError } from "../errors/application-error.js";
import { ReportingApplicationService } from "./reporting-application-service.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const requestId = "report-request-001";

describe("ReportingApplicationService", () => {
  it("authorizes report access and scopes the repository query to trusted context", async () => {
    const get = vi
      .fn<OperationalReportRepository["get"]>()
      .mockResolvedValue(report);
    const authorize = vi.fn<ApplicationAuthorizationService["authorize"]>();
    const service = new ReportingApplicationService({
      authorizationService: { authorize },
      repository: { get },
    });

    const result = await service.getOperationalReport(
      { organizationId, requestId },
      { from: "2026-08-01", to: "2026-08-21" },
    );

    expect(result).toEqual({ data: report, ok: true });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, requestId }),
      { action: "READ", resource: "REPORT" },
    );
    expect(get).toHaveBeenCalledWith({
      from: "2026-08-01",
      organizationId,
      to: "2026-08-21",
    });
  });

  it("rejects invalid date ranges before querying the repository", async () => {
    const get = vi.fn<OperationalReportRepository["get"]>();
    const service = new ReportingApplicationService({ repository: { get } });

    const result = await service.getOperationalReport(
      { organizationId, requestId },
      { from: "2026-08-22", to: "2026-08-21", organizationId },
    );

    expect(result).toMatchObject({
      error: { code: "VALIDATION_ERROR", requestId },
      ok: false,
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("preserves authorization failures and does not query reports", async () => {
    const get = vi.fn<OperationalReportRepository["get"]>();
    const service = new ReportingApplicationService({
      authorizationService: {
        authorize: () =>
          Promise.reject(
            new ApplicationServiceError({
              code: "FORBIDDEN",
              message: "Report access is not allowed.",
            }),
          ),
      },
      repository: { get },
    });

    const result = await service.getOperationalReport(
      { organizationId, requestId },
      { from: "2026-08-01", to: "2026-08-21" },
    );

    expect(result).toMatchObject({
      error: { code: "FORBIDDEN", requestId },
      ok: false,
    });
    expect(get).not.toHaveBeenCalled();
  });
});

const report: OperationalReport = {
  inventory: {
    availableToSell: 8,
    onHand: 10,
    outOfStockPositions: 1,
    reserved: 2,
  },
  payments: [{ amountMinor: 1200, method: "CASH" }],
  period: { from: "2026-08-01", timezone: "Asia/Dhaka", to: "2026-08-21" },
  products: [],
  returns: {
    count: 0,
    creditMinor: 0,
    reasons: [],
    refundCount: 0,
    refundMinor: 0,
  },
  sales: {
    collectedMinor: 1200,
    grossMinor: 1200,
    orderCount: 1,
    outstandingMinor: 0,
    refundMinor: 0,
    returnCreditMinor: 0,
  },
  staff: [],
};

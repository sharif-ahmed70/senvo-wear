import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  getDashboardSummaryServiceInputSchema,
  type DashboardSummaryContract,
  type GetDashboardSummaryServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type ReportingApplication = {
  getDashboardSummary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<DashboardSummaryContract>>;
};

export type ReportingApiHandlers = {
  getDashboardSummary: ApiHandler<DashboardSummaryContract>;
};

/**
 * Read-only reports. The gateway checks REPORT READ; the application decides
 * whether the caller also sees financial figures.
 */
export function createReportingApiHandlers(dependencies: {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
  reporting: ReportingApplication;
}): ReportingApiHandlers {
  return {
    getDashboardSummary: createProtectedApiHandler<
      GetDashboardSummaryServiceInputContract,
      DashboardSummaryContract
    >({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.reporting.getDashboardSummary(context, input),
      inputSchema: getDashboardSummaryServiceInputSchema,
      permission: { action: "READ", resource: "REPORT" },
    }),
  };
}

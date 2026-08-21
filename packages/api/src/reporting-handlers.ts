import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  operationalReportInputSchema,
  type OperationalReportContract,
  type OperationalReportInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

export type ReportingApiHandlers = {
  getOperationalReport: ApiHandler<OperationalReportContract>;
};

export function createReportingApiHandlers(dependencies: {
  application: {
    getOperationalReport(
      context: ApplicationExecutionContext,
      input: OperationalReportInputContract,
    ): Promise<ApplicationServiceResult<OperationalReportContract>>;
  };
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
}): ReportingApiHandlers {
  return {
    getOperationalReport: createProtectedApiHandler({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: (context, input) =>
        dependencies.application.getOperationalReport(context, input),
      inputSchema: operationalReportInputSchema,
      permission: { action: "READ", resource: "REPORT" },
    }),
  };
}

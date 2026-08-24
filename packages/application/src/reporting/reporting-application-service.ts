import type { OperationalReportRepository } from "@senvo/domain";
import {
  operationalReportInputSchema,
  type OperationalReportContract,
  type OperationalReportInputContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

export class ReportingApplicationService {
  constructor(
    private readonly dependencies: {
      authorizationService?: ApplicationAuthorizationService;
      repository: OperationalReportRepository;
    },
  ) {}

  async getOperationalReport(
    rawContext: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<OperationalReportContract>> {
    const requestId = rawContext.requestId ?? crypto.randomUUID();
    try {
      const context = validateExecutionContext({
        ...rawContext,
        requestId,
      });
      const parsed = operationalReportInputSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ApplicationServiceError({
          code: "VALIDATION_ERROR",
          message: "Report date range is invalid.",
        });
      }
      await requireAuthorization(
        this.dependencies.authorizationService,
        context,
        {
          action: "READ",
          resource: "REPORT",
        },
      );
      return {
        data: await this.dependencies.repository.get({
          ...parsed.data,
          organizationId: context.organizationId,
        }),
        ok: true,
      };
    } catch (error) {
      const normalized =
        error instanceof ApplicationServiceError
          ? error
          : new ApplicationServiceError({
              code: "INTERNAL_ERROR",
              message: "Operational report could not be loaded.",
              retryable: true,
            });
      return { error: normalized.toShape(requestId), ok: false };
    }
  }
}

export type { OperationalReportInputContract };

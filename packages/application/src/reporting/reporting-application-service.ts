import {
  AuthorizationError,
  ValidationApplicationError,
  getDashboardSummary,
  type DashboardReadRepository,
} from "@senvo/domain";
import {
  dashboardSummaryContractSchema,
  getDashboardSummaryServiceInputSchema,
  type DashboardSummaryContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
import { systemClock, type Clock } from "../context/clock.js";
import {
  validateExecutionContext,
  type ApplicationExecutionContext,
  type ValidatedApplicationExecutionContext,
} from "../context/execution-context.js";
import {
  ApplicationServiceError,
  ValidationApplicationServiceError,
  type ApplicationServiceResult,
} from "../errors/application-error.js";

export type ReportingApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  clock?: Clock;
  dashboards: DashboardReadRepository;
  requestIdGenerator?: () => string;
};

/** Read-only reports. Nothing here writes. */
export class ReportingApplicationService {
  private readonly clock: Clock;
  private readonly requestIdGenerator: () => string;

  constructor(
    private readonly dependencies: ReportingApplicationServiceDependencies,
  ) {
    this.clock = dependencies.clock ?? systemClock;
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
  }

  /**
   * REPORT READ gives the operational dashboard. The `financials` block
   * (sales, refunds, channels, top products) is added only when the caller
   * also holds POS APPROVE, the permission that already guards cash
   * settlement; otherwise it is left out entirely.
   */
  getDashboardSummary(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<DashboardSummaryContract>> {
    return this.execute(context, async (trusted) => {
      const parsed = getDashboardSummaryServiceInputSchema.safeParse(
        payload ?? {},
      );
      if (!parsed.success) {
        throw new ValidationApplicationServiceError("Input is invalid.");
      }
      await requireAuthorization(
        this.dependencies.authorizationService,
        trusted,
        {
          action: "READ",
          resource: "REPORT",
        },
      );
      const includeFinancials = await this.allows(trusted, {
        action: "APPROVE",
        resource: "POS",
      });
      const summary = await getDashboardSummary(this.dependencies.dashboards, {
        includeFinancials,
        now: this.clock.now(),
        organizationId: trusted.organizationId,
      });
      return dashboardSummaryContractSchema.parse({
        ...summary,
        attention: {
          ...summary.attention,
          openSessions: summary.attention.openSessions.map((session) => ({
            ...session,
            openedAt: session.openedAt.toISOString(),
          })),
        },
        generatedAt: summary.generatedAt.toISOString(),
        recentOrders: summary.recentOrders.map((order) => ({
          ...order,
          createdAt: order.createdAt.toISOString(),
        })),
      });
    });
  }

  private async allows(
    context: ValidatedApplicationExecutionContext,
    permission: { action: "APPROVE"; resource: "POS" },
  ): Promise<boolean> {
    try {
      await requireAuthorization(
        this.dependencies.authorizationService,
        context,
        permission,
      );
      return true;
    } catch (error) {
      if (error instanceof AuthorizationError) return false;
      throw error;
    }
  }

  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const requestId = rawContext.requestId || this.requestIdGenerator();
    try {
      return {
        data: await action(
          validateExecutionContext({ ...rawContext, requestId }),
        ),
        ok: true,
      };
    } catch (error) {
      return { error: normalizeError(error).toShape(requestId), ok: false };
    }
  }
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError) {
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  }
  if (error instanceof AuthorizationError) {
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  }
  return new ApplicationServiceError({
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
  });
}

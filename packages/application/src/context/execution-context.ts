import { ValidationApplicationServiceError } from "../errors/application-error.js";

export type ApplicationActorType = "ANONYMOUS" | "INTERNAL" | "SYSTEM";
export type ApplicationSource =
  "ADMIN" | "JOB" | "POS" | "STOREFRONT" | "INTERNAL";

export type ApplicationExecutionContext = {
  actorId?: string | null;
  actorType?: ApplicationActorType;
  organizationId: string;
  requestId?: string;
  source?: ApplicationSource;
};

export type ValidatedApplicationExecutionContext = {
  actorId: string | null;
  actorType: ApplicationActorType;
  organizationId: string;
  requestId: string;
  source: ApplicationSource;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/u;
const actorTypes: readonly ApplicationActorType[] = [
  "ANONYMOUS",
  "INTERNAL",
  "SYSTEM",
];
const sources: readonly ApplicationSource[] = [
  "ADMIN",
  "JOB",
  "POS",
  "STOREFRONT",
  "INTERNAL",
];

export function validateExecutionContext(
  context: ApplicationExecutionContext,
): ValidatedApplicationExecutionContext {
  const requestId = context.requestId;
  if (!uuidPattern.test(context.organizationId)) {
    throw new ValidationApplicationServiceError(
      "Application context organizationId must be a valid UUID.",
    );
  }
  if (!requestIdPattern.test(requestId ?? "")) {
    throw new ValidationApplicationServiceError(
      "Application context requestId is invalid.",
    );
  }
  if (context.actorId && !uuidPattern.test(context.actorId)) {
    throw new ValidationApplicationServiceError(
      "Application context actorId must be a valid UUID.",
    );
  }
  if (context.actorType && !actorTypes.includes(context.actorType)) {
    throw new ValidationApplicationServiceError(
      "Application context actorType is invalid.",
    );
  }
  if (context.source && !sources.includes(context.source)) {
    throw new ValidationApplicationServiceError(
      "Application context source is invalid.",
    );
  }
  return {
    actorId: context.actorId ?? null,
    actorType: context.actorType ?? "ANONYMOUS",
    organizationId: context.organizationId,
    requestId: requestId ?? "",
    source: context.source ?? "INTERNAL",
  };
}

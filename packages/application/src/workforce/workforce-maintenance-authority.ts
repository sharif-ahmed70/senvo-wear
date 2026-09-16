import { randomUUID } from "node:crypto";
import { AuthorizationError, ValidationApplicationError } from "@senvo/domain";

export type WorkforceMaintenanceCapability = {
  readonly credentialId?: string;
  readonly expectedVersion: number;
  readonly expiresAt: Date;
  readonly id: string;
  readonly issuedAt: Date;
  readonly operation: "ADMINISTRATIVE_WORKFORCE_PASSWORD_SET";
  readonly operatorId: string;
  readonly targetUserId: string;
};

type CapabilityRecord = {
  capability: WorkforceMaintenanceCapability;
  consumed: boolean;
  credentialId?: string;
  expectedVersion: number;
  expiresAtEpoch: number;
  issuedAtEpoch: number;
  operatorId: string;
  targetUserId: string;
};

export class WorkforceMaintenanceAuthority {
  private readonly capabilities = new Map<string, CapabilityRecord>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID,
  ) {}

  issueCapability(input: {
    credentialId?: string;
    expectedVersion: number;
    lifetimeSeconds?: number;
    operatorId: string;
    targetUserId: string;
  }): WorkforceMaintenanceCapability {
    if (!input.targetUserId || typeof input.targetUserId !== "string") {
      throw new ValidationApplicationError("targetUserId is required.");
    }
    if (!input.operatorId || typeof input.operatorId !== "string") {
      throw new ValidationApplicationError("operatorId is required.");
    }
    if (
      typeof input.expectedVersion !== "number" ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    ) {
      throw new ValidationApplicationError(
        "expectedVersion must be a positive safe integer.",
      );
    }
    if (
      input.credentialId !== undefined &&
      (typeof input.credentialId !== "string" ||
        input.credentialId.trim().length === 0)
    ) {
      throw new ValidationApplicationError(
        "credentialId must be a non-empty string if provided.",
      );
    }

    const lifetimeSeconds = input.lifetimeSeconds ?? 300;
    if (
      typeof lifetimeSeconds !== "number" ||
      !Number.isInteger(lifetimeSeconds) ||
      lifetimeSeconds < 1 ||
      lifetimeSeconds > 300
    ) {
      throw new ValidationApplicationError(
        "lifetimeSeconds must be an integer between 1 and 300.",
      );
    }

    const now = this.clock();
    const issuedAtEpoch = now.getTime();
    if (!Number.isFinite(issuedAtEpoch)) {
      throw new ValidationApplicationError("Clock returned invalid date.");
    }
    const expiresAtEpoch = issuedAtEpoch + lifetimeSeconds * 1000;

    const capability: WorkforceMaintenanceCapability = Object.freeze({
      credentialId: input.credentialId,
      expectedVersion: input.expectedVersion,
      expiresAt: new Date(expiresAtEpoch),
      id: this.idGenerator(),
      issuedAt: new Date(issuedAtEpoch),
      operation: "ADMINISTRATIVE_WORKFORCE_PASSWORD_SET" as const,
      operatorId: input.operatorId,
      targetUserId: input.targetUserId,
    });

    this.capabilities.set(capability.id, {
      capability,
      consumed: false,
      credentialId: input.credentialId,
      expectedVersion: input.expectedVersion,
      expiresAtEpoch,
      issuedAtEpoch,
      operatorId: input.operatorId,
      targetUserId: input.targetUserId,
    });

    return capability;
  }

  verifyAndConsume(
    capability: unknown,
    targetUserId: string,
    expectedVersion?: number,
    credentialId?: string,
  ): WorkforceMaintenanceCapability {
    if (!capability || typeof capability !== "object") {
      throw new AuthorizationError(
        "Maintenance capability must be an authorized object.",
      );
    }

    const cap = capability as Partial<WorkforceMaintenanceCapability>;
    if (!cap.id) {
      throw new AuthorizationError(
        "Maintenance capability identifier is missing.",
      );
    }

    const record = this.capabilities.get(cap.id);
    if (!record) {
      throw new AuthorizationError(
        "Maintenance capability is unrecognized or fabricated.",
      );
    }

    if (record.capability !== capability) {
      throw new AuthorizationError(
        "Maintenance capability copy or duplicate is rejected.",
      );
    }

    if (record.consumed) {
      throw new AuthorizationError(
        "Maintenance capability has already been consumed.",
      );
    }

    const nowEpoch = this.clock().getTime();
    if (
      !Number.isFinite(nowEpoch) ||
      nowEpoch < record.issuedAtEpoch ||
      nowEpoch >= record.expiresAtEpoch
    ) {
      throw new AuthorizationError("Maintenance capability has expired.");
    }

    if (record.targetUserId !== targetUserId) {
      throw new AuthorizationError(
        "Maintenance capability target user mismatch.",
      );
    }

    if (record.expectedVersion !== expectedVersion) {
      throw new AuthorizationError(
        "Maintenance capability expected version mismatch.",
      );
    }

    if (record.credentialId !== credentialId) {
      throw new AuthorizationError(
        "Maintenance capability credential ID mismatch.",
      );
    }

    if (
      record.capability.operation !== "ADMINISTRATIVE_WORKFORCE_PASSWORD_SET"
    ) {
      throw new AuthorizationError(
        "Maintenance capability operation is unauthorized.",
      );
    }

    record.consumed = true;
    return record.capability;
  }
}

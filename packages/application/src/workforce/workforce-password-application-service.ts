import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
  type PasswordHasher,
  type WorkforcePasswordTransactionManager,
} from "@senvo/domain";
import type {
  WorkforceMaintenanceAuthority,
  WorkforceMaintenanceCapability,
} from "./workforce-maintenance-authority.js";

export type SetWorkforcePasswordInput = {
  capability: WorkforceMaintenanceCapability;
  credentialId?: string;
  expectedVersion: number;
  newPassword: string;
  operatorId: string;
  requestId: string;
  targetUserId: string;
};

export type SetWorkforcePasswordResult = {
  credentialId: string;
  resultingVersion: number;
  revokedSessionCount: number;
  userId: string;
};

export type WorkforcePasswordApplicationServiceDeps = {
  authority: WorkforceMaintenanceAuthority;
  clock?: () => Date;
  passwords: PasswordHasher;
  transactionManager: WorkforcePasswordTransactionManager;
};

export class WorkforcePasswordApplicationService {
  private readonly clock: () => Date;

  constructor(private readonly deps: WorkforcePasswordApplicationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async setPassword(
    input: SetWorkforcePasswordInput,
  ): Promise<SetWorkforcePasswordResult> {
    if (!this.deps.authority) {
      throw new BusinessRuleError("Maintenance authority is required.");
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

    const verifiedCap = this.deps.authority.verifyAndConsume(
      input.capability,
      input.targetUserId,
      input.expectedVersion,
      input.credentialId,
    );

    if (input.operatorId !== verifiedCap.operatorId) {
      throw new BusinessRuleError("Operator identity mismatch.");
    }

    if (verifiedCap.expectedVersion !== input.expectedVersion) {
      throw new BusinessRuleError("Capability expected version mismatch.");
    }

    if (
      verifiedCap.credentialId !== undefined &&
      input.credentialId !== undefined &&
      verifiedCap.credentialId !== input.credentialId
    ) {
      throw new BusinessRuleError("Capability credential mismatch.");
    }

    if (
      typeof input.newPassword !== "string" ||
      input.newPassword.length < 8 ||
      input.newPassword.length > 128
    ) {
      throw new ValidationApplicationError(
        "Password must be between 8 and 128 characters.",
      );
    }

    if (!input.targetUserId || typeof input.targetUserId !== "string") {
      throw new ValidationApplicationError("targetUserId is required.");
    }

    if (
      typeof input.expectedVersion !== "number" ||
      input.expectedVersion < 1
    ) {
      throw new ValidationApplicationError(
        "expectedVersion must be a positive integer.",
      );
    }

    const newPasswordHash = await this.deps.passwords.hash(input.newPassword);

    const now = this.clock();

    return this.deps.transactionManager.execute(async (tx) => {
      const scope = await tx.inspectTargetScope({
        credentialId: input.credentialId,
        userId: input.targetUserId,
      });

      if (!scope) {
        throw new NotFoundError(
          "Target user or password credential was not found.",
        );
      }

      if (scope.user.status !== "ACTIVE") {
        throw new BusinessRuleError("Target user is not active.");
      }

      if (scope.credential.status !== "ACTIVE") {
        throw new BusinessRuleError("Target credential is not active.");
      }

      if (scope.credential.provider !== "PASSWORD") {
        throw new BusinessRuleError("Target credential provider is invalid.");
      }

      if (scope.credential.version !== input.expectedVersion) {
        throw new ConflictError(
          `Expected credential version ${input.expectedVersion}, but found ${scope.credential.version}.`,
        );
      }

      if (scope.hasCustomerAccount) {
        throw new BusinessRuleError(
          "Target user has linked customer account and cannot be modified via workforce maintenance.",
        );
      }

      if (scope.memberships.length !== 1) {
        throw new BusinessRuleError(
          "Target user must have exactly one organization membership.",
        );
      }

      const membership = scope.memberships[0];
      if (!membership || membership.status !== "ACTIVE") {
        throw new BusinessRuleError(
          "Target user's organization membership is not active.",
        );
      }

      const updated = await tx.credentials.replacePassword({
        expectedVersion: input.expectedVersion,
        id: scope.credential.id,
        passwordHash: newPasswordHash,
        userId: input.targetUserId,
      });

      if (!updated) {
        throw new ConflictError("Credential version mismatch during update.");
      }

      const revokedCount =
        await tx.workforceSessions.revokeAllWorkforceSessionsForUser({
          revokedAt: now,
          userId: input.targetUserId,
        });

      await tx.auditWriter.recordWithinTransaction({
        action: "WORKFORCE_PASSWORD_SET",
        actor: { userId: null },
        metadata: {
          actorType: "MAINTENANCE",
          operation: "ADMINISTRATIVE_WORKFORCE_PASSWORD_SET",
          operatorId: input.operatorId,
          requestId: input.requestId,
          resultingVersion: updated.version,
          revokedSessionCount: revokedCount,
          success: true,
          targetUserId: input.targetUserId,
        },
        organizationId: membership.organizationId,
        resource: "USER_CREDENTIAL",
        resourceId: scope.credential.id,
      });

      return {
        credentialId: updated.id,
        resultingVersion: updated.version,
        revokedSessionCount: revokedCount,
        userId: input.targetUserId,
      };
    });
  }
}

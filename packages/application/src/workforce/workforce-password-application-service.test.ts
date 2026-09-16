import {
  BusinessRuleError,
  ConflictError,
  ValidationApplicationError,
  type AuditEntry,
  type PasswordHasher,
  type RecordAuditEntryInput,
  type UserCredential,
  type UserCredentialRepository,
  type WorkforcePasswordTargetScope,
  type WorkforcePasswordTransactionContext,
  type WorkforcePasswordTransactionManager,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import { WorkforceMaintenanceAuthority } from "./workforce-maintenance-authority.js";
import {
  WorkforcePasswordApplicationService,
  type SetWorkforcePasswordInput,
} from "./workforce-password-application-service.js";

describe("WorkforcePasswordApplicationService", () => {
  const targetUserId = "user-111";
  const operatorId = "op-admin";
  const orgId = "org-111";
  const credId = "cred-111";

  function createHarness(
    scopeOverrides: Partial<WorkforcePasswordTargetScope> = {},
  ) {
    const authority = new WorkforceMaintenanceAuthority();
    const hashMock = vi.fn((pwd: string) => Promise.resolve(`hashed:${pwd}`));
    const passwords: PasswordHasher = {
      hash: hashMock,
      verify: vi.fn(() => Promise.resolve(true)),
    };

    const targetScope: WorkforcePasswordTargetScope = {
      credential: {
        id: credId,
        identifier: "user@senvo.test",
        provider: "PASSWORD",
        status: "ACTIVE",
        userId: targetUserId,
        version: 1,
      },
      hasCustomerAccount: false,
      memberships: [
        {
          id: "mem-1",
          organizationId: orgId,
          role: "STAFF",
          status: "ACTIVE",
        },
      ],
      user: {
        id: targetUserId,
        status: "ACTIVE",
      },
      ...scopeOverrides,
    };

    type ReplaceInput = Parameters<
      UserCredentialRepository["replacePassword"]
    >[0];
    const replacePasswordMock = vi.fn(
      (input: ReplaceInput): Promise<UserCredential> =>
        Promise.resolve({
          createdAt: new Date(),
          id: input.id,
          identifier: "user@senvo.test",
          passwordHash: input.passwordHash,
          provider: "PASSWORD",
          status: "ACTIVE",
          updatedAt: new Date(),
          userId: input.userId,
          version: input.expectedVersion + 1,
        }),
    );

    const revokeSessionsMock = vi.fn(() => Promise.resolve(2));
    const auditRecordMock = vi.fn(
      (input: RecordAuditEntryInput): Promise<AuditEntry> =>
        Promise.resolve({
          action: input.action,
          createdAt: new Date(),
          id: "audit-1",
          metadata: input.metadata ?? {},
          organizationId: input.organizationId,
          resource: input.resource,
          resourceId: input.resourceId,
          userId: input.actor.userId,
        }),
    );

    const transactionContext: WorkforcePasswordTransactionContext = {
      auditWriter: {
        record: auditRecordMock,
        recordWithinTransaction: auditRecordMock,
      },
      credentials: {
        changeStatus: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        findByProviderIdentifier: vi.fn(),
        replacePassword: replacePasswordMock,
      },
      inspectTargetScope: vi.fn(() => Promise.resolve(targetScope)),
      workforceSessions: {
        createSession: vi.fn(),
        createSessionForVerifiedCredential: vi.fn(),
        findSessionByTokenHash: vi.fn(),
        revokeAllForUser: vi.fn(),
        revokeAllWorkforceSessionsForUser: revokeSessionsMock,
        revokeSession: vi.fn(),
      },
    };

    const transactionManager: WorkforcePasswordTransactionManager = {
      execute: <TResult>(
        op: (ctx: WorkforcePasswordTransactionContext) => Promise<TResult>,
      ): Promise<TResult> => op(transactionContext),
    };

    const service = new WorkforcePasswordApplicationService({
      authority,
      passwords,
      transactionManager,
    });

    return {
      auditRecordMock,
      authority,
      hashMock,
      passwords,
      replacePasswordMock,
      revokeSessionsMock,
      service,
      transactionContext,
      transactionManager,
    };
  }

  it("sets workforce password with mandatory authority and orchestrates replacement, revocation, and audit", async () => {
    const harness = createHarness();
    const capability = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    const input: SetWorkforcePasswordInput = {
      capability,
      expectedVersion: 1,
      newPassword: "ValidNewPassword123!",
      operatorId,
      requestId: "req-1",
      targetUserId,
    };

    const result = await harness.service.setPassword(input);

    expect(result).toEqual({
      credentialId: credId,
      resultingVersion: 2,
      revokedSessionCount: 2,
      userId: targetUserId,
    });

    // Password hashed with existing hasher
    expect(harness.hashMock).toHaveBeenCalledWith("ValidNewPassword123!");

    // Replaced credential version incremented
    expect(harness.replacePasswordMock).toHaveBeenCalledWith({
      expectedVersion: 1,
      id: credId,
      passwordHash: "hashed:ValidNewPassword123!",
      userId: targetUserId,
    });

    // Revoked all workforce sessions
    expect(harness.revokeSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: targetUserId,
      }),
    );

    // Audit written without sensitive fields
    expect(harness.auditRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WORKFORCE_PASSWORD_SET",
        actor: { userId: null },
        metadata: {
          actorType: "MAINTENANCE",
          operation: "ADMINISTRATIVE_WORKFORCE_PASSWORD_SET",
          operatorId,
          requestId: "req-1",
          resultingVersion: 2,
          revokedSessionCount: 2,
          success: true,
          targetUserId,
        },
        organizationId: orgId,
        resource: "USER_CREDENTIAL",
        resourceId: credId,
      }),
    );
  });

  it("succeeds when rotating a credential with version > 1", async () => {
    const harness = createHarness({
      credential: {
        id: credId,
        identifier: "user@senvo.test",
        provider: "PASSWORD",
        status: "ACTIVE",
        userId: targetUserId,
        version: 5,
      },
    });
    const capability = harness.authority.issueCapability({
      expectedVersion: 5,
      operatorId,
      targetUserId,
    });

    const result = await harness.service.setPassword({
      capability,
      expectedVersion: 5,
      newPassword: "ValidNewPassword123!",
      operatorId,
      requestId: "req-version-5",
      targetUserId,
    });

    expect(result.resultingVersion).toBe(6);
    expect(harness.replacePasswordMock).toHaveBeenCalledWith({
      expectedVersion: 5,
      id: credId,
      passwordHash: "hashed:ValidNewPassword123!",
      userId: targetUserId,
    });
  });

  it("enforces password policy between 8 and 128 characters unmodified", async () => {
    const harness = createHarness();
    const capability1 = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    // Too short (< 8)
    await expect(
      harness.service.setPassword({
        capability: capability1,
        expectedVersion: 1,
        newPassword: "short",
        operatorId,
        requestId: "req-1",
        targetUserId,
      }),
    ).rejects.toBeInstanceOf(ValidationApplicationError);

    // Too long (> 128)
    const capability2 = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });
    await expect(
      harness.service.setPassword({
        capability: capability2,
        expectedVersion: 1,
        newPassword: "a".repeat(129),
        operatorId,
        requestId: "req-2",
        targetUserId,
      }),
    ).rejects.toBeInstanceOf(ValidationApplicationError);
  });

  it("rejects invalid expectedVersion inputs", async () => {
    const harness = createHarness();
    const capability = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    for (const invalidVersion of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      "1" as unknown as number,
      null as unknown as number,
    ]) {
      await expect(
        harness.service.setPassword({
          capability,
          expectedVersion: invalidVersion,
          newPassword: "ValidNewPassword123!",
          operatorId,
          requestId: "req-invalid-ver",
          targetUserId,
        }),
      ).rejects.toBeInstanceOf(ValidationApplicationError);
    }
  });

  it("rejects mismatch between capability expectedVersion and input expectedVersion", async () => {
    const harness = createHarness();
    const capability = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    await expect(
      harness.service.setPassword({
        capability,
        expectedVersion: 2,
        newPassword: "ValidNewPassword123!",
        operatorId,
        requestId: "req-mismatch",
        targetUserId,
      }),
    ).rejects.toThrow();
  });

  it("rejects when target user has customer account linkage", async () => {
    const harness = createHarness({ hasCustomerAccount: true });
    const capability = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    await expect(
      harness.service.setPassword({
        capability,
        expectedVersion: 1,
        newPassword: "ValidNewPassword123!",
        operatorId,
        requestId: "req-1",
        targetUserId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("rejects when target user has additional organization memberships", async () => {
    const harness = createHarness({
      memberships: [
        {
          id: "mem-1",
          organizationId: "org-1",
          role: "STAFF",
          status: "ACTIVE",
        },
        {
          id: "mem-2",
          organizationId: "org-2",
          role: "STAFF",
          status: "INACTIVE",
        },
      ],
    });
    const capability = harness.authority.issueCapability({
      expectedVersion: 1,
      operatorId,
      targetUserId,
    });

    await expect(
      harness.service.setPassword({
        capability,
        expectedVersion: 1,
        newPassword: "ValidNewPassword123!",
        operatorId,
        requestId: "req-1",
        targetUserId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("rejects credential version mismatch with ConflictError", async () => {
    const harness = createHarness();
    const capability = harness.authority.issueCapability({
      expectedVersion: 999,
      operatorId,
      targetUserId,
    });

    await expect(
      harness.service.setPassword({
        capability,
        expectedVersion: 999, // matches capability, but mismatch with DB scope which is version 1
        newPassword: "ValidNewPassword123!",
        operatorId,
        requestId: "req-1",
        targetUserId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

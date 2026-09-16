import type { AuditWriter } from "../../audit/application/audit-writer.js";
import type { UserCredentialRepository } from "../../authentication/repositories/authentication-repositories.js";
import type { WorkforceAuthenticationRepository } from "./workforce-authentication-repository.js";
import type {
  CredentialStatus,
  IdentityProvider,
} from "../../authentication/domain/models.js";

export type WorkforcePasswordTargetScope = {
  credential: {
    id: string;
    identifier: string;
    provider: IdentityProvider;
    status: CredentialStatus;
    userId: string;
    version: number;
  };
  hasCustomerAccount: boolean;
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    status: string;
  }>;
  user: {
    id: string;
    status: string;
  };
};

export type WorkforcePasswordTransactionContext = {
  auditWriter: AuditWriter;
  credentials: UserCredentialRepository;
  inspectTargetScope(target: {
    credentialId?: string;
    userId: string;
  }): Promise<WorkforcePasswordTargetScope | null>;
  workforceSessions: WorkforceAuthenticationRepository;
};

export type WorkforcePasswordTransactionManager = {
  execute<TResult>(
    operation: (
      context: WorkforcePasswordTransactionContext,
    ) => Promise<TResult>,
  ): Promise<TResult>;
};

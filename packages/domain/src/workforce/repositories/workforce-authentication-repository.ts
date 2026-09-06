import type { WorkforceAuthenticationSession } from "../domain/models.js";
import type {
  OrganizationMembership,
  User,
} from "../../identity/domain/models.js";

export type WorkforceSessionWithPrincipal = {
  membership: OrganizationMembership;
  organization: { id: string; name: string; status?: "ACTIVE" | "INACTIVE" };
  session: WorkforceAuthenticationSession;
  user: User;
};

export type WorkforceAuthenticationRepository = {
  createSession(
    input: WorkforceAuthenticationSession,
  ): Promise<WorkforceAuthenticationSession>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<WorkforceSessionWithPrincipal | null>;
  revokeSession(input: {
    revokedAt: Date;
    tokenHash: string;
  }): Promise<boolean>;
  revokeAllForUser(input: {
    organizationId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<number>;
};

export type WorkforceAuthenticationSession = {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  csrfTokenHash: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  rememberMe: boolean;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkforcePrincipal = {
  userId: string;
  organizationId: string;
  displayName: string;
  organizationName: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
  permissions: { resource: string; action: string }[];
};

export type WorkforceSessionRecord = WorkforceAuthenticationSession & {
  principal: WorkforcePrincipal;
};

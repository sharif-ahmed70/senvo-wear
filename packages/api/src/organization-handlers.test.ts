import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import type {
  OrganizationProfileContract,
  RoleVisibilityContract,
  StoreManagementContract,
  TeamMemberContract,
} from "@senvo/contracts";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import {
  createOrganizationManagementApiHandlers,
  type ApiRequestContext,
  type OrganizationManagementApplication,
} from "./index.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const requestId = "req_organization_gateway_1";
const context: ApiRequestContext = {
  authenticatedUser: { userId },
  organizationId,
  permissions: [{ action: "READ", resource: "ORGANIZATION" }],
  requestId,
};

describe("organization management API handlers", () => {
  it("uses ORGANIZATION.READ and trusted organization context", async () => {
    const authorization = new FakeAuthorization();
    const application = new FakeOrganization();
    const response = await handlers(
      application,
      authorization,
    ).getProfile.handle({ context, input: {} });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "READ",
      resource: "ORGANIZATION",
    });
    expect(application.context).toMatchObject({ organizationId, userId });
  });

  it("rejects organization and access injection before application execution", async () => {
    const application = new FakeOrganization();
    const response = await handlers(application).createStore.handle({
      context,
      input: {
        code: "MAIN",
        name: "Main Store",
        organizationId: "20000000-0000-4000-8000-000000000001",
        permissions: [],
        userId,
      },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("validates store input before application execution", async () => {
    const application = new FakeOrganization();
    const response = await handlers(application).createStore.handle({
      context,
      input: { code: "bad code", name: "" },
    });
    expect(response).toMatchObject({
      error: { code: "VALIDATION.INVALID_INPUT" },
      success: false,
    });
    expect(application.context).toBeUndefined();
  });

  it("requires TEAM.UPDATE for role assignment", async () => {
    const authorization = new FakeAuthorization();
    const application = new FakeOrganization();
    const response = await handlers(
      application,
      authorization,
    ).assignTeamMemberRole.handle({
      context: {
        ...context,
        permissions: [{ action: "UPDATE", resource: "TEAM" }],
      },
      input: {
        expectedVersion: 1,
        role: "MANAGER",
        teamMemberId: "30000000-0000-4000-8000-000000000001",
      },
    });
    expect(response.success).toBe(true);
    expect(authorization.permission).toEqual({
      action: "UPDATE",
      resource: "TEAM",
    });
    expect(application.payload).toEqual({
      expectedVersion: 1,
      role: "MANAGER",
      teamMemberId: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("returns a safe forbidden response", async () => {
    const authorization = new FakeAuthorization();
    authorization.reject = true;
    const response = await handlers(
      new FakeOrganization(),
      authorization,
    ).listTeam.handle({ context, input: {} });
    expect(response).toEqual({
      error: {
        code: "AUTHORIZATION.FORBIDDEN",
        message: "You are not allowed to perform this action.",
      },
      requestId,
      success: false,
    });
  });
});

const authenticationService: ApplicationAuthenticationService = {
  authenticate: (request) =>
    Promise.resolve({
      authenticatedUserId: request.userId ?? userId,
      provider: "PASSWORD",
      requestId: request.requestId,
    }),
};
function handlers(
  application: FakeOrganization,
  authorization = new FakeAuthorization(),
) {
  return createOrganizationManagementApiHandlers({
    authenticationService,
    authorizationService: authorization,
    organization: application,
  });
}
class FakeAuthorization implements ApplicationAuthorizationService {
  permission?: { action: string; resource: string };
  reject = false;
  authorize(
    _context: ApplicationExecutionContext,
    permission: { action: string; resource: string },
  ) {
    this.permission = permission;
    return this.reject
      ? Promise.reject(new AuthorizationError("Denied."))
      : Promise.resolve();
  }
}
class FakeOrganization implements OrganizationManagementApplication {
  context?: ApplicationExecutionContext;
  payload?: unknown;
  private success<T>(
    context: ApplicationExecutionContext,
    payload: unknown,
    data: T,
  ) {
    this.context = context;
    this.payload = payload;
    return Promise.resolve<ApplicationServiceResult<T>>({ data, ok: true });
  }
  assignTeamMemberRole(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as TeamMemberContract);
  }
  createStore(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as StoreManagementContract);
  }
  createTeamMember(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as TeamMemberContract);
  }
  getProfile(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as OrganizationProfileContract);
  }
  listRoles(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, [] as RoleVisibilityContract[]);
  }
  listStores(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, [] as StoreManagementContract[]);
  }
  listTeam(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, [] as TeamMemberContract[]);
  }
  updateProfile(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as OrganizationProfileContract);
  }
  updateStore(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as StoreManagementContract);
  }
  updateStoreStatus(context: ApplicationExecutionContext, payload: unknown) {
    return this.success(context, payload, {} as StoreManagementContract);
  }
  updateTeamMemberStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    return this.success(context, payload, {} as TeamMemberContract);
  }
}

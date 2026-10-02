import type {
  ApplicationAuthenticationService,
  ApplicationAuthorizationService,
  ApplicationExecutionContext,
  ApplicationServiceResult,
} from "@senvo/application";
import {
  assignTeamMemberRoleServiceInputSchema,
  createStoreServiceInputSchema,
  createTeamMemberServiceInputSchema,
  organizationManagementEmptyInputSchema,
  resetTeamMemberPasswordServiceInputSchema,
  updateOrganizationProfileServiceInputSchema,
  updateStoreServiceInputSchema,
  updateStoreStatusServiceInputSchema,
  updateTeamMemberStatusServiceInputSchema,
  type AssignTeamMemberRoleServiceInputContract,
  type CreateStoreServiceInputContract,
  type CreateTeamMemberServiceInputContract,
  type OrganizationProfileContract,
  type ResetTeamMemberPasswordServiceInputContract,
  type RoleVisibilityContract,
  type StoreManagementContract,
  type TeamMemberContract,
  type UpdateOrganizationProfileServiceInputContract,
  type UpdateStoreServiceInputContract,
  type UpdateStoreStatusServiceInputContract,
  type UpdateTeamMemberStatusServiceInputContract,
} from "@senvo/contracts";
import { createProtectedApiHandler, type ApiHandler } from "./api-handler.js";

type SecurityDependencies = {
  authenticationService: ApplicationAuthenticationService;
  authorizationService: ApplicationAuthorizationService;
};

export type OrganizationManagementApplication = {
  assignTeamMemberRole(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<TeamMemberContract>>;
  createStore(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StoreManagementContract>>;
  createTeamMember(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<TeamMemberContract>>;
  getProfile(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<OrganizationProfileContract>>;
  listRoles(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<RoleVisibilityContract[]>>;
  listStores(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StoreManagementContract[]>>;
  listTeam(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<TeamMemberContract[]>>;
  resetTeamMemberPassword(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<TeamMemberContract>>;
  updateProfile(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<OrganizationProfileContract>>;
  updateStore(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StoreManagementContract>>;
  updateStoreStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<StoreManagementContract>>;
  updateTeamMemberStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ): Promise<ApplicationServiceResult<TeamMemberContract>>;
};

export type OrganizationManagementApiHandlers = {
  assignTeamMemberRole: ApiHandler<TeamMemberContract>;
  createStore: ApiHandler<StoreManagementContract>;
  createTeamMember: ApiHandler<TeamMemberContract>;
  getProfile: ApiHandler<OrganizationProfileContract>;
  listRoles: ApiHandler<RoleVisibilityContract[]>;
  listStores: ApiHandler<StoreManagementContract[]>;
  listTeam: ApiHandler<TeamMemberContract[]>;
  resetTeamMemberPassword: ApiHandler<TeamMemberContract>;
  updateProfile: ApiHandler<OrganizationProfileContract>;
  updateStore: ApiHandler<StoreManagementContract>;
  updateStoreStatus: ApiHandler<StoreManagementContract>;
  updateTeamMemberStatus: ApiHandler<TeamMemberContract>;
};

export function createOrganizationManagementApiHandlers(
  dependencies: SecurityDependencies & {
    organization: OrganizationManagementApplication;
  },
): OrganizationManagementApiHandlers {
  const handler = <TInput, TOutput>(options: {
    action: "READ" | "UPDATE";
    execute: (
      context: ApplicationExecutionContext,
      input: TInput,
    ) => Promise<ApplicationServiceResult<TOutput>>;
    inputSchema: Parameters<
      typeof createProtectedApiHandler<TInput, TOutput>
    >[0]["inputSchema"];
    resource: "ORGANIZATION" | "TEAM";
  }) =>
    createProtectedApiHandler<TInput, TOutput>({
      authenticationService: dependencies.authenticationService,
      authorizationService: dependencies.authorizationService,
      execute: options.execute,
      inputSchema: options.inputSchema,
      permission: { action: options.action, resource: options.resource },
    });

  return {
    assignTeamMemberRole: handler<
      AssignTeamMemberRoleServiceInputContract,
      TeamMemberContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.assignTeamMemberRole(context, input),
      inputSchema: assignTeamMemberRoleServiceInputSchema,
      resource: "TEAM",
    }),
    resetTeamMemberPassword: handler<
      ResetTeamMemberPasswordServiceInputContract,
      TeamMemberContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.resetTeamMemberPassword(context, input),
      inputSchema: resetTeamMemberPasswordServiceInputSchema,
      resource: "TEAM",
    }),
    createStore: handler<
      CreateStoreServiceInputContract,
      StoreManagementContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.createStore(context, input),
      inputSchema: createStoreServiceInputSchema,
      resource: "ORGANIZATION",
    }),
    createTeamMember: handler<
      CreateTeamMemberServiceInputContract,
      TeamMemberContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.createTeamMember(context, input),
      inputSchema: createTeamMemberServiceInputSchema,
      resource: "TEAM",
    }),
    getProfile: handler<Record<string, never>, OrganizationProfileContract>({
      action: "READ",
      execute: (context, input) =>
        dependencies.organization.getProfile(context, input),
      inputSchema: organizationManagementEmptyInputSchema,
      resource: "ORGANIZATION",
    }),
    listRoles: handler<Record<string, never>, RoleVisibilityContract[]>({
      action: "READ",
      execute: (context, input) =>
        dependencies.organization.listRoles(context, input),
      inputSchema: organizationManagementEmptyInputSchema,
      resource: "TEAM",
    }),
    listStores: handler<Record<string, never>, StoreManagementContract[]>({
      action: "READ",
      execute: (context, input) =>
        dependencies.organization.listStores(context, input),
      inputSchema: organizationManagementEmptyInputSchema,
      resource: "ORGANIZATION",
    }),
    listTeam: handler<Record<string, never>, TeamMemberContract[]>({
      action: "READ",
      execute: (context, input) =>
        dependencies.organization.listTeam(context, input),
      inputSchema: organizationManagementEmptyInputSchema,
      resource: "TEAM",
    }),
    updateProfile: handler<
      UpdateOrganizationProfileServiceInputContract,
      OrganizationProfileContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.updateProfile(context, input),
      inputSchema: updateOrganizationProfileServiceInputSchema,
      resource: "ORGANIZATION",
    }),
    updateStore: handler<
      UpdateStoreServiceInputContract,
      StoreManagementContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.updateStore(context, input),
      inputSchema: updateStoreServiceInputSchema,
      resource: "ORGANIZATION",
    }),
    updateStoreStatus: handler<
      UpdateStoreStatusServiceInputContract,
      StoreManagementContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.updateStoreStatus(context, input),
      inputSchema: updateStoreStatusServiceInputSchema,
      resource: "ORGANIZATION",
    }),
    updateTeamMemberStatus: handler<
      UpdateTeamMemberStatusServiceInputContract,
      TeamMemberContract
    >({
      action: "UPDATE",
      execute: (context, input) =>
        dependencies.organization.updateTeamMemberStatus(context, input),
      inputSchema: updateTeamMemberStatusServiceInputSchema,
      resource: "TEAM",
    }),
  };
}

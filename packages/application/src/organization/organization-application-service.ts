import {
  ApplicationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  ConcurrencyError,
  NotFoundError,
  ValidationApplicationError,
  assignOrganizationMembershipRole,
  changeBranchStatus,
  createBranch,
  createOrganizationMembership,
  createUser,
  getOrganizationProfile,
  listBranches,
  listOrganizationTeam,
  updateBranchMetadata,
  updateOrganizationMembershipStatus,
  updateOrganizationProfile,
  type Branch,
  type BranchRepository,
  type Organization,
  type OrganizationMembershipRepository,
  type OrganizationProfileRepository,
  type OrganizationTeamMember,
  type OrganizationTeamReadRepository,
  type Role,
  type RolePermissionRepository,
  type UserRepository,
} from "@senvo/domain";
import {
  assignTeamMemberRoleServiceInputSchema,
  createStoreServiceInputSchema,
  createTeamMemberServiceInputSchema,
  organizationManagementEmptyInputSchema,
  organizationProfileContractSchema,
  roleVisibilityContractSchema,
  storeManagementContractSchema,
  teamMemberContractSchema,
  updateOrganizationProfileServiceInputSchema,
  updateStoreServiceInputSchema,
  updateStoreStatusServiceInputSchema,
  updateTeamMemberStatusServiceInputSchema,
  type AssignTeamMemberRoleServiceInputContract,
  type CreateStoreServiceInputContract,
  type CreateTeamMemberServiceInputContract,
  type OrganizationProfileContract,
  type RoleVisibilityContract,
  type StoreManagementContract,
  type TeamMemberContract,
  type UpdateOrganizationProfileServiceInputContract,
  type UpdateStoreServiceInputContract,
  type UpdateStoreStatusServiceInputContract,
  type UpdateTeamMemberStatusServiceInputContract,
} from "@senvo/contracts";
import {
  requireAuthorization,
  type ApplicationAuthorizationService,
} from "../context/authorization.js";
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

type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { data: T; success: true }
    | {
        error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        success: false;
      };
};

type MembershipRepositories = OrganizationMembershipRepository &
  OrganizationTeamReadRepository;

export type OrganizationApplicationServiceDependencies = {
  authorizationService?: ApplicationAuthorizationService;
  branches: BranchRepository;
  memberships: MembershipRepositories;
  organizations: OrganizationProfileRepository;
  requestIdGenerator?: () => string;
  rolePermissions: RolePermissionRepository;
  users: UserRepository;
};

export class OrganizationApplicationService {
  private readonly requestIdGenerator: () => string;

  constructor(
    private readonly dependencies: OrganizationApplicationServiceDependencies,
  ) {
    this.requestIdGenerator =
      dependencies.requestIdGenerator ?? (() => crypto.randomUUID());
  }

  getProfile(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<OrganizationProfileContract>(
      context,
      async (trusted) => {
        parsePayload(organizationManagementEmptyInputSchema, payload);
        await this.authorize(trusted, "ORGANIZATION", "READ");
        return mapProfile(
          await getOrganizationProfile(
            this.dependencies.organizations,
            trusted.organizationId,
          ),
        );
      },
    );
  }

  updateProfile(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<OrganizationProfileContract>(
      context,
      async (trusted) => {
        const input = parsePayload(
          updateOrganizationProfileServiceInputSchema,
          payload,
        );
        await this.authorize(trusted, "ORGANIZATION", "UPDATE");
        return mapProfile(
          await updateOrganizationProfile(this.dependencies.organizations, {
            ...input,
            name: input.businessName,
            organizationId: trusted.organizationId,
          }),
        );
      },
    );
  }

  listStores(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<StoreManagementContract[]>(context, async (trusted) => {
      parsePayload(organizationManagementEmptyInputSchema, payload);
      await this.authorize(trusted, "ORGANIZATION", "READ");
      const page = await listBranches(this.dependencies.branches, {
        organizationId: trusted.organizationId,
        pageSize: 100,
      });
      return page.items.map(mapStore);
    });
  }

  createStore(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<StoreManagementContract>(context, async (trusted) => {
      const input = parsePayload(createStoreServiceInputSchema, payload);
      await this.authorize(trusted, "ORGANIZATION", "UPDATE");
      const profile = await getOrganizationProfile(
        this.dependencies.organizations,
        trusted.organizationId,
      );
      return mapStore(
        await createBranch(
          {
            branches: this.dependencies.branches,
            organizations: this.dependencies.organizations,
          },
          {
            addressLine1: input.address,
            city: input.city,
            code: input.code,
            countryCode: profile.countryCode,
            name: input.name,
            organizationId: trusted.organizationId,
            phone: input.phone,
            timezone: profile.timezone,
            type: "SHOWROOM",
          },
        ),
      );
    });
  }

  updateStore(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<StoreManagementContract>(context, async (trusted) => {
      const input = parsePayload(updateStoreServiceInputSchema, payload);
      await this.authorize(trusted, "ORGANIZATION", "UPDATE");
      return mapStore(
        await updateBranchMetadata(this.dependencies.branches, {
          addressLine1: input.address,
          branchId: input.storeId,
          city: input.city,
          expectedVersion: input.expectedVersion,
          name: input.name,
          organizationId: trusted.organizationId,
          phone: input.phone,
        }),
      );
    });
  }

  updateStoreStatus(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<StoreManagementContract>(context, async (trusted) => {
      const input = parsePayload(updateStoreStatusServiceInputSchema, payload);
      await this.authorize(trusted, "ORGANIZATION", "UPDATE");
      return mapStore(
        await changeBranchStatus(this.dependencies.branches, {
          branchId: input.storeId,
          expectedVersion: input.expectedVersion,
          organizationId: trusted.organizationId,
          status: input.status,
        }),
      );
    });
  }

  listTeam(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<TeamMemberContract[]>(context, async (trusted) => {
      parsePayload(organizationManagementEmptyInputSchema, payload);
      await this.authorize(trusted, "TEAM", "READ");
      return (
        await listOrganizationTeam(
          this.dependencies.memberships,
          trusted.organizationId,
        )
      ).map(mapTeamMember);
    });
  }

  createTeamMember(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<TeamMemberContract>(context, async (trusted) => {
      const input = parsePayload(createTeamMemberServiceInputSchema, payload);
      await this.authorize(trusted, "TEAM", "UPDATE");
      const user =
        (await this.dependencies.users.findByEmail(
          input.email.toLowerCase(),
        )) ?? (await createUser(this.dependencies.users, input));
      const teamMember = await createOrganizationMembership(
        {
          memberships: this.dependencies.memberships,
          organizations: this.dependencies.organizations,
          users: this.dependencies.users,
        },
        {
          organizationId: trusted.organizationId,
          role: input.role,
          userId: user.id,
        },
      );
      return mapTeamMember({
        ...teamMember,
        email: user.email,
        name: user.name,
        userStatus: user.status,
      });
    });
  }

  updateTeamMemberStatus(
    context: ApplicationExecutionContext,
    payload: unknown,
  ) {
    return this.execute<TeamMemberContract>(context, async (trusted) => {
      const input = parsePayload(
        updateTeamMemberStatusServiceInputSchema,
        payload,
      );
      await this.authorize(trusted, "TEAM", "UPDATE");
      await updateOrganizationMembershipStatus(this.dependencies.memberships, {
        expectedVersion: input.expectedVersion,
        membershipId: input.teamMemberId,
        organizationId: trusted.organizationId,
        status: input.status,
      });
      return this.requireTeamMember(trusted.organizationId, input.teamMemberId);
    });
  }

  assignTeamMemberRole(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<TeamMemberContract>(context, async (trusted) => {
      const input = parsePayload(
        assignTeamMemberRoleServiceInputSchema,
        payload,
      );
      await this.authorize(trusted, "TEAM", "UPDATE");
      await assignOrganizationMembershipRole(this.dependencies.memberships, {
        expectedVersion: input.expectedVersion,
        membershipId: input.teamMemberId,
        organizationId: trusted.organizationId,
        role: input.role,
      });
      return this.requireTeamMember(trusted.organizationId, input.teamMemberId);
    });
  }

  listRoles(context: ApplicationExecutionContext, payload: unknown) {
    return this.execute<RoleVisibilityContract[]>(context, async (trusted) => {
      parsePayload(organizationManagementEmptyInputSchema, payload);
      await this.authorize(trusted, "TEAM", "READ");
      return Promise.all(
        roles.map(async ({ description, name, role }) =>
          roleVisibilityContractSchema.parse({
            description,
            name,
            permissions: (
              await this.dependencies.rolePermissions.listActivePermissionsByRole(
                role,
              )
            ).map(({ action, resource }) => ({ action, resource })),
            role,
          }),
        ),
      );
    });
  }

  private async requireTeamMember(
    organizationId: string,
    teamMemberId: string,
  ): Promise<TeamMemberContract> {
    const member = (
      await this.dependencies.memberships.listByOrganization(organizationId)
    ).find((item) => item.id === teamMemberId);
    if (!member) throw new NotFoundError("Team member was not found.");
    return mapTeamMember(member);
  }

  private authorize(
    context: ValidatedApplicationExecutionContext,
    resource: "ORGANIZATION" | "TEAM",
    action: "READ" | "UPDATE",
  ): Promise<void> {
    return requireAuthorization(
      this.dependencies.authorizationService,
      context,
      {
        action,
        resource,
      },
    );
  }

  private async execute<T>(
    rawContext: ApplicationExecutionContext,
    action: (context: ValidatedApplicationExecutionContext) => Promise<T>,
  ): Promise<ApplicationServiceResult<T>> {
    const context = {
      ...rawContext,
      requestId: rawContext.requestId || this.requestIdGenerator(),
    };
    try {
      return {
        data: await action(validateExecutionContext(context)),
        ok: true,
      };
    } catch (error) {
      return {
        error: normalizeError(error).toShape(context.requestId),
        ok: false,
      };
    }
  }
}

const roles: readonly { description: string; name: string; role: Role }[] = [
  { description: "Can manage everything", name: "Owner", role: "OWNER" },
  {
    description: "Can help manage business settings",
    name: "Admin",
    role: "ADMIN",
  },
  {
    description: "Can manage daily operations",
    name: "Manager",
    role: "MANAGER",
  },
  { description: "Can perform assigned tasks", name: "Staff", role: "STAFF" },
];

function mapProfile(record: Organization): OrganizationProfileContract {
  return organizationProfileContractSchema.parse({
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    businessCode: record.code,
    businessName: record.name,
    city: record.city,
    countryCode: record.countryCode,
    district: record.district,
    email: record.email,
    id: record.id,
    phone: record.phone,
    postalCode: record.postalCode,
    timezone: record.timezone,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}

function mapStore(record: Branch): StoreManagementContract {
  return storeManagementContractSchema.parse({
    address: record.addressLine1,
    city: record.city,
    code: record.code,
    countryCode: record.countryCode,
    id: record.id,
    name: record.name,
    phone: record.phone,
    status: record.status,
    timezone: record.timezone,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  });
}

function mapTeamMember(record: OrganizationTeamMember): TeamMemberContract {
  return teamMemberContractSchema.parse({
    email: record.email,
    id: record.id,
    name: record.name,
    role: record.role,
    status: record.status,
    storeAccess: "All stores",
    updatedAt: record.updatedAt.toISOString(),
    userStatus: record.userStatus,
    version: record.version,
  });
}

function parsePayload<T>(schema: SafeParseSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues.at(0);
  throw new ValidationApplicationServiceError(
    issue
      ? `${issue.path.join(".") || "payload"}: ${issue.message}`
      : "Input is invalid.",
  );
}

function normalizeError(error: unknown): ApplicationServiceError {
  if (error instanceof ApplicationServiceError) return error;
  if (error instanceof ValidationApplicationError)
    return new ApplicationServiceError({
      code: "VALIDATION_ERROR",
      message: "Input is invalid.",
    });
  if (error instanceof AuthorizationError)
    return new ApplicationServiceError({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  if (error instanceof NotFoundError)
    return new ApplicationServiceError({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  if (error instanceof ConcurrencyError)
    return new ApplicationServiceError({
      code: "CONCURRENCY_CONFLICT",
      message: "The information changed. Please reload.",
      retryable: true,
    });
  if (error instanceof ConflictError)
    return new ApplicationServiceError({
      code: "CONFLICT",
      message: "The request conflicts with the current information.",
    });
  if (error instanceof BusinessRuleError)
    return new ApplicationServiceError({
      code: "BUSINESS_RULE_VIOLATION",
      message: "The request cannot be completed.",
    });
  return new ApplicationServiceError({
    code:
      error instanceof ApplicationError ? "INTERNAL_ERROR" : "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
  });
}

export type {
  AssignTeamMemberRoleServiceInputContract,
  CreateStoreServiceInputContract,
  CreateTeamMemberServiceInputContract,
  UpdateOrganizationProfileServiceInputContract,
  UpdateStoreServiceInputContract,
  UpdateStoreStatusServiceInputContract,
  UpdateTeamMemberStatusServiceInputContract,
};

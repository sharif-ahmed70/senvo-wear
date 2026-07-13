import type { OrganizationMembership, Role, User } from "../domain/models.js";

export type CreateUserRecord = Pick<User, "email" | "name" | "status">;

export type CreateOrganizationMembershipRecord = Pick<
  OrganizationMembership,
  "organizationId" | "role" | "status" | "userId"
>;

export type UserRepository = {
  create(record: CreateUserRecord): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
};

export type OrganizationMembershipRepository = {
  assignRole(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    role: Role;
  }): Promise<OrganizationMembership | null>;
  changeStatus(record: {
    expectedVersion: number;
    id: string;
    organizationId: string;
    status: OrganizationMembership["status"];
  }): Promise<OrganizationMembership | null>;
  create(
    record: CreateOrganizationMembershipRecord,
  ): Promise<OrganizationMembership>;
  findById(
    id: string,
    organizationId?: string,
  ): Promise<OrganizationMembership | null>;
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null>;
};

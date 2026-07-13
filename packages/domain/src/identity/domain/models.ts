export type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED";

export type OrganizationMembershipStatus = "ACTIVE" | "INACTIVE";

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "STAFF";

export type Permission =
  "ORGANIZATION_ACCESS" | "CATALOG_READ" | "INVENTORY_READ" | "SALES_READ";

export type User = {
  createdAt: Date;
  email: string;
  id: string;
  name: string | null;
  status: UserStatus;
  updatedAt: Date;
  version: number;
};

export type OrganizationMembership = {
  createdAt: Date;
  id: string;
  organizationId: string;
  role: Role;
  status: OrganizationMembershipStatus;
  updatedAt: Date;
  userId: string;
  version: number;
};

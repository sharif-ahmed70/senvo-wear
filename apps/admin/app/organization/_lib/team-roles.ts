import type { TeamMemberContract } from "@senvo/contracts";
import type { AdminSession } from "../../_lib/admin-access";

type Role = TeamMemberContract["role"];

export const TEAM_ROLES: ReadonlyArray<{
  description: string;
  label: string;
  role: Role;
}> = [
  { description: "মালিক — সবকিছু", label: "Owner", role: "OWNER" },
  {
    description:
      "বিশ্বস্ত লোক — মালিকের মতো সব, শুধু মালিকের role বদলাতে পারবে না",
    label: "Admin",
    role: "ADMIN",
  },
  {
    description: "দোকান চালায় — মাল তোলা, stock, বিক্রি, দাম",
    label: "Manager",
    role: "MANAGER",
  },
  {
    description: "বিক্রয়কর্মী — শুধু বিক্রি আর মাল দেখা",
    label: "Staff",
    role: "STAFF",
  },
];

/** Mirrors the backend team guards; the server still decides. */
export function assignableRolesFor(actorRole: Role | null): readonly Role[] {
  if (actorRole === "OWNER") return ["OWNER", "ADMIN", "MANAGER", "STAFF"];
  if (actorRole === "ADMIN") return ["MANAGER", "STAFF"];
  return [];
}

export type TeamRowAccess = {
  /** Why the row is locked, in Bangla; empty when it can be changed. */
  lockedReason: string;
  canChange: boolean;
  isSelf: boolean;
};

export function teamRowAccess(
  actor: Pick<AdminSession, "role" | "userId"> | null,
  member: Pick<TeamMemberContract, "role" | "status" | "userId">,
  members: readonly Pick<TeamMemberContract, "role" | "status">[],
): TeamRowAccess {
  if (!actor) return { canChange: false, isSelf: false, lockedReason: "" };
  if (member.userId === actor.userId) {
    return {
      canChange: false,
      isSelf: true,
      lockedReason: "নিজের role বা access বদলানো যায় না",
    };
  }
  if (!assignableRolesFor(actor.role).includes(member.role)) {
    return {
      canChange: false,
      isSelf: false,
      lockedReason: "শুধু মালিক এই role বদলাতে পারেন",
    };
  }
  const activeOwners = members.filter(
    (item) => item.role === "OWNER" && item.status === "ACTIVE",
  ).length;
  if (
    member.role === "OWNER" &&
    member.status === "ACTIVE" &&
    activeOwners <= 1
  ) {
    return {
      canChange: false,
      isSelf: false,
      lockedReason: "শেষ মালিককে সরানো যায় না",
    };
  }
  return { canChange: true, isSelf: false, lockedReason: "" };
}

export function roleOptionLabel(role: Role): string {
  const found = TEAM_ROLES.find((item) => item.role === role);
  return found ? `${found.label} — ${found.description}` : role;
}

/**
 * Password reset rule (mirrors the backend): never your own row, and only
 * roles you manage. Unlike role changes, the last owner rule does not apply.
 */
export function canResetPassword(
  actor: Pick<AdminSession, "role" | "userId"> | null,
  member: Pick<TeamMemberContract, "role" | "userId">,
): boolean {
  if (!actor || member.userId === actor.userId) return false;
  return assignableRolesFor(actor.role).includes(member.role);
}

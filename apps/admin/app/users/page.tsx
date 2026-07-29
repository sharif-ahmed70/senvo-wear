import { BadgeCheck, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { ModuleFoundationPage } from "../_components/module-foundation-page";

export default function UsersPage() {
  return (
    <ModuleFoundationPage
      description="Review organization access, membership status, and assigned roles."
      eyebrow="Access"
      title="Users & Roles"
      items={[
        {
          description: "People with organization access",
          icon: UserRound,
          label: "Users",
        },
        {
          description: "Active organization relationships",
          icon: BadgeCheck,
          label: "Memberships",
        },
        {
          description: "Owner, admin, manager, and staff",
          icon: ShieldCheck,
          label: "Roles",
        },
        {
          description: "Resource and action assignments",
          icon: KeyRound,
          label: "Permissions",
        },
      ]}
    />
  );
}

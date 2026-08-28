import { adminFoundationSession } from "../_lib/admin-access";
import { TeamWorkspace } from "./_components/team-workspace";

export default function TeamPage() {
  return <TeamWorkspace permissions={adminFoundationSession.permissions} />;
}

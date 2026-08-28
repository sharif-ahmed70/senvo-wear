import { getAdminSession } from "../_lib/workforce-auth-server";
import { TeamWorkspace } from "./_components/team-workspace";

export default async function TeamPage() {
  const session = await getAdminSession();
  return <TeamWorkspace permissions={session?.permissions ?? []} />;
}

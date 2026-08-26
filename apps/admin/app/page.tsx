import { AdminDashboard } from "./_components/dashboard";
import { dashboardPreviewData } from "./_lib/dashboard-preview-data";

export default function AdminPage() {
  return <AdminDashboard model={dashboardPreviewData} />;
}

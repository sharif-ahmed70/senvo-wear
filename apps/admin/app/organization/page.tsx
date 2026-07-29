import { Building2, MapPin, MonitorDot, Warehouse } from "lucide-react";
import { ModuleFoundationPage } from "../_components/module-foundation-page";

export default function OrganizationPage() {
  return (
    <ModuleFoundationPage
      description="Keep operational structure aligned across every business location."
      eyebrow="Administration"
      title="Organization"
      items={[
        {
          description: "Organization identity and status",
          icon: Building2,
          label: "Profile",
        },
        {
          description: "Showrooms, warehouses, and offices",
          icon: MapPin,
          label: "Branches",
        },
        {
          description: "Physical inventory locations",
          icon: Warehouse,
          label: "Stock locations",
        },
        {
          description: "Point-of-sale operating counters",
          icon: MonitorDot,
          label: "POS counters",
        },
      ]}
    />
  );
}

import { Boxes, MapPinned, PackageCheck, Repeat2 } from "lucide-react";
import { ModuleFoundationPage } from "../_components/module-foundation-page";

export default function InventoryPage() {
  return (
    <ModuleFoundationPage
      description="Review stock positions and the movement of goods between locations."
      eyebrow="Operations"
      title="Inventory"
      items={[
        {
          description: "On-hand and available quantities",
          icon: Boxes,
          label: "Stock balances",
        },
        {
          description: "Warehouse and showroom stock",
          icon: MapPinned,
          label: "Locations",
        },
        {
          description: "Posted inventory ledger entries",
          icon: Repeat2,
          label: "Movements",
        },
        {
          description: "Active and confirmed holds",
          icon: PackageCheck,
          label: "Reservations",
        },
      ]}
    />
  );
}

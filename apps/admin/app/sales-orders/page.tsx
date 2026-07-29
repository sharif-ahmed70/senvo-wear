import {
  CircleCheck,
  ClipboardList,
  PackageOpen,
  ScrollText,
} from "lucide-react";
import { ModuleFoundationPage } from "../_components/module-foundation-page";

export default function SalesOrdersPage() {
  return (
    <ModuleFoundationPage
      description="Follow orders from draft through reservation and fulfilment."
      eyebrow="Sales"
      title="Sales Orders"
      items={[
        {
          description: "New and amended order drafts",
          icon: ScrollText,
          label: "Drafts",
        },
        {
          description: "Orders with stock reserved",
          icon: ClipboardList,
          label: "Reserved",
        },
        {
          description: "Confirmed customer commitments",
          icon: CircleCheck,
          label: "Confirmed",
        },
        {
          description: "Completed order fulfilment",
          icon: PackageOpen,
          label: "Fulfilled",
        },
      ]}
    />
  );
}

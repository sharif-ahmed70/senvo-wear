import { Layers3, Palette, Ruler, Shirt } from "lucide-react";
import { ModuleFoundationPage } from "../_components/module-foundation-page";

export default function CatalogPage() {
  return (
    <ModuleFoundationPage
      description="Maintain the product structure used across sales and inventory."
      eyebrow="Merchandising"
      title="Catalog"
      items={[
        {
          description: "Product records and variants",
          icon: Shirt,
          label: "Products",
        },
        {
          description: "Category and collection structure",
          icon: Layers3,
          label: "Collections",
        },
        {
          description: "Color definitions and swatches",
          icon: Palette,
          label: "Colors",
        },
        {
          description: "Size definitions and order",
          icon: Ruler,
          label: "Sizes",
        },
      ]}
    />
  );
}

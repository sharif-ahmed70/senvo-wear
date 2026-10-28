import type { Metadata } from "next";
import { EditProductPage } from "../_components/edit-product-page";

export const metadata: Metadata = {
  title: "Product Edit | SENVO Wear Admin",
  description:
    "Edit a product through the same steps it was entered with: name, category, photo, selling prices and extra cost.",
};

export default function EditProductIntakePage() {
  return <EditProductPage />;
}

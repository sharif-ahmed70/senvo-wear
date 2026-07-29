import { ArrowRight, FolderTree, PackageOpen, Tags } from "lucide-react";
import Link from "next/link";

const catalogAreas = [
  {
    description: "Build the hierarchy used to organize products.",
    href: "/catalog/categories",
    icon: FolderTree,
    label: "Categories",
  },
  {
    description: "Group products into seasonal and merchandising sets.",
    href: "/catalog/collections",
    icon: Tags,
    label: "Collections",
  },
  {
    description: "Create products and their color and size variants.",
    href: "/catalog/products",
    icon: PackageOpen,
    label: "Products",
  },
] as const;

export default function CatalogPage() {
  return (
    <>
      <header className="admin-page-header">
        <div className="admin-page-header__copy">
          <p className="admin-kicker">Merchandising</p>
          <h1>Catalog</h1>
          <p>Maintain product structure for sales and inventory workflows.</p>
        </div>
      </header>
      <section className="admin-section admin-section--compact">
        <div className="admin-workspace-list">
          {catalogAreas.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                className="admin-workspace-link"
                href={area.href}
                key={area.href}
              >
                <span className="admin-workspace-link__icon">
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span className="admin-workspace-link__copy">
                  <strong>{area.label}</strong>
                  <span>{area.description}</span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="admin-workspace-link__arrow"
                  size={17}
                />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

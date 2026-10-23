import { CatalogWorkspace } from "./_components/catalog-workspace";
import { storefrontApi } from "./_lib/storefront-api";

export const dynamic = "force-dynamic";

const firstValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export default async function StorefrontPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = firstValue(params.category);
  const collection = firstValue(params.collection);
  let initialCatalog = null;
  try {
    initialCatalog = await storefrontApi.catalog({
      category: category || undefined,
      collection: collection || undefined,
      pageSize: "12",
    });
  } catch {
    // Fall back to client-side loading if SSR fetch fails
  }

  // The key remounts the workspace when a menu link changes the filter.
  return (
    <CatalogWorkspace
      initialCatalog={initialCatalog}
      initialCategory={category}
      initialCollection={collection}
      key={`${category}|${collection}`}
    />
  );
}

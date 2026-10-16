import { CatalogWorkspace } from "./_components/catalog-workspace";
import { storefrontApi } from "./_lib/storefront-api";

export const dynamic = "force-dynamic";

export default async function StorefrontPage() {
  let initialCatalog = null;
  try {
    initialCatalog = await storefrontApi.catalog({ pageSize: "12" });
  } catch {
    // Fall back to client-side loading if SSR fetch fails
  }

  return <CatalogWorkspace initialCatalog={initialCatalog} />;
}

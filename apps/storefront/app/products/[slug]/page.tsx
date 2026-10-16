import { notFound } from "next/navigation";
import { ProductWorkspace } from "../../_components/product-workspace";
import { StorefrontApiError, storefrontApi } from "../../_lib/storefront-api";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    await storefrontApi.product(slug);
  } catch (error) {
    // Only a confirmed unknown slug is a 404. Network or server failures fall
    // through so the workspace can show its own retryable unavailable state.
    if (
      error instanceof StorefrontApiError &&
      error.code === "NOT_FOUND.RESOURCE"
    ) {
      notFound();
    }
  }
  return <ProductWorkspace slug={slug} />;
}

import type { Metadata } from "next";
import { PurchaseExtraCostEditor } from "./purchase-extra-cost-editor";

export const metadata: Metadata = {
  title: "অতিরিক্ত খরচ এডিট | SENVO Wear Admin",
  description:
    "Set a received purchase's transport, courier and labour cost after the fact.",
};

export default async function PurchaseExtraCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseExtraCostEditor purchaseId={id} />;
}

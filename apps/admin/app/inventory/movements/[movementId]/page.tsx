import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { MovementDetailWorkspace } from "./_components/movement-detail-workspace";

export const metadata: Metadata = {
  title: "Movement Details | SENVO Wear Admin",
  description: "Inspect one inventory ledger movement without editing posted history.",
};

export default async function InventoryMovementDetailPage({
  params,
}: {
  params: Promise<{ movementId: string }>;
}) {
  const { movementId } = await params;
  const session = await getAdminSession();
  return (
    <Suspense fallback={null}>
      <MovementDetailWorkspace
        movementId={movementId}
        permissions={session?.permissions ?? []}
      />
    </Suspense>
  );
}

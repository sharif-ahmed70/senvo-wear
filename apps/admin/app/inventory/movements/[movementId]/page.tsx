import type { Metadata } from "next";
import { Suspense } from "react";
import { adminFoundationSession } from "../../../_lib/admin-access";
import { MovementDetailWorkspace } from "./_components/movement-detail-workspace";

export const metadata: Metadata = {
  title: "Movement Details | SENVO Wear Admin",
  description:
    "Inspect one inventory ledger movement without editing posted history.",
};

export default async function InventoryMovementDetailPage({
  params,
}: {
  params: Promise<{ movementId: string }>;
}) {
  const { movementId } = await params;
  return (
    <Suspense fallback={null}>
      <MovementDetailWorkspace
        movementId={movementId}
        permissions={adminFoundationSession.permissions}
      />
    </Suspense>
  );
}

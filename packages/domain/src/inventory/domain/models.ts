export type InventoryMovementType =
  | "OPENING"
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

export type InventoryMovementStatus = "DRAFT" | "POSTED";

export type InventoryMovementLine = {
  createdAt: Date;
  id: string;
  lineNumber: number;
  movementId: string;
  note: string | null;
  organizationId: string;
  productVariantId: string;
  quantity: number;
};

export type InventoryMovement = {
  createdAt: Date;
  destinationLocationId: string | null;
  id: string;
  idempotencyKey: string;
  lines: InventoryMovementLine[];
  movementNumber: string;
  note: string | null;
  occurredAt: Date;
  organizationId: string;
  postedAt: Date | null;
  referenceId: string | null;
  referenceType: string | null;
  reversedByMovementId: string | null;
  reversalReason: string | null;
  reversesMovementId: string | null;
  sourceLocationId: string | null;
  status: InventoryMovementStatus;
  type: InventoryMovementType;
  updatedAt: Date;
  version: number;
  isReversal: boolean;
  isReversed: boolean;
};

export type OnHandBalance = {
  organizationId: string;
  productVariantId: string;
  quantity: number;
  stockLocationId: string;
};

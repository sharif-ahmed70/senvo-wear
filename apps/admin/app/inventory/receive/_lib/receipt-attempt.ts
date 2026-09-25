import {
  createInventoryMovementServiceInputSchema,
  type CreateInventoryMovementServiceInputContract,
  type InventoryMovementContract,
} from "@senvo/contracts";
import { AdminApiError } from "../../../_lib/api-client";

export const receiptPermissions = [
  "INVENTORY:READ",
  "INVENTORY:CREATE",
  "INVENTORY:UPDATE",
  "CATALOG:READ",
] as const;

export function canReceiveStock(permissions: readonly string[]): boolean {
  return receiptPermissions.every((permission) =>
    permissions.includes(permission),
  );
}

type ReceiptClient = {
  createInventoryMovementDraft: (
    input: CreateInventoryMovementServiceInputContract,
  ) => Promise<{ data: InventoryMovementContract }>;
  postInventoryMovement: (input: {
    movementId: string;
  }) => Promise<{ data: InventoryMovementContract }>;
};

// An attempt lives only in this page. Serializing once isolates it from form edits
// and supplies the exact same payload on every draft-creation retry.
export class ReceiptAttempt {
  private readonly payloadJson: string;
  private inFlight = false;
  private attempted = false;
  private movement: InventoryMovementContract | null = null;
  locked = false;

  constructor(input: unknown) {
    this.payloadJson = JSON.stringify(
      createInventoryMovementServiceInputSchema.parse(input),
    );
  }

  get draft(): InventoryMovementContract | null {
    return this.movement;
  }

  get busy(): boolean {
    return this.inFlight;
  }

  async submit(
    client: ReceiptClient,
  ): Promise<InventoryMovementContract | null> {
    if (this.inFlight) return null;
    this.inFlight = true;
    this.locked = true;
    const firstAttempt = !this.attempted;
    this.attempted = true;
    try {
      if (!this.movement) {
        try {
          this.movement = (
            await client.createInventoryMovementDraft(
              JSON.parse(
                this.payloadJson,
              ) as CreateInventoryMovementServiceInputContract,
            )
          ).data;
        } catch (error) {
          // Only an initial, definitive validation rejection permits editing.
          // After an uncertain response, even a rejection must retain the identity.
          if (
            firstAttempt &&
            error instanceof AdminApiError &&
            error.status === 400 &&
            error.category === "VALIDATION"
          ) {
            this.locked = false;
          }
          throw error;
        }
      }
      if (this.movement.status === "POSTED") return this.movement;
      this.movement = (
        await client.postInventoryMovement({ movementId: this.movement.id })
      ).data;
      if (this.movement.status !== "POSTED") {
        throw new Error(
          "The receipt has not been posted. Retry this same receipt.",
        );
      }
      return this.movement;
    } finally {
      this.inFlight = false;
    }
  }
}

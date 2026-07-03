import {
  allocateAndCreateInventoryReservation,
  BusinessRuleError,
  changeInventoryAllocationPolicyStatus,
  ConflictError,
  createInventoryAllocationPolicy,
  previewInventoryAllocation,
  replaceInventoryAllocationPolicyLocations,
  updateInventoryAllocationPolicyMetadata,
  type AllocateInventoryReservationRecord,
  type AllocateInventoryReservationResult,
  type ChangeInventoryAllocationPolicyStatusRecord,
  type CreateInventoryAllocationPolicyRecord,
  type CursorPageResult,
  type InventoryAllocationPolicy,
  type InventoryAllocationPolicyRepository,
  type InventoryAllocationPreview,
  type InventoryAllocationQueryRepository,
  type PreviewInventoryAllocationRecord,
  type ReplaceInventoryAllocationPolicyLocationsRecord,
  type UpdateInventoryAllocationPolicyMetadataRecord,
} from "../../index.js";
import { describe, expect, it } from "vitest";

const organizationId = "11111111-1111-4111-8111-111111111111";
const policyId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const otherLocationId = "44444444-4444-4444-8444-444444444444";
const variantId = "55555555-5555-4555-8555-555555555555";

describe("inventory allocation policy use cases", () => {
  it("normalizes policy code and rejects duplicates", async () => {
    const repository = new FakePolicyRepository();

    const policy = await createInventoryAllocationPolicy(repository, {
      code: " web first ",
      name: " Web First ",
      organizationId,
    });

    expect(policy).toMatchObject({
      code: "WEB-FIRST",
      requireSellableLocation: true,
      strategy: "PRIORITY_ORDER",
      version: 1,
    });
    await expect(
      createInventoryAllocationPolicy(repository, {
        code: "web-first",
        name: "Duplicate",
        organizationId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("validates replacement uniqueness and forwards optimistic version", async () => {
    const repository = new FakePolicyRepository();
    await createInventoryAllocationPolicy(repository, {
      code: "ALLOC",
      name: "Allocation",
      organizationId,
    });

    await expect(
      replaceInventoryAllocationPolicyLocations(repository, {
        expectedVersion: 1,
        locations: [
          { priority: 1, stockLocationId: locationId },
          { priority: 2, stockLocationId: locationId },
        ],
        organizationId,
        policyId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      replaceInventoryAllocationPolicyLocations(repository, {
        expectedVersion: 1,
        locations: [
          { priority: 1, stockLocationId: locationId },
          { priority: 1, stockLocationId: otherLocationId },
        ],
        organizationId,
        policyId,
      }),
    ).rejects.toThrow("priority");

    const updated = await replaceInventoryAllocationPolicyLocations(
      repository,
      {
        expectedVersion: 1,
        locations: [
          { priority: 2, stockLocationId: otherLocationId },
          { isEnabled: false, priority: 1, stockLocationId: locationId },
        ],
        organizationId,
        policyId,
      },
    );

    expect(updated.version).toBe(2);
    expect(repository.lastReplacement?.expectedVersion).toBe(1);
    expect(updated.locations.map((location) => location.priority)).toEqual([
      1, 2,
    ]);
  });

  it("forwards metadata and lifecycle changes without allowing code edits", async () => {
    const repository = new FakePolicyRepository();
    await createInventoryAllocationPolicy(repository, {
      code: "STORE",
      name: "Store",
      organizationId,
      requireSellableLocation: false,
    });

    const metadata = await updateInventoryAllocationPolicyMetadata(repository, {
      expectedVersion: 1,
      name: "Store Updated",
      organizationId,
      policyId,
    });
    expect(metadata).toMatchObject({
      name: "Store Updated",
      requireSellableLocation: false,
      version: 2,
    });

    const inactive = await changeInventoryAllocationPolicyStatus(repository, {
      expectedVersion: 2,
      organizationId,
      policyId,
      status: "INACTIVE",
    });
    expect(inactive.status).toBe("INACTIVE");
  });

  it("validates allocation lines and creates stable payload signatures", async () => {
    const repository = new FakeAllocationQueryRepository();

    await expect(
      previewInventoryAllocation(repository, {
        lines: [
          { productVariantId: variantId, quantity: 1 },
          { productVariantId: variantId, quantity: 1 },
        ],
        organizationId,
        policyId,
      }),
    ).rejects.toThrow("only once");
    await expect(
      allocateAndCreateInventoryReservation(repository, {
        idempotencyKey: "allocation-key",
        lines: [{ productVariantId: variantId, quantity: 0 }],
        organizationId,
        policyId,
        reservationNumber: "ALLOC-1",
      }),
    ).rejects.toThrow("positive integer");

    const result = await allocateAndCreateInventoryReservation(repository, {
      idempotencyKey: "allocation-key",
      lines: [{ productVariantId: variantId, quantity: 2 }],
      note: " Checkout hold ",
      organizationId,
      policyId,
      preferredLocationId: locationId,
      referenceId: "CART-1",
      referenceType: "CHECKOUT",
      reservationNumber: "alloc-1",
    });

    expect(result.selectedStockLocationId).toBe(locationId);
    expect(repository.lastSignature).toContain('"reservationNumber":"ALLOC-1"');
    expect(repository.lastSignature).toContain('"preferredLocationId"');
  });
});

class FakePolicyRepository implements InventoryAllocationPolicyRepository {
  private policy: InventoryAllocationPolicy | null = null;
  public lastReplacement: ReplaceInventoryAllocationPolicyLocationsRecord | null =
    null;

  changeStatus(
    record: ChangeInventoryAllocationPolicyStatusRecord,
  ): Promise<InventoryAllocationPolicy> {
    this.ensurePolicy(record.expectedVersion);
    this.policy = {
      ...this.policy!,
      status: record.status,
      updatedAt: new Date(),
      version: this.policy!.version + 1,
    };
    return Promise.resolve(this.policy);
  }

  create(
    record: CreateInventoryAllocationPolicyRecord,
  ): Promise<InventoryAllocationPolicy> {
    this.policy = {
      code: record.code,
      createdAt: new Date(),
      id: policyId,
      locations: [],
      name: record.name,
      organizationId: record.organizationId,
      requireSellableLocation: record.requireSellableLocation,
      status: "ACTIVE",
      strategy: record.strategy,
      updatedAt: new Date(),
      version: 1,
    };
    return Promise.resolve(this.policy);
  }

  findByCode(
    organizationIdInput: string,
    code: string,
  ): Promise<InventoryAllocationPolicy | null> {
    return Promise.resolve(
      this.policy?.organizationId === organizationIdInput &&
        this.policy.code === code
        ? this.policy
        : null,
    );
  }

  findById(): Promise<InventoryAllocationPolicy | null> {
    return Promise.resolve(this.policy);
  }

  list(): Promise<CursorPageResult<InventoryAllocationPolicy>> {
    return Promise.resolve({
      hasMore: false,
      items: this.policy ? [this.policy] : [],
      nextCursor: null,
    });
  }

  replaceLocations(
    record: ReplaceInventoryAllocationPolicyLocationsRecord,
  ): Promise<InventoryAllocationPolicy> {
    this.ensurePolicy(record.expectedVersion);
    this.lastReplacement = record;
    this.policy = {
      ...this.policy!,
      locations: [...record.locations]
        .sort((left, right) => left.priority - right.priority)
        .map((location, index) => ({
          createdAt: new Date(),
          id: `location-${index}`,
          isEnabled: location.isEnabled,
          organizationId: record.organizationId,
          policyId: record.policyId,
          priority: location.priority,
          stockLocationId: location.stockLocationId,
          updatedAt: new Date(),
        })),
      updatedAt: new Date(),
      version: this.policy!.version + 1,
    };
    return Promise.resolve(this.policy);
  }

  updateMetadata(
    record: UpdateInventoryAllocationPolicyMetadataRecord,
  ): Promise<InventoryAllocationPolicy> {
    this.ensurePolicy(record.expectedVersion);
    this.policy = {
      ...this.policy!,
      name: record.metadata.name,
      requireSellableLocation:
        record.metadata.requireSellableLocation ??
        this.policy!.requireSellableLocation,
      updatedAt: new Date(),
      version: this.policy!.version + 1,
    };
    return Promise.resolve(this.policy);
  }

  private ensurePolicy(expectedVersion: number) {
    if (!this.policy || this.policy.version !== expectedVersion) {
      throw new ConflictError("Inventory allocation policy has changed.");
    }
  }
}

class FakeAllocationQueryRepository implements InventoryAllocationQueryRepository {
  public lastSignature: string | null = null;

  allocateAndReserve(
    record: AllocateInventoryReservationRecord,
    payloadSignature: string,
  ): Promise<AllocateInventoryReservationResult> {
    this.lastSignature = payloadSignature;
    return Promise.resolve({
      reservation: {
        confirmedAt: null,
        consumedByMovementId: null,
        createdAt: new Date(),
        expiredAt: null,
        expiresAt: record.expiresAt,
        id: "66666666-6666-4666-8666-666666666666",
        idempotencyKey: record.idempotencyKey,
        isConsumed: false,
        lines: record.lines.map((line, index) => ({
          createdAt: new Date(),
          id: `line-${index}`,
          lineNumber: index + 1,
          organizationId: record.organizationId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          reservationId: "66666666-6666-4666-8666-666666666666",
        })),
        note: record.note,
        organizationId: record.organizationId,
        referenceId: record.referenceId,
        referenceType: record.referenceType,
        releasedAt: null,
        reservationNumber: record.reservationNumber,
        status: "ACTIVE",
        stockLocationId: record.preferredLocationId ?? locationId,
        updatedAt: new Date(),
        version: 1,
      },
      selectedBranchId: "77777777-7777-4777-8777-777777777777",
      selectedStockLocationId: record.preferredLocationId ?? locationId,
    });
  }

  preview(
    record: PreviewInventoryAllocationRecord,
  ): Promise<InventoryAllocationPreview> {
    return Promise.resolve({
      canFulfill: true,
      evaluatedAt: new Date(),
      failureReason: null,
      lines: record.lines,
      policyId: record.policyId,
      selectedBranchId: "77777777-7777-4777-8777-777777777777",
      selectedLines: record.lines.map((line) => ({
        ...line,
        availableQuantity: 10,
        onHandQuantity: 10,
        reservedQuantity: 0,
      })),
      selectedStockLocationId: record.preferredLocationId ?? locationId,
    });
  }
}

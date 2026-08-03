import { describe, expect, it } from "vitest";
import {
  createVariantBarcode,
  listVariantBarcodes,
  lookupVariantByBarcode,
  updateBarcodeStatus,
} from "../application/barcode-use-cases.js";
import type { BarcodeLookupResult, VariantBarcode } from "../domain/models.js";
import type {
  BarcodeRepository,
  CreateVariantBarcodeRecord,
} from "../repositories/catalog-repositories.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "10000000-0000-4000-8000-000000000002";
const variantId = "20000000-0000-4000-8000-000000000001";

describe("catalog barcode use cases", () => {
  it("normalizes supported codes and validates numeric check digits", async () => {
    const repository = new FakeBarcodeRepository();

    await expect(
      createVariantBarcode(repository, {
        organizationId,
        productVariantId: variantId,
        type: "INTERNAL",
        value: "  senvo-shirt-l  ",
      }),
    ).resolves.toMatchObject({ value: "SENVO-SHIRT-L" });

    await expect(
      createVariantBarcode(new FakeBarcodeRepository(), {
        organizationId,
        productVariantId: variantId,
        type: "EAN13",
        value: "4006381333931",
      }),
    ).resolves.toMatchObject({ value: "4006381333931" });

    await expect(
      createVariantBarcode(new FakeBarcodeRepository(), {
        organizationId,
        productVariantId: variantId,
        type: "EAN13",
        value: "4006381333932",
      }),
    ).rejects.toThrow("check digit is invalid");
  });

  it("blocks globally duplicated values and a second active code", async () => {
    const repository = new FakeBarcodeRepository();
    await createVariantBarcode(repository, {
      organizationId,
      productVariantId: variantId,
      type: "INTERNAL",
      value: "FIRST-CODE",
    });

    await expect(
      createVariantBarcode(repository, {
        organizationId: otherOrganizationId,
        productVariantId: repository.otherVariantId,
        type: "INTERNAL",
        value: "first-code",
      }),
    ).rejects.toThrow("Barcode already exists");
    await expect(
      createVariantBarcode(repository, {
        organizationId,
        productVariantId: variantId,
        type: "CODE128",
        value: "SECOND-CODE",
      }),
    ).rejects.toThrow("already has an active barcode");
  });

  it("keeps inactive history but rejects inactive lookup", async () => {
    const repository = new FakeBarcodeRepository();
    const created = await createVariantBarcode(repository, {
      organizationId,
      productVariantId: variantId,
      type: "INTERNAL",
      value: "HISTORY-001",
    });

    await updateBarcodeStatus(repository, {
      barcodeId: created.id,
      organizationId,
      status: "INACTIVE",
    });

    await expect(
      lookupVariantByBarcode(repository, {
        organizationId,
        value: "history-001",
      }),
    ).rejects.toThrow("Active barcode was not found");
    await expect(
      listVariantBarcodes(repository, {
        organizationId,
        productVariantId: variantId,
      }),
    ).resolves.toMatchObject([{ id: created.id, status: "INACTIVE" }]);
  });

  it("prevents organization-crossing list, lookup, and status changes", async () => {
    const repository = new FakeBarcodeRepository();
    const created = await createVariantBarcode(repository, {
      organizationId,
      productVariantId: variantId,
      type: "INTERNAL",
      value: "ORG-ISOLATED",
    });

    await expect(
      listVariantBarcodes(repository, {
        organizationId: otherOrganizationId,
        productVariantId: variantId,
      }),
    ).rejects.toThrow("Product variant was not found");
    await expect(
      lookupVariantByBarcode(repository, {
        organizationId: otherOrganizationId,
        value: created.value,
      }),
    ).rejects.toThrow("Active barcode was not found");
    await expect(
      updateBarcodeStatus(repository, {
        barcodeId: created.id,
        organizationId: otherOrganizationId,
        status: "INACTIVE",
      }),
    ).rejects.toThrow("Barcode was not found");
  });
});

class FakeBarcodeRepository implements BarcodeRepository {
  readonly otherVariantId = "20000000-0000-4000-8000-000000000002";
  private readonly records: VariantBarcode[] = [];
  private readonly variants = new Map([
    [variantId, organizationId],
    [this.otherVariantId, otherOrganizationId],
  ]);

  create(record: CreateVariantBarcodeRecord) {
    const created: VariantBarcode = {
      ...record,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      id: `30000000-0000-4000-8000-${String(this.records.length + 1).padStart(12, "0")}`,
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
    };
    this.records.push(created);
    return Promise.resolve(created);
  }

  existsByValue(value: string) {
    return Promise.resolve(
      this.records.some((record) => record.value === value),
    );
  }

  findActiveByVariant(organizationIdValue: string, variantIdValue: string) {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.organizationId === organizationIdValue &&
          record.productVariantId === variantIdValue &&
          record.status === "ACTIVE",
      ) ?? null,
    );
  }

  findById(id: string, organizationIdValue: string) {
    return Promise.resolve(
      this.records.find(
        (record) =>
          record.id === id && record.organizationId === organizationIdValue,
      ) ?? null,
    );
  }

  listByVariant(organizationIdValue: string, variantIdValue: string) {
    return Promise.resolve(
      this.records.filter(
        (record) =>
          record.organizationId === organizationIdValue &&
          record.productVariantId === variantIdValue,
      ),
    );
  }

  lookupActive(organizationIdValue: string, value: string) {
    const barcode = this.records.find(
      (record) =>
        record.organizationId === organizationIdValue &&
        record.status === "ACTIVE" &&
        record.value === value,
    );
    if (!barcode) return Promise.resolve(null);
    return Promise.resolve({
      barcode,
      color: "Black",
      productName: "Oxford Shirt",
      size: "Large",
      sku: "OXFORD-BLK-L",
      sellingPriceMinor: 2500,
      variantId: barcode.productVariantId,
      variantStatus: "ACTIVE",
    } satisfies BarcodeLookupResult);
  }

  async updateStatus(input: {
    id: string;
    organizationId: string;
    status: VariantBarcode["status"];
  }) {
    const barcode = await this.findById(input.id, input.organizationId);
    if (!barcode) return null;
    barcode.status = input.status;
    barcode.updatedAt = new Date("2026-08-03T01:00:00.000Z");
    return barcode;
  }

  variantExists(organizationIdValue: string, variantIdValue: string) {
    return Promise.resolve(
      this.variants.get(variantIdValue) === organizationIdValue,
    );
  }
}

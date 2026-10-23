import { describe, expect, it } from "vitest";
import { salesReceiptContractSchema } from "@senvo/contracts";
import { pickContractFields } from "./contract-fields.js";

describe("pickContractFields", () => {
  it("drops internal ids so a strict contract accepts the record", () => {
    const record = {
      organizationId: "org",
      paymentBatchId: "batch",
      receiptNumber: "R-1",
    };
    expect(() => salesReceiptContractSchema.parse(record)).toThrow(
      /Unrecognized keys/u,
    );
    expect(pickContractFields(salesReceiptContractSchema, record)).toEqual({
      receiptNumber: "R-1",
    });
  });
});

import { describe, expect, it } from "vitest";
import { AdminApiError } from "../../../_lib/api-client";
import { friendlyPosError } from "./pos-error-messages";

function error(code: ConstructorParameters<typeof AdminApiError>[0]["code"]) {
  return new AdminApiError({
    code,
    message: "Internal detail",
    requestId: "req_support_1",
    status: 400,
  });
}

describe("cashier-safe POS errors", () => {
  it("shows a clear shared-cart refresh message for stale versions", () => {
    const reason = new AdminApiError({
      code: "CONFLICT.STATE",
      message: "Cart changed on another screen. Refresh.",
      status: 409,
      requestId: "req_stale",
    });
    expect(friendlyPosError(reason, "cart")).toEqual({
      message: "Cart changed on another screen. Refresh.",
      uncertain: false,
      requestId: "req_stale",
    });
  });
  it("maps missing barcodes without exposing API codes", () => {
    expect(
      friendlyPosError(error("NOT_FOUND.RESOURCE"), "lookup"),
    ).toMatchObject({
      message: "No product was found for this barcode.",
      uncertain: false,
    });
  });

  it("marks checkout network failures for safe idempotent retry", () => {
    expect(
      friendlyPosError(error("INTEGRATION.NETWORK_FAILURE"), "checkout"),
    ).toEqual({
      message:
        "We could not confirm the result. Retry safely to check whether the sale was completed.",
      requestId: "req_support_1",
      uncertain: true,
    });
  });

  it("maps stock or session business failures to a recovery action", () => {
    expect(
      friendlyPosError(error("BUSINESS_RULE.VIOLATION"), "checkout").message,
    ).toContain("Check stock and the active sales session");
  });
});

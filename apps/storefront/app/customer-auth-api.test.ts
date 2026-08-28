import { describe, expect, it } from "vitest";
import { safeAccountRedirect } from "./_lib/customer-auth-api";

describe("customer authentication browser boundary", () => {
  it("preserves safe same-site redirect intent", () => {
    expect(safeAccountRedirect("/checkout?step=delivery")).toBe(
      "/checkout?step=delivery",
    );
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeAccountRedirect("https://attacker.example")).toBe("/");
    expect(safeAccountRedirect("//attacker.example")).toBe("/");
  });

  it("uses the caller fallback when redirect intent is absent", () => {
    expect(safeAccountRedirect(null, "/account")).toBe("/account");
  });
});

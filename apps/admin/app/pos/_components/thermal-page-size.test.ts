import { describe, expect, it } from "vitest";
import { thermalPageHeightMm } from "./thermal-page-size";

describe("thermalPageHeightMm", () => {
  it("follows the receipt length plus a small tear-off margin", () => {
    // 100 mm at 96 dpi, plus 6 mm.
    expect(thermalPageHeightMm((100 * 96) / 25.4)).toBe(106);
  });

  it("keeps a sensible minimum and maximum", () => {
    expect(thermalPageHeightMm(10)).toBe(60);
    expect(thermalPageHeightMm(100_000)).toBe(1000);
  });
});

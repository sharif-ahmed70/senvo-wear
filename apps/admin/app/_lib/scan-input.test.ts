import { describe, expect, it } from "vitest";
import { normalizeScannedCode } from "./scan-input";

describe("normalizeScannedCode", () => {
  it("turns Bangla digits from a Bangla keyboard layout into 0-9", () => {
    expect(normalizeScannedCode("২৯০৯২২৩৫২৭৯৬")).toBe("290922352796");
  });

  it("drops spaces and control characters a scanner may add", () => {
    expect(normalizeScannedCode(" 2909223527 96\t\r\n")).toBe("290922352796");
    expect(normalizeScannedCode("​290922352796﻿")).toBe(
      "290922352796",
    );
  });

  it("keeps SKUs as they are", () => {
    expect(normalizeScannedCode("SHI-0001-BLUE-XL")).toBe("SHI-0001-BLUE-XL");
  });
});

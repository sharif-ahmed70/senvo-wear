import { describe, expect, it } from "vitest";
import { formatBdt, maximumMinorAmount, parseTaka, takaInput } from "./money";

describe("POS Taka conversion", () => {
  it.each([
    ["1200", 120000],
    ["1200.5", 120050],
    ["1200.50", 120050],
    [" 001.05 ", 105],
    ["0.01", 1],
    ["21474836.47", maximumMinorAmount],
  ])("parses %s without floating-point multiplication", (value, expected) => {
    expect(parseTaka(value)).toBe(expected);
  });

  it.each(["", "-1", "1.001", "1.", ".50", "1,000", "abc", "21474836.48"])(
    "rejects invalid or unsafe value %s",
    (value) => expect(parseTaka(value)).toBeNull(),
  );

  it("formats BDT consistently and creates editable input values", () => {
    expect(formatBdt(120050)).toContain("1,200.50");
    expect(takaInput(120050)).toBe("1200.50");
  });
});

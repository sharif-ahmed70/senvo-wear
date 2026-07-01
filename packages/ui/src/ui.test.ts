import { describe, expect, it } from "vitest";
import { cn } from "./utils/cn.js";

describe("cn", () => {
  it("composes truthy class names and omits absent values", () => {
    expect(cn("base", false, undefined, "active")).toBe("base active");
  });
});

import { describe, expect, it } from "vitest";
import { createTestRequestId } from "./index.js";

describe("createTestRequestId", () => {
  it("creates a traceable request id for tests", () => {
    expect(createTestRequestId("foundation")).toMatch(
      /^foundation_[0-9a-f-]{36}$/,
    );
  });
});

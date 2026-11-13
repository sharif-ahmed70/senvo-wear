import { describe, expect, it } from "vitest";
import { saleSearchQuery } from "./return-exchange-finder";

describe("saleSearchQuery", () => {
  it("does not filter by channel, so counter and booth sales are found", () => {
    // POS saves counter sales as OFFLINE_STORE and booth sales as
    // EVENT_BOOTH, never as "POS".
    const query = saleSearchQuery("JER-0001-YELLOW-XL");
    expect(query).not.toHaveProperty("channel");
    expect(query.search).toBe("JER-0001-YELLOW-XL");
  });

  it("keeps the search within the API's 64 characters", () => {
    expect(saleSearchQuery("x".repeat(100)).search).toHaveLength(64);
  });
});

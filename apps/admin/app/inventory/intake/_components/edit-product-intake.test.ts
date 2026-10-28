import { describe, expect, it } from "vitest";
import type { IntakeLine, PriceDraft } from "../_lib/intake-draft";
import { fillAddedLinePrices } from "./edit-product-intake";

function line(key: string, sizeName: string, existingPrice?: number): IntakeLine {
  return {
    colorId: key.split("::")[0] ?? "",
    colorName: "Black",
    existing:
      existingPrice === undefined
        ? null
        : {
            colorName: "Black",
            onHand: 0,
            sellingPriceMinor: existingPrice,
            sizeName,
            variantId: `v-${key}`,
          },
    key,
    quantity: 2,
    sizeName,
  };
}

const prices: PriceDraft = {
  costAll: "",
  overrides: {
    "a::m": { cost: "300", sell: "550" },
    "a::l": { cost: "320", sell: "600" },
  },
  sellAll: "",
};

describe("fillAddedLinePrices", () => {
  it("copies the same size's prices to an added colour, once", () => {
    const filled = new Set(["a::m", "a::l"]);
    const lines = [line("a::m", "M"), line("a::l", "L"), line("b::l", "L")];
    const next = fillAddedLinePrices(lines, prices, filled);
    expect(next?.overrides["b::l"]).toEqual({ cost: "320", sell: "600" });
    expect(fillAddedLinePrices(lines, next ?? prices, filled)).toBeNull();
  });

  it("uses the first row for a new size and keeps an old variant's price", () => {
    const filled = new Set(["a::m"]);
    const lines = [line("a::m", "M"), line("a::xl", "XL"), line("c::m", "M", 70000)];
    const next = fillAddedLinePrices(lines, prices, filled);
    expect(next?.overrides["a::xl"]).toEqual({ cost: "300", sell: "550" });
    expect(next?.overrides["c::m"]).toEqual({ cost: "300", sell: "700" });
  });
});

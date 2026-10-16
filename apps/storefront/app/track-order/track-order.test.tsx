import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackOrderWorkspace } from "./track-order-workspace";

describe("Storefront Guest Order Tracking", () => {
  it("renders order tracking form with order number and phone inputs", () => {
    const html = renderToStaticMarkup(<TrackOrderWorkspace />);

    expect(html).toContain("Track Your SENVO Order");
    expect(html).toContain("Live Order Tracking");
    expect(html).toContain("Order Number *");
    expect(html).toContain("Phone Number *");
    expect(html).toContain('placeholder="e.g. SO-2026-0001"');
    expect(html).toContain('placeholder="e.g. 01700000000"');
    expect(html).toContain("Find Order Status");
  });

  it("disables submit button initially when fields are empty", () => {
    const html = renderToStaticMarkup(<TrackOrderWorkspace />);

    expect(html).toContain("disabled");
  });
});

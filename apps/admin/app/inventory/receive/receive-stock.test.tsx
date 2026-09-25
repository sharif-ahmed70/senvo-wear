import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InventoryMovementContract } from "@senvo/contracts";
import ReceiveStockPage from "./page";
import {
  ReceiveStockWorkflow,
  ReviewStep,
  SuccessStep,
} from "./_components/receive-stock-workflow";
import { AdminApiClient } from "../../_lib/api-client";
import { AdminSessionProvider } from "../../admin-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inventory/receive",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("ReceiveStockWorkflow", () => {
  it.each([
    "INVENTORY:READ",
    "INVENTORY:CREATE",
    "INVENTORY:UPDATE",
    "CATALOG:READ",
  ] as const)("blocks workflow entry without %s", (missing) => {
    const permissions = [
      "INVENTORY:READ",
      "INVENTORY:CREATE",
      "INVENTORY:UPDATE",
      "CATALOG:READ",
    ] as const;
    const html = renderToStaticMarkup(
      <ReceiveStockWorkflow
        permissions={permissions.filter((p) => p !== missing)}
      />,
    );
    expect(html).not.toContain("Preparing stock receipt");
    expect(html).not.toContain("Review before posting");
    expect(html).toContain(
      missing === "INVENTORY:READ"
        ? "Inventory access is restricted"
        : "Receiving stock requires permission",
    );
  });

  it.each([false, true])(
    "locks review editing only after submission: %s",
    (locked) => {
      const html = renderToStaticMarkup(
        <ReviewStep
          locked={locked}
          draftMovement={null}
          lines={[]}
          locationName="Warehouse"
          note="Note"
          onBack={vi.fn()}
          onConfirm={vi.fn()}
          saving={false}
          setNote={vi.fn()}
          totalUnits={5}
        />,
      );
      expect(/<textarea[^>]*disabled/.test(html)).toBe(locked);
      expect(/<button[^>]*disabled[^>]*>[\s\S]*?Edit items/.test(html)).toBe(
        locked,
      );
      expect(html.includes("Retry this receipt")).toBe(locked);
    },
  );

  it("shows permission barrier when user lacks INVENTORY:CREATE", () => {
    const html = renderToStaticMarkup(
      <ReceiveStockWorkflow permissions={["INVENTORY:READ"]} />,
    );
    expect(html).toContain("Receiving stock requires permission");
    expect(html).toContain(
      "Receiving stock requires inventory read, create and update permissions, plus catalog read access.",
    );
  });

  it("renders page inside AdminSessionProvider with appropriate permissions", () => {
    const html = renderToStaticMarkup(
      createElement(
        AdminSessionProvider,
        {
          session: {
            displayName: "Store Manager",
            organizationName: "SENVO Wear",
            permissions: [
              "INVENTORY:READ",
              "INVENTORY:CREATE",
              "INVENTORY:UPDATE",
              "CATALOG:READ",
            ],
            role: "MANAGER",
            userId: "user-1",
          },
        },
        createElement(ReceiveStockPage),
      ),
    );
    expect(html).toContain("Preparing stock receipt");
  });

  it("calls the draft and posting endpoints through the typed client", async () => {
    const sampleLine = {
      createdAt: "2026-09-24T12:00:00.000Z",
      id: "10000000-0000-4000-8000-000000000020",
      lineNumber: 1,
      movementId: "10000000-0000-4000-8000-000000000010",
      note: null,
      organizationId: "10000000-0000-4000-8000-000000000001",
      productVariantId: "10000000-0000-4000-8000-000000000030",
      quantity: 25,
    };

    const draftMovement: InventoryMovementContract = {
      consumesReservationId: null,
      createdAt: "2026-09-24T12:00:00.000Z",
      destinationLocationId: "10000000-0000-4000-8000-000000000002",
      id: "10000000-0000-4000-8000-000000000010",
      idempotencyKey: "admin-receive:rc-test-1",
      isReservationConsumption: false,
      isReversal: false,
      isReversed: false,
      lines: [sampleLine],
      movementNumber: "RC-2026-0001",
      note: "Shipment from central factory",
      occurredAt: "2026-09-24T12:00:00.000Z",
      organizationId: "10000000-0000-4000-8000-000000000001",
      postedAt: null,
      referenceId: "rc-test-1",
      referenceType: "ADMIN_RECEIPT",
      reversalReason: null,
      reversedByMovementId: null,
      reversesMovementId: null,
      sourceLocationId: null,
      status: "DRAFT",
      type: "RECEIPT",
      updatedAt: "2026-09-24T12:00:00.000Z",
      version: 1,
    };

    const postedMovement: InventoryMovementContract = {
      ...draftMovement,
      postedAt: "2026-09-24T12:05:00.000Z",
      status: "POSTED",
      version: 2,
    };

    const fetcher = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      const urlStr =
        typeof url === "string"
          ? url
          : url instanceof URL
            ? url.toString()
            : url.url;
      const method = init?.method ?? "GET";

      if (urlStr.endsWith("/inventory/movement-drafts") && method === "POST") {
        return Promise.resolve(
          Response.json({
            data: draftMovement,
            requestId: "req_draft_success",
            success: true,
          }),
        );
      }

      if (urlStr.endsWith("/inventory/movements") && method === "POST") {
        return Promise.resolve(
          Response.json({
            data: postedMovement,
            requestId: "req_post_success",
            success: true,
          }),
        );
      }

      return Promise.resolve(
        Response.json({
          data: {},
          requestId: "req_other",
          success: true,
        }),
      );
    });

    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });

    // Step 1: Create draft
    const draftResult = await client.createInventoryMovementDraft({
      destinationLocationId: "10000000-0000-4000-8000-000000000002",
      idempotencyKey: "admin-receive:rc-test-1",
      lines: [
        {
          productVariantId: "10000000-0000-4000-8000-000000000030",
          quantity: 25,
        },
      ],
      movementNumber: "RC-2026-0001",
      note: "Shipment from central factory",
      occurredAt: "2026-09-24T12:00:00.000Z",
      referenceId: "rc-test-1",
      referenceType: "ADMIN_RECEIPT",
      sourceLocationId: null,
      type: "RECEIPT",
    });

    expect(draftResult.data.status).toBe("DRAFT");
    expect(draftResult.data.movementNumber).toBe("RC-2026-0001");
    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.example.test/inventory/movement-drafts",
      expect.objectContaining({
        method: "POST",
      }),
    );

    // Step 2: Post draft movement
    const postResult = await client.postInventoryMovement({
      movementId: draftResult.data.id,
    });

    expect(postResult.data.status).toBe("POSTED");
    expect(postResult.data.movementNumber).toBe("RC-2026-0001");
    expect(fetcher).toHaveBeenCalledWith(
      "https://admin.example.test/inventory/movements",
      expect.objectContaining({
        body: JSON.stringify({ movementId: draftMovement.id }),
        method: "POST",
      }),
    );
  });

  it("renders Step 4 complete state (SuccessStep) with received units, location name, and movement number", () => {
    const postedMovement: InventoryMovementContract = {
      consumesReservationId: null,
      createdAt: "2026-09-24T12:00:00.000Z",
      destinationLocationId: "10000000-0000-4000-8000-000000000002",
      id: "10000000-0000-4000-8000-000000000010",
      idempotencyKey: "admin-receive:rc-test-1",
      isReservationConsumption: false,
      isReversal: false,
      isReversed: false,
      lines: [
        {
          createdAt: "2026-09-24T12:00:00.000Z",
          id: "10000000-0000-4000-8000-000000000020",
          lineNumber: 1,
          movementId: "10000000-0000-4000-8000-000000000010",
          note: null,
          organizationId: "10000000-0000-4000-8000-000000000001",
          productVariantId: "10000000-0000-4000-8000-000000000030",
          quantity: 25,
        },
      ],
      movementNumber: "RC-2026-0001",
      note: "Shipment from central factory",
      occurredAt: "2026-09-24T12:00:00.000Z",
      organizationId: "10000000-0000-4000-8000-000000000001",
      postedAt: "2026-09-24T12:05:00.000Z",
      referenceId: "rc-test-1",
      referenceType: "ADMIN_RECEIPT",
      reversalReason: null,
      reversedByMovementId: null,
      reversesMovementId: null,
      sourceLocationId: null,
      status: "POSTED",
      type: "RECEIPT",
      updatedAt: "2026-09-24T12:00:00.000Z",
      version: 2,
    };

    const lines = [
      {
        color: "Navy",
        productName: "Oxford Cotton Shirt",
        quantity: 25,
        size: "M",
        sku: "OX-NAVY-M",
        variantId: "10000000-0000-4000-8000-000000000030",
      },
    ];

    const html = renderToStaticMarkup(
      <SuccessStep
        lines={lines}
        locationName="Central Warehouse"
        movement={postedMovement}
        onReset={vi.fn()}
        totalUnits={25}
      />,
    );

    expect(html).toContain("Stock received");
    expect(html).toContain("25 units are now in the ledger");
    expect(html).toContain("Central Warehouse");
    expect(html).toContain("RC-2026-0001");
    expect(html).toContain("Posted");
    expect(html).toContain("View inventory");
    expect(html).toContain("Movement history");
    expect(html).toContain("Receive another shipment");
  });
});

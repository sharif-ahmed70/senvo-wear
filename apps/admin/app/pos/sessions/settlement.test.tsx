import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BDT_DENOMINATIONS,
  calculateDenominationTotalMinor,
  CashDenominationCounter,
} from "./_components/cash-denomination-counter";
import { ZReportPreview } from "./[id]/z-report/z-report-preview";
import { PosManagementWorkspace } from "../_components/pos-management-workspace";

describe("POS Register Settlement & Reconciliation", () => {
  describe("BDT Cash Denomination Calculations", () => {
    it("has all standard Bangladeshi note and coin denominations", () => {
      const values = BDT_DENOMINATIONS.map((d) => d.value);
      expect(values).toEqual([1000, 500, 200, 100, 50, 20, 10, 5, 2, 1]);
    });

    it("calculates exact minor units for counted notes", () => {
      // 3 x 1000 = 3,000 BDT = 300,000 minor
      // 2 x 500 = 1,000 BDT = 100,000 minor
      // 5 x 20 = 100 BDT = 10,000 minor
      // Total = 4,100 BDT = 410,000 minor
      const counts = {
        "1000": 3,
        "500": 2,
        "20": 5,
      };

      const totalMinor = calculateDenominationTotalMinor(counts);
      expect(totalMinor).toBe(410000);
    });

    it("handles empty and zero counts safely", () => {
      expect(calculateDenominationTotalMinor({})).toBe(0);
      expect(
        calculateDenominationTotalMinor({
          "1000": 0,
          "500": 0,
          "100": 0,
        }),
      ).toBe(0);
    });

    it("renders denomination counter component with all rows", () => {
      const markup = renderToStaticMarkup(
        <CashDenominationCounter
          counts={{ "1000": 2, "500": 1 }}
          onChange={() => {}}
          onApply={() => {}}
        />,
      );

      expect(markup).toContain("Cash Drawer Denomination Count");
      expect(markup).toContain("৳1,000");
      expect(markup).toContain("৳500");
      expect(markup).toContain("৳200");
      expect(markup).toContain("৳100");
      expect(markup).toContain("Apply to Cash Drawer");
    });
  });

  describe("Discrepancy Calculation Logic", () => {
    it("determines BALANCED status when actual matches expected exactly", () => {
      const expectedTotalMinor = 50000;
      const actualTotalMinor = 50000;
      const diff = actualTotalMinor - expectedTotalMinor;
      const status =
        diff === 0 ? "BALANCED" : diff > 0 ? "OVERAGE" : "SHORTAGE";

      expect(status).toBe("BALANCED");
      expect(diff).toBe(0);
    });

    it("determines SHORTAGE status when actual is less than expected", () => {
      const expectedTotalMinor = 50000;
      const actualTotalMinor = 48000; // 2000 minor shortage
      const diff = actualTotalMinor - expectedTotalMinor;
      const status =
        diff === 0 ? "BALANCED" : diff > 0 ? "OVERAGE" : "SHORTAGE";

      expect(status).toBe("SHORTAGE");
      expect(diff).toBe(-2000);
    });

    it("determines OVERAGE status when actual is greater than expected", () => {
      const expectedTotalMinor = 50000;
      const actualTotalMinor = 51500; // 1500 minor overage
      const diff = actualTotalMinor - expectedTotalMinor;
      const status =
        diff === 0 ? "BALANCED" : diff > 0 ? "OVERAGE" : "SHORTAGE";

      expect(status).toBe("OVERAGE");
      expect(diff).toBe(1500);
    });
  });

  describe("Permissions in POS Management Workspace", () => {
    it("renders access unavailable if user lacks POS:READ", () => {
      const markup = renderToStaticMarkup(
        <PosManagementWorkspace
          permissions={["CATALOG:READ"]}
          view="sessions"
        />,
      );

      expect(markup).toContain("Access unavailable");
      expect(markup).toContain(
        "Your role does not include sales counter access.",
      );
    });

    it("renders sessions view when user has POS:READ", () => {
      const markup = renderToStaticMarkup(
        <PosManagementWorkspace permissions={["POS:READ"]} view="sessions" />,
      );

      expect(markup).toContain("Sales Sessions");
      expect(markup).toContain(
        "Open a working session before your team starts an in-person sale.",
      );
    });
  });

  describe("Printable Z-Report Preview", () => {
    const sessionId = "10000000-0000-4000-8000-000000000001";

    it("blocks access to Z-Report with POS:READ but no POS:APPROVE", () => {
      const markup = renderToStaticMarkup(
        <ZReportPreview sessionId={sessionId} permissions={["POS:READ"]} />,
      );

      expect(markup).toContain("Access Restricted");
      expect(markup).toContain(
        "Your role does not include permission to view POS register reports.",
      );
    });

    it("renders loading state initially when authorized", () => {
      const markup = renderToStaticMarkup(
        <ZReportPreview sessionId={sessionId} permissions={["POS:APPROVE"]} />,
      );

      expect(markup).toContain("Generating Day-End Z-Report...");
    });
  });
});

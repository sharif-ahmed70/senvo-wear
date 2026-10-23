import { describe, expect, it } from "vitest";
import {
  BARCODE_MODULE_MM,
  encodeCode128,
} from "./barcode-generation-workflow";

describe("encodeCode128", () => {
  it("encodes even-length digit values in set C at about half the width", () => {
    const short = encodeCode128("123456789012");
    // start + 6 pairs + checksum = 8 symbols of 11 modules, stop 13, quiet 2*10.
    expect(short.mode).toBe("C");
    expect(short.width).toBe(11 * 8 + 13 + 20);
    expect(encodeCode128("SV-MVGT2X1H-DF71E081AD8D").mode).toBe("B");
  });

  it("falls back to set B for odd digit counts and text", () => {
    expect(encodeCode128("12345").mode).toBe("B");
    expect(encodeCode128("FOR-0001").mode).toBe("B");
  });

  it("fits a 40 mm label with a whole number of printer dots per module", () => {
    const widthMm = encodeCode128("123456789012").width * BARCODE_MODULE_MM;
    expect(widthMm).toBeLessThan(36);
    expect((BARCODE_MODULE_MM / 25.4) * 203).toBeCloseTo(2, 2);
  });
});

import type { KeyboardEvent } from "react";

/**
 * Cleans what a barcode scanner typed into a text box. A USB scanner acts as a
 * keyboard, so with the Windows Bangla layout active its digits arrive as
 * Bangla digits (০-৯), and some scanners add spaces or control characters.
 * Barcodes and SKUs never contain those, so they are converted or dropped.
 */
export function normalizeScannedCode(raw: string): string {
  return Array.from(raw)
    .map((character) => {
      const code = character.charCodeAt(0);
      // Bengali digits U+09E6..U+09EF -> 0..9
      if (code >= 0x09e6 && code <= 0x09ef) return String(code - 0x09e6);
      return character;
    })
    .filter((character) => {
      const code = character.charCodeAt(0);
      const control = code < 0x20 || code === 0x7f;
      const zeroWidth = (code >= 0x200b && code <= 0x200d) || code === 0xfeff;
      return !control && !zeroWidth && !/\s/u.test(character);
    })
    .join("");
}

/**
 * Key handler for a scan box inside a form: scanners end a scan with Enter or
 * Tab. Both submit the form (Tab would otherwise move focus away and the scan
 * would be lost).
 */
export function submitScanOnEnterOrTab(
  event: KeyboardEvent<HTMLInputElement>,
): void {
  if (event.key !== "Enter" && event.key !== "Tab") return;
  if (!event.currentTarget.value.trim()) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

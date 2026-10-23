"use client";

import { useEffect, useRef, useState } from "react";

/** 3 inch roll: about 76 mm wide; the receipt itself is 72 mm. */
export const THERMAL_PAGE_WIDTH_MM = 76;
const MIN_HEIGHT_MM = 60;
const MAX_HEIGHT_MM = 1000;
const PX_PER_MM = 96 / 25.4;

/** Paper length for a receipt of the given on-screen height. */
export function thermalPageHeightMm(receiptHeightPx: number): number {
  const mm = Math.ceil(receiptHeightPx / PX_PER_MM) + 6;
  return Math.min(MAX_HEIGHT_MM, Math.max(MIN_HEIGHT_MM, mm));
}

/**
 * Sets the print page to exactly one receipt: 76 mm wide and as long as the
 * receipt on screen (the screen layout is the same 72 mm layout as print), so a
 * roll printer prints one continuous receipt with no browser header/footer.
 * With `autoPrint`, opens the print dialog once the size is known.
 */
export function ThermalPageSize({
  autoPrint = false,
}: {
  autoPrint?: boolean;
}) {
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(
      ".receipt-page .receipt-document",
    );
    if (!target) return;
    const measure = () =>
      setHeightMm(thermalPageHeightMm(target.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPrint || heightMm === null || printed.current) return;
    printed.current = true;
    // Let the new @page rule apply before the dialog reads it.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, heightMm]);

  return heightMm === null ? null : (
    <style>{`@page { size: ${THERMAL_PAGE_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`}</style>
  );
}

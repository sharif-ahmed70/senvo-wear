/** Parse decimal taka without rounding fractional minor units. */
export function parseVariantPrice(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole = "", fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 2_147_483_647
    ? minor
    : null;
}

export function formatVariantPrice(minor: number): string {
  return `\u09f3${(minor / 100).toFixed(2)}${minor === 0 ? " - Review price" : ""}`;
}

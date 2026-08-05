const maximumMinorAmount = 2_147_483_647;

export function parseTaka(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:0|[0-9]+)(?:\.[0-9]{1,2})?$/u.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor <= BigInt(maximumMinorAmount) ? Number(minor) : null;
}

export function formatBdt(minor: number): string {
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(minor / 100);
}

export function takaInput(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

export { maximumMinorAmount };

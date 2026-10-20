/**
 * Keeps only the fields a strict response contract declares. Domain records
 * carry internal identifiers (for example organizationId) that must not be
 * part of the API response; passing them to a strict schema throws and turns
 * a valid record into an "unexpected error".
 */
export function pickContractFields<T extends Record<string, unknown>>(
  schema: { shape: Record<string, unknown> },
  record: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key in schema.shape),
  );
}

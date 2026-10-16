/**
 * Starting size lists for the quantity grid, chosen from the product type
 * ("কী মাল") and audience ("কার জন্য"). Staff can still add or remove sizes.
 */

export const SIZE_PRESETS = {
  default: ["S", "M", "L", "XL", "XXL"],
  kids: ["2Y", "4Y", "6Y", "8Y", "10Y"],
  pant: ["28", "30", "32", "34", "36"],
  panjabi: ["38", "40", "42", "44", "46"],
  saree: ["Free Size"],
  shorts: ["S", "M", "L", "XL"],
  top: ["S", "M", "L", "XL", "XXL"],
} as const satisfies Record<string, readonly string[]>;

export type SizePresetKey = keyof typeof SIZE_PRESETS;

const kidsPattern =
  /\b(kid|kids|child|children|baby|boys?|girls?)\b|বাচ্চা|শিশু/iu;

// Checked in order; "shorts" must win before the shirt family.
const typePatterns: ReadonlyArray<[SizePresetKey, RegExp]> = [
  ["shorts", /\bshorts?\b|হাফ ?প্যান্ট|শর্টস/iu],
  ["saree", /\bsar(ee|i)\b|শাড়ি|শাড়ী/iu],
  ["panjabi", /\bp(a|u)njabi\b|পাঞ্জাবি|পাঞ্জাবী/iu],
  ["pant", /\b(pants?|jeans|trousers?|gabardine|chinos?)\b|প্যান্ট/iu],
  [
    "top",
    /\b(t-?shirts?|tee|shirts?|kamiz|kameez|kurti|tops?|polo)\b|শার্ট|কামিজ|টপস/iu,
  ],
];

export function sizePresetKeyFor(
  typeName: string,
  audienceName = "",
): SizePresetKey {
  if (kidsPattern.test(typeName) || kidsPattern.test(audienceName)) {
    return "kids";
  }
  const match = typePatterns.find(([, pattern]) => pattern.test(typeName));
  return match ? match[0] : "default";
}

export function sizePresetFor(typeName: string, audienceName = ""): string[] {
  return [...SIZE_PRESETS[sizePresetKeyFor(typeName, audienceName)]];
}

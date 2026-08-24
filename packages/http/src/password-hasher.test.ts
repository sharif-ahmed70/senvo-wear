import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "./password-hasher.js";

describe("ScryptPasswordHasher", () => {
  it("hashes with a unique salt and verifies without retaining plaintext", async () => {
    const hasher = new ScryptPasswordHasher();
    const first = await hasher.hash("Strong shop password 1");
    const second = await hasher.hash("Strong shop password 1");
    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/u);
    expect(first).not.toBe(second);
    await expect(hasher.verify("Strong shop password 1", first)).resolves.toBe(
      true,
    );
    await expect(hasher.verify("wrong password", first)).resolves.toBe(false);
    await expect(
      hasher.verify("Strong shop password 1", "legacy"),
    ).resolves.toBe(false);
  });
});

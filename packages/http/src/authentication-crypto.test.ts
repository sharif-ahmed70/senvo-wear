import { describe, expect, it } from "vitest";
import {
  NodeAuthenticationSecretService,
  NodeScryptPasswordHasher,
} from "./authentication-crypto.js";

describe("authentication crypto", () => {
  it("hashes passwords with a random salt and verifies only the correct secret", async () => {
    const passwords = new NodeScryptPasswordHasher();
    const first = await passwords.hash("Strong!Password123");
    const second = await passwords.hash("Strong!Password123");

    expect(first).not.toBe(second);
    await expect(passwords.verify("Strong!Password123", first)).resolves.toBe(
      true,
    );
    await expect(passwords.verify("wrong", first)).resolves.toBe(false);
    await expect(
      passwords.verify("Strong!Password123", "invalid"),
    ).resolves.toBe(false);
  });

  it("generates opaque tokens, six-digit codes, and verifiable hashes", () => {
    const secrets = new NodeAuthenticationSecretService("a".repeat(32));
    const token = secrets.generateToken();
    const code = secrets.generateCode();
    const hash = secrets.hashSecret(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(code).toMatch(/^[0-9]{6}$/u);
    expect(hash).not.toContain(token);
    expect(secrets.verifySecret(token, hash)).toBe(true);
    expect(secrets.verifySecret("different", hash)).toBe(false);
  });

  it("rejects undersized authentication peppers", () => {
    expect(() => new NodeAuthenticationSecretService("short")).toThrow(
      "AUTH_SECRET",
    );
  });
});

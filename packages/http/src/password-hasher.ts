import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "@senvo/domain";

const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plainTextPassword: string): Promise<string> {
    assertPassword(plainTextPassword);
    const salt = randomBytes(16);
    const derived = await derive(
      plainTextPassword,
      salt,
      cost,
      blockSize,
      parallelization,
    );
    return [
      "scrypt",
      cost,
      blockSize,
      parallelization,
      salt.toString("base64url"),
      derived.toString("base64url"),
    ].join("$");
  }

  async verify(
    plainTextPassword: string,
    passwordHash: string,
  ): Promise<boolean> {
    const [algorithm, n, r, p, saltText, keyText, extra] =
      passwordHash.split("$");
    const parsedCost = Number(n);
    const parsedBlockSize = Number(r);
    const parsedParallelization = Number(p);
    if (
      extra !== undefined ||
      algorithm !== "scrypt" ||
      !saltText ||
      !keyText ||
      parsedCost !== cost ||
      parsedBlockSize !== blockSize ||
      parsedParallelization !== parallelization
    ) {
      return false;
    }
    try {
      const expected = Buffer.from(keyText, "base64url");
      if (expected.length !== keyLength) return false;
      const actual = await derive(
        plainTextPassword,
        Buffer.from(saltText, "base64url"),
        parsedCost,
        parsedBlockSize,
        parsedParallelization,
      );
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, p, r }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function assertPassword(value: string): void {
  if (value.length < 12 || value.length > 256) {
    throw new Error("Password must contain between 12 and 256 characters.");
  }
}

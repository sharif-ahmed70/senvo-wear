import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type {
  AuthenticationSecretService,
  PasswordHasher,
} from "@senvo/domain";

const cost = 16_384;
const blockSize = 8;
const parallelization = 1;
const keyLength = 64;

export class NodeScryptPasswordHasher implements PasswordHasher {
  async hash(plainTextPassword: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await deriveKey(plainTextPassword, salt, keyLength, {
      N: cost,
      maxmem: 64 * 1024 * 1024,
      p: parallelization,
      r: blockSize,
    });
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
    const [algorithm, costText, blockText, parallelText, saltText, hashText] =
      passwordHash.split("$");
    if (
      algorithm !== "scrypt" ||
      !costText ||
      !blockText ||
      !parallelText ||
      !saltText ||
      !hashText
    ) {
      return false;
    }
    const stored = Buffer.from(hashText, "base64url");
    if (stored.length !== keyLength) return false;
    try {
      const derived = await deriveKey(
        plainTextPassword,
        Buffer.from(saltText, "base64url"),
        stored.length,
        {
          N: Number(costText),
          maxmem: 64 * 1024 * 1024,
          p: Number(parallelText),
          r: Number(blockText),
        },
      );
      return timingSafeEqual(derived, stored);
    } catch {
      return false;
    }
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; maxmem: number; p: number; r: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export class NodeAuthenticationSecretService implements AuthenticationSecretService {
  constructor(private readonly pepper: string) {
    if (Buffer.byteLength(pepper, "utf8") < 32) {
      throw new Error("AUTH_SECRET must contain at least 32 bytes.");
    }
  }

  generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashSecret(secret: string): string {
    return createHmac("sha256", this.pepper).update(secret).digest("hex");
  }

  verifySecret(secret: string, secretHash: string): boolean {
    const actual = Buffer.from(this.hashSecret(secret), "hex");
    const expected = Buffer.from(secretHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}

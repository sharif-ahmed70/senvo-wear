import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  authenticateCredential,
  createUserCredential,
  type CreateUserCredentialRecord,
  type User,
  type UserCredential,
  type UserCredentialRepository,
  type UserRepository,
} from "../../index.js";
import { describe, expect, it } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";

describe("authentication service", () => {
  it("accepts active credentials for active users", async () => {
    const repositories = createRepositories();
    const credential = await createUserCredential(repositories, {
      identifier: "owner@senvo.test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      userId,
    });

    await expect(
      authenticateCredential(repositories, {
        identifier: credential.identifier,
        provider: "PASSWORD",
        requestId: "req_auth_1",
      }),
    ).resolves.toEqual({
      authenticatedUserId: userId,
      provider: "PASSWORD",
      requestId: "req_auth_1",
    });
  });

  it("rejects inactive credentials", async () => {
    const repositories = createRepositories();
    await createUserCredential(repositories, {
      identifier: "owner@senvo.test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      status: "INACTIVE",
      userId,
    });

    await expect(
      authenticateCredential(repositories, {
        identifier: "owner@senvo.test",
        provider: "PASSWORD",
        requestId: "req_auth_1",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects inactive users", async () => {
    const repositories = createRepositories({
      status: "LOCKED",
    });
    await expect(
      createUserCredential(repositories, {
        identifier: "owner@senvo.test",
        passwordHash: "hashed_password_value_1234567890",
        provider: "PASSWORD",
        userId,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("rejects duplicate provider identifiers", async () => {
    const repositories = createRepositories();
    await createUserCredential(repositories, {
      identifier: "Owner@Senvo.Test",
      passwordHash: "hashed_password_value_1234567890",
      provider: "PASSWORD",
      userId,
    });

    await expect(
      createUserCredential(repositories, {
        identifier: "owner@senvo.test",
        passwordHash: "hashed_password_value_abcdefghij",
        provider: "PASSWORD",
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

function createRepositories(userOverrides: Partial<User> = {}): {
  credentials: UserCredentialRepository;
  users: UserRepository;
} {
  return {
    credentials: new FakeCredentialRepository(),
    users: new FakeUserRepository(userOverrides),
  };
}

function baseUser(overrides: Partial<User> = {}): User {
  const timestamp = new Date("2026-07-15T00:00:00.000Z");
  return {
    createdAt: timestamp,
    email: "owner@senvo.test",
    id: userId,
    name: null,
    status: "ACTIVE",
    updatedAt: timestamp,
    version: 1,
    ...overrides,
  };
}

class FakeUserRepository implements UserRepository {
  private readonly user: User;

  constructor(overrides: Partial<User>) {
    this.user = baseUser(overrides);
  }

  create(): Promise<User> {
    return Promise.reject(new Error("Unexpected create call."));
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(this.user);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(id === this.user.id ? this.user : null);
  }
}

class FakeCredentialRepository implements UserCredentialRepository {
  private readonly credentials = new Map<string, UserCredential>();

  changeStatus(): Promise<UserCredential | null> {
    return Promise.reject(new Error("Unexpected changeStatus call."));
  }

  replacePassword(): Promise<UserCredential | null> {
    return Promise.reject(new Error("Unexpected replacePassword call."));
  }

  create(record: CreateUserCredentialRecord): Promise<UserCredential> {
    const timestamp = new Date("2026-07-15T00:00:00.000Z");
    const credential = {
      ...record,
      createdAt: timestamp,
      id: credentialId,
      updatedAt: timestamp,
      version: 1,
    };
    this.credentials.set(`${record.provider}:${record.identifier}`, credential);
    return Promise.resolve(credential);
  }

  findById(): Promise<UserCredential | null> {
    return Promise.resolve(null);
  }

  findByProviderIdentifier(
    provider: UserCredential["provider"],
    identifier: string,
  ): Promise<UserCredential | null> {
    return Promise.resolve(
      this.credentials.get(`${provider}:${identifier}`) ?? null,
    );
  }
}

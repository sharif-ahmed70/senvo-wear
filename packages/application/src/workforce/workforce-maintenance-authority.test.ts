import { AuthorizationError, ValidationApplicationError } from "@senvo/domain";
import { describe, expect, it } from "vitest";
import { WorkforceMaintenanceAuthority } from "./workforce-maintenance-authority.js";

describe("WorkforceMaintenanceAuthority", () => {
  const input = {
    targetUserId: "user-123",
    operatorId: "operator",
    credentialId: "cred-123",
    expectedVersion: 3,
  };
  const epoch = Date.parse("2026-09-01T12:00:00Z");

  it("issues and consumes an identity-bound capability exactly once", () => {
    const authority = new WorkforceMaintenanceAuthority();
    const cap = authority.issueCapability(input);
    expect(
      authority.verifyAndConsume(
        cap,
        input.targetUserId,
        input.expectedVersion,
        input.credentialId,
      ),
    ).toBe(cap);
    expect(() =>
      authority.verifyAndConsume(
        cap,
        input.targetUserId,
        input.expectedVersion,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
  });

  it("exposed Date mutation cannot extend expiry or alter the issuance boundary", () => {
    let now = epoch;
    const authority = new WorkforceMaintenanceAuthority(() => new Date(now));
    const cap = authority.issueCapability({ ...input, lifetimeSeconds: 60 });
    cap.expiresAt.setFullYear(2099);
    cap.issuedAt.setFullYear(1990);
    now = epoch - 1;
    expect(() =>
      authority.verifyAndConsume(
        cap,
        input.targetUserId,
        3,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
    now = epoch + 60001;
    expect(() =>
      authority.verifyAndConsume(
        cap,
        input.targetUserId,
        3,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
  });

  it.each([0, 59999, 60000, 60001])(
    "enforces strict expiry at offset %i",
    (offset) => {
      let now = epoch;
      const authority = new WorkforceMaintenanceAuthority(() => new Date(now));
      const cap = authority.issueCapability({ ...input, lifetimeSeconds: 60 });
      now += offset;
      const consume = () =>
        authority.verifyAndConsume(
          cap,
          input.targetUserId,
          3,
          input.credentialId,
        );
      if (offset < 60000) expect(consume()).toBe(cap);
      else expect(consume).toThrow(AuthorizationError);
    },
  );

  it("rejects invalid lifetimes and accepts the 1 and 300 second limits", () => {
    const authority = new WorkforceMaintenanceAuthority();
    for (const lifetimeSeconds of [0, -1, 301, 1.5, NaN, Infinity]) {
      expect(() =>
        authority.issueCapability({ ...input, lifetimeSeconds }),
      ).toThrow(ValidationApplicationError);
    }
    for (const lifetimeSeconds of [1, 300])
      expect(() =>
        authority.issueCapability({ ...input, lifetimeSeconds }),
      ).not.toThrow();
  });

  it("rejects invalid clock values and credential versions", () => {
    expect(() =>
      new WorkforceMaintenanceAuthority(() => new Date(NaN)).issueCapability(
        input,
      ),
    ).toThrow(ValidationApplicationError);
    const authority = new WorkforceMaintenanceAuthority();
    for (const expectedVersion of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        authority.issueCapability({ ...input, expectedVersion }),
      ).toThrow(ValidationApplicationError);
    }
  });

  it("rejects copied and fabricated capability objects", () => {
    const authority = new WorkforceMaintenanceAuthority();
    const cap = authority.issueCapability(input);
    expect(() =>
      authority.verifyAndConsume(
        { ...cap },
        input.targetUserId,
        3,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
    expect(() =>
      authority.verifyAndConsume(
        { ...cap, id: "fabricated" },
        input.targetUserId,
        3,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
  });

  it("rejects wrong targets, credentials, versions, and omitted bindings", () => {
    const authority = new WorkforceMaintenanceAuthority();
    const cap = authority.issueCapability(input);
    expect(() =>
      authority.verifyAndConsume(cap, "other", 3, input.credentialId),
    ).toThrow(AuthorizationError);
    expect(() =>
      authority.verifyAndConsume(cap, input.targetUserId, 3, "other"),
    ).toThrow(AuthorizationError);
    expect(() =>
      authority.verifyAndConsume(
        cap,
        input.targetUserId,
        4,
        input.credentialId,
      ),
    ).toThrow(AuthorizationError);
    expect(() =>
      authority.verifyAndConsume(cap, input.targetUserId, 3),
    ).toThrow(AuthorizationError);
    expect(() => authority.verifyAndConsume(cap, input.targetUserId)).toThrow(
      AuthorizationError,
    );
  });
});

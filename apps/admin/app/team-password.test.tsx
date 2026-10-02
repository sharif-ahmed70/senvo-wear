import { describe, expect, it, vi } from "vitest";
import { AdminApiClient } from "./_lib/api-client";
import { canResetPassword } from "./organization/_lib/team-roles";

describe("team member passwords (admin)", () => {
  it("sends a password reset as PUT without trusted fields in the body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ data: {}, requestId: "req_reset", success: true }),
        ),
      );
    const client = new AdminApiClient({
      baseUrl: "https://admin.example.test",
      fetcher,
    });
    const teamMemberId = "10000000-0000-4000-8000-000000000001";
    await client.resetTeamMemberPassword({
      expectedVersion: 3,
      newPassword: " Keep spaces 1 ",
      teamMemberId,
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://admin.example.test/organization/team/${teamMemberId}/password`,
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({
      expectedVersion: 3,
      newPassword: " Keep spaces 1 ",
    });
  });

  it("offers Password reset only for members the actor manages, never yourself", () => {
    const owner = { role: "OWNER" as const, userId: "owner" };
    const admin = { role: "ADMIN" as const, userId: "admin" };
    expect(canResetPassword(owner, { role: "ADMIN", userId: "admin" })).toBe(
      true,
    );
    expect(canResetPassword(owner, { role: "OWNER", userId: "owner-2" })).toBe(
      true,
    );
    expect(canResetPassword(owner, { role: "OWNER", userId: "owner" })).toBe(
      false,
    );
    expect(canResetPassword(admin, { role: "OWNER", userId: "owner" })).toBe(
      false,
    );
    expect(canResetPassword(admin, { role: "ADMIN", userId: "admin-2" })).toBe(
      false,
    );
    expect(canResetPassword(admin, { role: "STAFF", userId: "staff" })).toBe(
      true,
    );
    expect(
      canResetPassword(
        { role: "MANAGER", userId: "m" },
        { role: "STAFF", userId: "s" },
      ),
    ).toBe(false);
    expect(canResetPassword(null, { role: "STAFF", userId: "s" })).toBe(false);
  });
});

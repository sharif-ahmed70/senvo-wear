import { describe, expect, it } from "vitest";
import {
  ApplicationError,
  InternalApplicationError,
  SalesOrderReservationExpiredError,
  ValidationApplicationError,
} from "./errors.js";

describe("application errors", () => {
  it("serializes validation errors without technical details", () => {
    const error = new ValidationApplicationError(
      "SQL detail should stay internal",
      {
        query: "select secret",
      },
    );

    expect(error.message).toContain("SQL detail");
    expect(error.toPublicError()).toEqual({
      category: "VALIDATION",
      code: "VALIDATION.INVALID_INPUT",
      message: "Input is invalid.",
    });
  });

  it("uses a safe public message for internal errors", () => {
    const error = new InternalApplicationError(
      "internal filesystem detail failed",
    );

    expect(error.toPublicError().message).toBe("An unexpected error occurred.");
    expect(error.toPublicError().message).not.toContain("filesystem");
  });

  it("creates SalesOrderReservationExpiredError with expected domain properties", () => {
    const error = new SalesOrderReservationExpiredError();
    expect(error.category).toBe("BUSINESS_RULE");
    expect(error.code).toBe("BUSINESS_RULE.SALES_ORDER_RESERVATION_EXPIRED");
    expect(error.message).toBe("Sales order reservation has expired.");
    expect(error.publicMessage).toBe("The request cannot be completed.");
    expect(error.name).toBe("SalesOrderReservationExpiredError");
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toBeInstanceOf(SalesOrderReservationExpiredError);
  });
});

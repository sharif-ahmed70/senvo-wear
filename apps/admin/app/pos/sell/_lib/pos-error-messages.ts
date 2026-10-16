import { AdminApiError } from "../../../_lib/api-client";

export type FriendlyPosError = {
  message: string;
  requestId?: string;
  uncertain: boolean;
};

export function friendlyPosError(
  reason: unknown,
  operation: "cart" | "checkout" | "lookup" | "session",
): FriendlyPosError {
  if (!(reason instanceof AdminApiError)) {
    return {
      message: "Something went wrong. Please try again.",
      uncertain: operation === "checkout",
    };
  }
  if (reason.code === "INTEGRATION.NETWORK_FAILURE") {
    return {
      message:
        operation === "checkout"
          ? "We could not confirm the result. Retry safely to check whether the sale was completed."
          : "The service could not be reached. Check your connection and try again.",
      requestId: reason.requestId,
      uncertain: operation === "checkout",
    };
  }
  if (
    reason.code === "CONFLICT.STATE" &&
    reason.message === "Cart changed on another screen. Refresh."
  )
    return {
      message: reason.message,
      requestId: reason.requestId,
      uncertain: false,
    };
  const messages: Partial<Record<string, string>> = {
    "AUTHENTICATION.REQUIRED":
      "Your sign-in is no longer active. Sign in again to continue.",
    "AUTHORIZATION.FORBIDDEN":
      "You do not have access to complete this action.",
    "BUSINESS_RULE.VIOLATION":
      operation === "lookup"
        ? "This product is not available for sale."
        : "The sale could not be completed. Check stock and the active sales session.",
    "CONFLICT.STATE":
      "This sale has already been completed or changed. Refresh before continuing.",
    "CONFLICT.IDEMPOTENCY":
      "The payment details changed after this sale attempt. Review them before trying again.",
    "NOT_FOUND.RESOURCE":
      operation === "lookup"
        ? "No product was found for this barcode."
        : "This sale is no longer available. Start a new sale or refresh the page.",
    "VALIDATION.INVALID_INPUT":
      "Check the highlighted information and try again.",
  };
  return {
    message:
      messages[reason.code] ??
      "We could not complete that action. Please try again.",
    requestId: reason.requestId,
    uncertain: false,
  };
}

import type { AuthenticationMessageProvider } from "@senvo/domain";

export class UnavailableAuthenticationMessageProvider implements AuthenticationMessageProvider {
  sendEmailOtp() {
    return Promise.resolve("UNAVAILABLE" as const);
  }

  sendEmailVerification() {
    return Promise.resolve("UNAVAILABLE" as const);
  }

  sendPasswordReset() {
    return Promise.resolve("UNAVAILABLE" as const);
  }

  sendPhoneOtp() {
    return Promise.resolve("UNAVAILABLE" as const);
  }
}

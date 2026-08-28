import { createHash, randomBytes } from "node:crypto";
import type { GoogleIdentity, GoogleOAuthProvider } from "@senvo/domain";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";

export function loadGoogleOAuthProvider(
  environment: NodeJS.ProcessEnv,
): GoogleOAuthProvider | undefined {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = environment.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId && !clientSecret && !redirectUri) return undefined;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be configured together.",
    );
  }
  const redirect = new URL(redirectUri);
  if (
    redirect.protocol !== "https:" &&
    !(
      environment.APP_ENV === "development" &&
      redirect.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(redirect.hostname)
    )
  ) {
    throw new Error("GOOGLE_REDIRECT_URI must use HTTPS.");
  }
  return new GoogleAuthorizationCodeProvider({
    clientId,
    clientSecret,
    redirectUri: redirect.href,
  });
}

class GoogleAuthorizationCodeProvider implements GoogleOAuthProvider {
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    },
  ) {}

  authorizationRequest(input: { state: string }) {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      access_type: "offline",
      client_id: this.config.clientId,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      include_granted_scopes: "true",
      prompt: "select_account",
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: input.state,
    }).toString();
    return { codeVerifier, url: url.href };
  }

  async exchange(input: {
    code: string;
    codeVerifier: string;
  }): Promise<GoogleIdentity> {
    const tokenResponse = await fetch(tokenEndpoint, {
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed.");
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string" || !token.access_token) {
      throw new Error("Google token response was invalid.");
    }
    const profileResponse = await fetch(userInfoEndpoint, {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!profileResponse.ok) throw new Error("Google identity lookup failed.");
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    if (
      typeof profile.sub !== "string" ||
      typeof profile.email !== "string" ||
      profile.email_verified !== true
    ) {
      throw new Error("Google did not return a verified identity.");
    }
    return {
      email: profile.email,
      emailVerified: true,
      firstName:
        typeof profile.given_name === "string" && profile.given_name
          ? profile.given_name
          : "SENVO",
      lastName:
        typeof profile.family_name === "string" && profile.family_name
          ? profile.family_name
          : "Customer",
      subject: profile.sub,
    };
  }
}

import { createServer } from "node:http";
import {
  createPostInventoryMovementApiHandler,
  createSalesOrderApiHandler,
  createStorefrontApiHandlers,
} from "@senvo/api";
import {
  createApplicationServices,
  type ApplicationAuthorizationService,
} from "@senvo/application";
import { AuthorizationError } from "@senvo/domain";
import { DevelopmentAuthenticationService } from "./development-authentication.js";
import {
  NodeAuthenticationSecretService,
  NodeScryptPasswordHasher,
} from "./authentication-crypto.js";
import { UnavailableAuthenticationMessageProvider } from "./authentication-message-provider.js";
import { createCustomerAuthenticationRequestListener } from "./customer-authentication-http.js";
import { createWorkforceAuthenticationRequestListener } from "./workforce-authentication-http.js";
import { loadGoogleOAuthProvider } from "./google-oauth-provider.js";
import { createDevelopmentCorsRequestListener } from "./development-cors.js";
import { loadDevelopmentServerConfig } from "./development-server-config.js";
import { createSenvoHttpRequestListener } from "./node-http-adapter.js";
import {
  DevelopmentHeaderRequestContextFactory,
  WorkforceSessionRequestContextFactory,
} from "./request-context.js";

const config = loadDevelopmentServerConfig(process.env);
const passwordHasher = new NodeScryptPasswordHasher();
const authenticationSecret = process.env.AUTH_SECRET?.trim();
const authenticationSecrets = authenticationSecret
  ? new NodeAuthenticationSecretService(authenticationSecret)
  : undefined;
const fallbackPasswordHash = authenticationSecrets
  ? await passwordHasher.hash(authenticationSecrets.generateToken())
  : undefined;
const authenticationService = new DevelopmentAuthenticationService(
  "development",
);
const authorizationService: ApplicationAuthorizationService = {
  authorize(context, permission) {
    const allowed = context.permissions?.some(
      (candidate) =>
        candidate.action === permission.action &&
        candidate.resource === permission.resource,
    );
    return allowed
      ? Promise.resolve()
      : Promise.reject(new AuthorizationError("Permission is required."));
  },
};
const services = createApplicationServices({
  authenticationService,
  authorizationService,
  storefrontOrganizationCode: config.organizationCode,
  useSharedPrismaClient: false,
  ...(authenticationSecrets && fallbackPasswordHash
    ? {
        authenticationMessages: new UnavailableAuthenticationMessageProvider(),
        authenticationSecrets,
        fallbackPasswordHash,
        googleOAuthProvider: loadGoogleOAuthProvider(process.env),
        passwordHasher,
      }
    : {}),
});
const apiListener = createSenvoHttpRequestListener({
  contextFactory: services.workforceAuthentication
    ? new WorkforceSessionRequestContextFactory(
        services.workforceAuthentication,
      )
    : new DevelopmentHeaderRequestContextFactory("development"),
  handlers: {
    createSalesOrder: createSalesOrderApiHandler({
      authenticationService,
      authorizationService,
      sales: services.sales,
    }),
    postInventoryMovement: createPostInventoryMovementApiHandler({
      authenticationService,
      authorizationService,
      inventory: services.inventory,
    }),
    storefront: createStorefrontApiHandlers(services.storefront),
  },
});
const listener = (() => {
  let wrapped = apiListener;
  if (services.workforceAuthentication) {
    wrapped = createWorkforceAuthenticationRequestListener({
      application: services.workforceAuthentication,
      delegate: wrapped,
      publicOrigin: config.allowedOrigin,
      secureCookies: false,
    });
  }
  if (services.customerAuthentication) {
    wrapped = createCustomerAuthenticationRequestListener({
      application: services.customerAuthentication,
      delegate: wrapped,
      publicOrigin: config.allowedOrigin,
      secureCookies: false,
    });
  }
  return wrapped;
})();
const server = createServer(
  createDevelopmentCorsRequestListener(listener, config.allowedOrigin),
);

server.once("error", (error) => {
  console.error("SENVO development API failed to start.", error);
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
  console.log(`SENVO development API: http://localhost:${config.port}`);
  console.log(`Storefront origin: ${config.allowedOrigin}`);
  console.log(`Storefront organization: ${config.organizationCode}`);
  console.log(
    `Customer authentication: ${
      services.customerAuthentication
        ? "enabled"
        : "disabled (AUTH_SECRET missing)"
    }`,
  );
  console.log(
    `Workforce authentication: ${
      services.workforceAuthentication
        ? "enabled"
        : "disabled (AUTH_SECRET missing)"
    }`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void services.disconnect().finally(() => {
        process.exitCode = 0;
      });
    });
  });
}

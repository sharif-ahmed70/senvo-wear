import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import type {
  ApplicationAuthorizationService,
  ApplicationServices,
} from "@senvo/application";
import { AuthorizationError } from "@senvo/domain";
import {
  NodeAuthenticationSecretService,
  NodeScryptPasswordHasher,
} from "./authentication-crypto.js";
import { UnavailableAuthenticationMessageProvider } from "./authentication-message-provider.js";
import { createCustomerAuthenticationRequestListener } from "./customer-authentication-http.js";
import { createDevelopmentApiHandlers } from "./development-handlers.js";
import { loadGoogleOAuthProvider } from "./google-oauth-provider.js";
import { createSenvoHttpRequestListener } from "./node-http-adapter.js";
import { createProductionCorsRequestListener } from "./production-cors.js";
import {
  loadProductionServerConfig,
  type ProductionServerConfig,
} from "./production-server-config.js";
import {
  WorkforceSessionRequestContextFactory,
  type HttpRequestContextFactory,
} from "./request-context.js";
import { createWorkforceAuthenticationRequestListener } from "./workforce-authentication-http.js";

export type ProductionLogger = {
  debug(message: string, ...details: unknown[]): void;
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
};

export function createProductionConsoleLogger(
  serviceName = "production-api",
): ProductionLogger {
  const write = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    details: unknown[],
  ) => {
    const payload: Record<string, unknown> = {
      level,
      message,
      service: serviceName,
      timestamp: new Date().toISOString(),
    };
    for (const detail of details) {
      if (detail && typeof detail === "object") {
        Object.assign(payload, detail);
      }
    }
    const output = JSON.stringify(payload);
    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  };
  return {
    debug: (msg, ...details) => write("debug", msg, details),
    error: (msg, ...details) => write("error", msg, details),
    info: (msg, ...details) => write("info", msg, details),
    warn: (msg, ...details) => write("warn", msg, details),
  };
}

export const nullLogger: ProductionLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

export type ProductionServerComponents = {
  config: ProductionServerConfig;
  logger: ProductionLogger;
  server: Server;
  services: ApplicationServices;
};

export function createProductionRequestListener(options: {
  config: ProductionServerConfig;
  contextFactory: HttpRequestContextFactory;
  logger: ProductionLogger;
  services: ApplicationServices;
}): RequestListener {
  const { config, contextFactory, logger, services } = options;

  const apiListener = createSenvoHttpRequestListener({
    contextFactory,
    handlers: createDevelopmentApiHandlers({
      authenticationService: {
        authenticate() {
          return Promise.reject(
            new Error("Development auth is disabled in production."),
          );
        },
      },
      authorizationService: {
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
      },
      services,
    }),
  });

  let wrapped = apiListener;

  if (services.workforceAuthentication) {
    wrapped = createWorkforceAuthenticationRequestListener({
      application: services.workforceAuthentication,
      cookieDomain: config.cookieDomain,
      delegate: wrapped,
      publicOrigin: config.adminOrigins,
      sameSite:
        config.cookieSameSite === "strict"
          ? "Strict"
          : config.cookieSameSite === "none"
            ? "None"
            : "Lax",
      secureCookies: config.cookieSecure,
    });
  }

  if (services.customerAuthentication && config.storefrontOrigins.length > 0) {
    wrapped = createCustomerAuthenticationRequestListener({
      application: services.customerAuthentication,
      delegate: wrapped,
      publicOrigin: config.storefrontOrigins[0]!,
      secureCookies: config.cookieSecure,
    });
  }

  const healthAndOperationalListener: RequestListener = (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const url = new URL(request.url ?? "/", "http://senvo.internal");
    if (request.method === "GET" && url.pathname === "/health") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      void (async () => {
        const isReady = services.checkReadiness
          ? await services.checkReadiness()
          : true;
        if (isReady) {
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ status: "ready" }));
        } else {
          response.statusCode = 503;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ status: "unavailable" }));
        }
      })();
      return;
    }

    wrapped(request, response);
  };

  const corsListener = createProductionCorsRequestListener(
    healthAndOperationalListener,
    {
      adminOrigins: config.adminOrigins,
      storefrontOrigins: config.storefrontOrigins,
    },
  );

  return (request: IncomingMessage, response: ServerResponse) => {
    const startTime = Date.now();
    const requestId = (request.headers["x-request-id"] as string) || undefined;

    response.once("finish", () => {
      const durationMs = Date.now() - startTime;
      const status = response.statusCode;
      const path = pathname(request);
      const metadata = {
        durationMs,
        method: request.method,
        path,
        status,
      };

      if (status >= 500) {
        logger.error("HTTP request error", metadata, { requestId });
      } else if (status >= 400) {
        logger.warn("HTTP request client error", metadata, { requestId });
      } else {
        logger.info("HTTP request completed", metadata, { requestId });
      }
    });

    corsListener(request, response);
  };
}

export async function createProductionServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProductionServerComponents> {
  const config = loadProductionServerConfig(env);
  const logger = createProductionConsoleLogger("production-api");

  const passwordHasher = new NodeScryptPasswordHasher();
  const authenticationSecrets = new NodeAuthenticationSecretService(
    config.authSecret,
  );
  const fallbackPasswordHash = await passwordHasher.hash(
    authenticationSecrets.generateToken(),
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

  const { createApplicationServices } = await import("@senvo/application");

  const services = createApplicationServices({
    authenticationMessages: new UnavailableAuthenticationMessageProvider(),
    authenticationSecrets,
    authenticationService: {
      authenticate() {
        return Promise.reject(
          new Error("Development authentication is disabled in production."),
        );
      },
    },
    authorizationService,
    fallbackPasswordHash,
    googleOAuthProvider: loadGoogleOAuthProvider(env),
    passwordHasher,
    storefrontOrganizationCode: config.organizationCode,
    useSharedPrismaClient: true,
  });

  if (!services.workforceAuthentication) {
    throw new Error("Workforce authentication failed to initialize.");
  }

  const contextFactory = new WorkforceSessionRequestContextFactory(
    services.workforceAuthentication,
  );

  const listener = createProductionRequestListener({
    config,
    contextFactory,
    logger,
    services,
  });

  const server = createServer(listener);

  return { config, logger, server, services };
}

function pathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://senvo.internal").pathname;
  } catch {
    return "/";
  }
}

export async function shutdownProductionServer(components: {
  logger: ProductionLogger;
  server: Server;
  services: ApplicationServices;
}): Promise<void> {
  const { logger, server, services } = components;
  return new Promise<void>((resolve) => {
    server.close(() => {
      void services
        .disconnect()
        .catch((error) => {
          logger.error("Error disconnecting services during shutdown", {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          logger.info("Graceful shutdown complete.");
          resolve();
        });
    });
  });
}

async function startServer(): Promise<void> {
  const { config, logger, server, services } = await createProductionServer(
    process.env,
  );

  server.once("error", (error) => {
    logger.error("Production server failed to start", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    logger.info("SENVO production API started", {
      adminOrigins: config.adminOrigins.join(", "),
      host: config.host,
      port: config.port,
      storefrontOrigins: config.storefrontOrigins.join(", "),
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logger.info(`Received ${signal}, beginning graceful shutdown...`);
      void shutdownProductionServer({ logger, server, services }).finally(
        () => {
          process.exit(0);
        },
      );
    });
  }
}

const currentScriptUrl = import.meta.url;
const executedScriptUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (currentScriptUrl === executedScriptUrl) {
  void startServer().catch((error) => {
    console.error("Fatal startup error:", error);
    process.exit(1);
  });
}

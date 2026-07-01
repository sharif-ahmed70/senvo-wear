# Error Handling

Domain and application errors are framework-neutral. They do not import Next.js, React, Prisma, or HTTP response objects.

Error categories are validation, authentication, authorization, not-found, conflict, business-rule, concurrency, rate-limit, integration, and internal.

Presentation layers will map internal errors to HTTP responses. Public responses must not reveal stack traces, SQL, filesystem paths, credentials, private tokens, payment secrets, or sensitive customer data. Internal technical causes may be logged through safe structured logging with request or correlation IDs.

Every public error response needs a stable code and request ID. Internal messages are for logs; public messages are for users and API clients.

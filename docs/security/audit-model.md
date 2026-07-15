# Audit Security Model

Audit records answer who performed an action, which organization owned it, which resource changed, and which request caused it. They are evidence, not authorization decisions and not application logs.

## Controls

- Every entry is organization scoped.
- Repository reads require both entry ID and organization ID.
- User identity is nullable for anonymous or system work and is preserved when present.
- Organization and user deletion is restricted while referenced by audit history.
- The domain and contract boundaries reject metadata keys associated with passwords, credentials, tokens, cookies, authorization values, or secrets, including nested keys.
- Audit metadata is deliberately small in purpose and must not contain request bodies or authentication material.

No hard-delete API is provided. Retention, export, redaction governance, and privileged audit readers remain future security work.

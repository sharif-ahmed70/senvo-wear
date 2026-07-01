# Logger Package

`@senvo/logger` defines structured logging boundaries. Logs may include safe metadata and request correlation IDs, but must never include passwords, tokens, payment secrets, or sensitive customer data.

The production transport is intentionally left as an adapter decision for a later infrastructure milestone.

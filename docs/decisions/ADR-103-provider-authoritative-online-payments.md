# ADR-103: Provider-Authoritative Online Payments

## Status

Accepted

## Decision

SENVO models online payment attempts, notifications, reconciliation, and provider refunds independently of SSLCOMMERZ. A hosted provider redirect is used so SENVO never handles card credentials. Browser returns are presentation-only; authenticated IPN plus provider validation is authoritative.

Confirmed provider money appends the existing settlement and refund histories. Provider network calls remain outside database transactions, while each internal confirmation/refund transition uses one explicit transaction and attempt lock. Late success is preserved and routed to refund review instead of mutating inventory.

## Consequences

External session creation can have uncertain outcomes, so durable attempts and query-based recovery are required. Operations must provide HTTPS callbacks and server-only credentials. CI can test protocol mapping deterministically, but a credentialed sandbox and externally reachable callback remain deployment gates.

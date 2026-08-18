# SSLCOMMERZ Runbook

## Configuration

Set server-only `SSLCOMMERZ_ENABLED`, `SSLCOMMERZ_ENVIRONMENT`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_TIMEOUT_MS`, `STOREFRONT_PUBLIC_BASE_URL`, and `SSLCOMMERZ_IPN_URL`. Public and IPN URLs must be HTTPS. Keep production and sandbox credentials separate.

## Automated sandbox smoke test

With dedicated sandbox credentials and externally reachable HTTPS callback URLs configured, set `SSLCOMMERZ_SANDBOX_VERIFY=true` and run:

```sh
corepack pnpm verify:sslcommerz-sandbox
```

This creates a low-value hosted sandbox session and verifies response parsing. It is skipped by default and does not belong in ordinary CI.

## Manual end-to-end verification

1. Deploy the exact branch with sandbox environment and an HTTPS IPN endpoint.
2. Create a Storefront online-payment order and record its SENVO order number only.
3. Follow the returned hosted URL and complete the sandbox payment on SSLCOMMERZ.
4. Confirm the browser return page initially uses internal status and does not infer success from its URL.
5. Confirm IPN validation creates exactly one successful attempt, `ONLINE_GATEWAY` payment line, reconciliation, and audit entry.
6. Replay the same IPN and confirm no duplicate settlement, reconciliation success transition, or audit row.
7. Exercise fail/cancel and retry. Verify the old attempt remains and the retry is idempotent.
8. Expire/release a reservation before a sandbox success and verify `REFUND_REQUIRED` with no inventory confirmation.
9. From Admin, query provider status and initiate an eligible provider refund. Refresh until confirmed and verify one append-only refund record.

## Exceptions

Use Admin reconciliation for pending or uncertain provider outcomes. Never edit payment rows manually. Investigate `MISMATCH`, `REVIEW_REQUIRED`, and `REFUND_REQUIRED` using order number, internal attempt ID, safe provider transaction reference, and request ID. Do not place credentials or raw IPN bodies in tickets or logs.

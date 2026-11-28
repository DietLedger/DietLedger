# Personal API keys

## Provision in DietLedger web

Have an existing account and ask the operator for its trusted HTTPS origin (an explicit port is supported, for example `https://ledger.example.invalid:8443`). In web Settings, open **Personal API keys**, name the key for one client, select narrow scopes or affirmatively choose **Full personal access**, and confirm the current password. Both ordinary users and administrators can do this for their own accounts.

The secret is shown once. Copy it deliberately; avoid plaintext notes, backups, clipboard history, diagnostics, request capture and analytics. If the result is lost or ambiguous, list keys in web, revoke the orphan and issue a replacement. The list never returns a secret. Keys expire 90 days after issuance; up to 10 stored keys per account, including expired keys. For routine replacement, create a new key, verify the same origin/account/grants, then revoke the old one. If leaked, revoke first. Closing a web session or removing a key locally does not revoke it. An authorized personal wipe or account deletion removes that owner's keys; instance resets remove affected keys. Credentials issued under the old `/api/keys` contract cannot authenticate.

## Connect without a session

Validate HTTPS and the certificate hostname before sending credentials. Keep the exact origin, including port; disable redirects for authenticated requests. Never send the key to a guessed host, plaintext listener, alternate origin, or third-party provider. Store it in an OS-backed keychain/secret manager or memory; keep private cached data and credentials out of device backups. Do not automate the web UI or use instance credentials.

```http
GET /api/auth/key HTTP/1.1
Host: ledger.example.invalid:8443
Authorization: Bearer dlpk1_MOCK_NOT_A_REAL_KEY
```

The token above is intentionally invalid; successful mock response:

```json
{"ok":true,"data":{"contractVersion":1,"account":{"id":"fixture-account","displayName":"Sample Account"},"key":{"id":"fixture-key","scopes":["profiles:read","diary:read","diary:write"],"expiresAt":"2030-01-01T00:00:00Z"}}}
```

Only the Authorization header is needed. Do not use password login, cookies, setup or refresh for a key. Bind queued work and local data to the origin, returned account ID and credential generation. Cancel or disregard stale work when those change. Check scopes before offering features, but let Go enforce them. The [exact allowlist](key-scopes.md) and [operation catalog](operations.md) give methods, paths and wire shapes. Unlisted operations are denied; a key never grants admin access. Hidden foreign data stays unavailable except with explicit share visibility. Full access includes ordinary deletions and cascades, sharing and import/export, not account deletion, personal wipe or credential management.

- **401 `key_invalid`:** invalid, unknown, expired or revoked key. Suspend sends and ask for a replacement. Don't refresh or retry using another account.
- **403 `key_forbidden`:** key does not have authority for that operation. No automatic retry or logout. The API may use an operation-specific 403 for dependencies or other domain checks.
- **404:** resource unavailable to this key; at discovery, check backend compatibility and ingress rather than guessing another route.
- **429/503:** limited or unavailable (`key_unavailable` for verification-store failure). Respect `Retry-After`; use bounded retry for reads only. Do not retry a write automatically after an ambiguous response. Use the operation-specific reconciliation rules.

An operator configures trusted HTTPS ingress with private Go/PostgreSQL ports. The ingress keeps paths and Authorization intact and rejects ambiguity before any rewrites. Browser management separately requires its configured HTTPS Origin and CSRF marker. Check the same built topology with disposable data before relying on it.

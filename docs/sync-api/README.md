# DietLedger Go Sync API: native client handoff

**Backend snapshot:** `219f66b6e138a883a12fafad43d32934279d1351` (candidate; not a release). [Pinned Go source](https://github.com/DietLedger/DietLedger/tree/219f66b6e138a883a12fafad43d32934279d1351/sync-server). Verify your deployed build matches the reviewed behavior; `/api/about` reports a build label, not necessarily a commit. While the candidate is local, resolve pinned source links in the local checkout rather than assuming the commit is on GitHub. This documentation covers the implemented Go HTTP surface, including operator-only operations and known gaps. It is not a new versioned API or a mobile application.

| Start with | What it contains |
| --- | --- |
| [Personal keys](personal-keys.md) and [exact scopes](key-scopes.md) | Key-only discovery and owner-scoped personal access with no phone password, cookies, setup or refresh |
| [Connection and sessions](connection.md) | HTTPS and the separate session flow: registration, cookie rotation, Bearer auth, errors and cache boundaries |
| [HTTP operations](operations.md) | Methods, canonical paths, aliases, access, queries, request/response shapes and Go handler symbols |
| [Wire types](wire-types.md) | JSON keys and types extracted from the backend declarations, including native bundle DTOs |
| [Workflows and constraints](workflows.md) | Food, nutrition, tracking, books, sharing, diet, settings, admin and data lifecycle |
| [Recipe transfer](recipe-transfer.md) | Versioned bundles, authorized exports, decisions, quarantine and repair |
| [Agent rules](AGENTS.md) and [build stages](BUILD.md) | Copy into a separate Android/iOS repository and use the exit gates |

For agents: the downloadable bundle also includes a machine-readable `operations.json` (one entry per method/path, with source file/line and notes) and `wire-types.json` (JSON field names and Go types). These are reference catalogs, not OpenAPI or a code generator. Do not infer field requiredness just from a Go tag. For an unresolved edge case, start at [`sync-server/server.go`](https://github.com/DietLedger/DietLedger/blob/219f66b6e138a883a12fafad43d32934279d1351/sync-server/server.go), search the named handler in that revision, then check its store code, validators, migrations and tests. Capture any missing contract evidence before implementation.

To bootstrap a separate repository: unpack the agent kit, install or merge its `AGENTS.md` at the new repo root, put the other documents and `operations.json` under `docs/dietledger-api/`, and start with Build Stage 0. A suggested kickoff prompt: **“Read `AGENTS.md` and the DietLedger API handoff. Propose Stage 0 for an Android client. Identify API gaps and approval questions before writing app code.”** Adjust links in the destination root file if your documentation path differs.

Review the [DietLedger license at this revision](https://github.com/DietLedger/DietLedger/blob/219f66b6e138a883a12fafad43d32934279d1351/LICENSE.md) before distributing, incorporating upstream code, or deploying for others. Nothing here requires the existing web GUI, a WebView, or frontend code. There is no supported delta-sync/change-feed or server-side PDF generation. The key-only and session protocols are distinct. The catalog describes these absences so agents do not invent APIs. Do not claim native support against an installation until tested through its real HTTPS ingress.

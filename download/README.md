# Downloads

- [DietLedger Go Sync API agent kit (ZIP)](dietledger-sync-api-agent-kit.zip?raw=true): offline API handoff and staged build rules for a separate Android/iOS client repository. Unpack and start with `AGENTS.md` and `README.md`. This is documentation, not a recipe package or an application binary.

The editable [handoff documents](../docs/sync-api/README.md) live under `docs/sync-api/`. From the repository root, run `python3 scripts/build-sync-api-kit.py` to regenerate the ZIP and wire type reference, or add `--check` to verify freshness without modifying files. The builder checks Go route registrations, handler names, DTO extraction and kit links; it does not exercise a running server. When the Go backend changes, review the catalog against the new code before advancing the snapshot pin and regenerating.

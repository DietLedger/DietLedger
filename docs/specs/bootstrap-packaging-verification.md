# Bootstrap packaging verification notes

> **Historical packaging/installer evidence — superseded installation route.** [Standard Compose / GHCR](standard-compose-ghcr-install.md) replaces required host installers/setup helpers and their packaging tests. Public release assets use digest-pinned Compose and an empty five-secret template; no installer or private runtime configuration is distributed. Preserve the notes below as historical security/test evidence, not runnable current instructions. The optional combined web/API tar naming and credential-exclusion rules remain; private ignored operator scripts must not be modified without authorization. See [the current guide](../docker-registry-install.md).

Scope: `build-all.bat`, `docker-build.bat`, `docker-build.sh`, and focused packaging regression coverage. The shared installer and root launchers are supplied by the separately owned bootstrap implementation.

## Packaging behavior

- Each builder retains the combined `docker-build/dietledger-{VERSION}.tar` containing `recipetool-dietledger` and `recipetool-api`.
- The package copies the safe root `.env.example`, root `install.sh` and `install.ps1`, `deploy/install.cjs`, and `docker-compose.yml` into the output tree (installer under `deploy/`).
- Builders do not create `.env` from the template or overwrite an existing output `.env`; existing output `.env` is neither copied nor read by these changes. The `.env.example` is not a runnable secret file.
- The generated version-specific Linux and Windows loaders invoke the shared Node installer with the exact versioned combined tar path and return a nonzero installer failure.
- The existing `DIETLEDGER_AUTO_DEPLOY=1` opt-in remains routed through `scripts/deploy-built-tar.js`; it is not the local first-install flow and its remote Portainer boundary is unchanged.

## Verification evidence

Focused regression suite: `npx vitest run src/scripts/bootstrap-packaging.test.ts`.

TDD evidence: before changing the build scripts, the focused suite reported 4 failures and 1 pass, including missing packaged template, installer assets, and installer loader behavior. After the minimal packaging changes, the same command passed all 5 tests.

The tests execute `docker-build.sh` in a temporary fixture with mocked `node` and `docker` commands, including a pre-existing private output `.env`; they verify preservation, absence of generated `.env`, required packaged paths, exact version-tar loader invocation, and propagated installer failure. Windows batch scripts are checked for the equivalent copy, exact tar and error handling statements, but are not executed on this Linux host.

No real Docker build, Docker start, remote deployment, or helper installer execution is part of this check. Windows batch execution and native PowerShell/Windows ACL behavior require native Windows verification. Bash script syntax is checked separately with `bash -n docker-build.sh`.

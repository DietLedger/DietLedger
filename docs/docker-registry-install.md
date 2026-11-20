# Standard Compose / GHCR installation and recovery

**Pre-publication instructions, not a claim that a release exists.** The owner must approve manual testing, security/history gates and publication separately. No release tag, digest, anonymous pull, fresh install or Portainer runtime is asserted here. Do not use real patient/client data in a candidate test. Existing stacks and databases are not automatically adopted; for an approved offline legacy restore see [legacy recovery](legacy-clone-recovery.md).

## Before you start

The current image workflow targets **Linux/amd64 only**, not arm64. A future public installation needs Docker Compose or Portainer CE Docker Standalone and the approved release assets. No host installer, setup helper/image, Node, Go, Git, buildx, registry login or token is required for public images. The two application packages are `ghcr.io/dietledger/dietledger-web` and `ghcr.io/dietledger/dietledger-api`; PostgreSQL uses the pinned official upstream image. Docker administrators can inspect container environments and volumes and must be trusted.

Select a **new** project/stack and new volume; do not point a fresh install at an existing installation. Back up and rehearse restoration before any upgrade. Never delete a volume or replace initialized credentials to bypass a failure. The Go bootstrap and migration commands enforce database ownership and least privilege; ordinary API startup does not migrate.

## Install with Docker Compose after publication

1. From the project's approved GitHub release, download **all five assets** into a new directory: `release.json`, `.env.example`, `docker-compose.yml`, `docker-compose.portainer.yml` and `SHA256SUMS`. Check the release origin, then verify every file with `sha256sum --check SHA256SUMS`. On Windows, compare each listed filename/hash with `Get-FileHash <filename> -Algorithm SHA256`; do not treat a checksum as authenticating a replaced release. Review the Compose asset: its web and API references must contain the **literal digests** of the exact approved built/scanned images. Do not invent a tag or digest. Public package visibility and anonymous pulls must be verified separately before publication.
2. Copy `.env.example` to `.env` (Linux: `cp .env.example .env`; PowerShell: `Copy-Item .env.example .env`). Never overwrite an existing private `.env` during an upgrade. Before entering secrets, restrict access: on Linux, from the new assets directory run `chmod 700 .` and `chmod 600 .env`; on Windows use a private folder and protected restrictive ACLs granting only the intended account and trusted administrators access. Keep it outside source/build contexts and synced/public folders. Confirm the ACL rather than assuming Windows honors POSIX permissions.
3. The five secret assignments are intentionally empty. Fill each with a **different** cryptographically secure random value: 32 random bytes encoded as 64 lowercase hexadecimal characters. `MIGRATION_DB_PASSWORD` and `API_DB_PASSWORD` require exactly 64 lowercase hex characters and must differ; use the same recommended format independently for all five values. A trusted password manager can generate them, or optionally run `openssl rand -hex 32` separately five times. Use URL-safe passwords because database passwords are interpolated into connection URLs; hex meets this requirement. Never paste secrets into public logs, issues, images or release assets.
4. Review `BIND_ADDRESS`, `PORT`, `CORS_ORIGIN` and `AUTH_ALLOW_INSECURE_LOOPBACK`. Defaults expose only web on `127.0.0.1:3000`, with `CORS_ORIGIN=http://localhost:3000` and `AUTH_ALLOW_INSECURE_LOOPBACK=true` for loopback HTTP only. If using `http://127.0.0.1:3000`, set the origin to exactly that URL. For other access use a trusted HTTPS ingress, secure browser context and exact browser-facing HTTPS origin, and set `AUTH_ALLOW_INSECURE_LOOPBACK=false`; configure firewall and binding deliberately. Merely changing the bind address does not secure HTTP. API and PostgreSQL have no published host ports; the browser reaches `/api` on the same origin via Next, not a separate public API address. Web Locks are required.
5. From the assets directory, after checking the selected Docker endpoint and confirming no collision with existing resources, run:

   ```sh
   docker compose --env-file .env -f docker-compose.yml -p dietledger config --quiet
   docker compose --env-file .env -f docker-compose.yml -p dietledger pull
   docker compose --env-file .env -f docker-compose.yml -p dietledger up -d
   ```

   Avoid exported variables overriding the reviewed `.env`: Compose shell environment values take precedence, so remove conflicting overrides deliberately before validation. Do not print expanded Compose configuration into shared logs; it contains credentials. Check that PostgreSQL and API become healthy, bootstrap and migrate complete successfully, and web is healthy. Open the configured browser origin and provide `SETUP_CLAIM_SECRET` privately to create the first administrator. Provider API keys are separate and entered in user settings.

The source-tree Compose file is not a published release asset: it explicitly requires `DIETLEDGER_VERSION` for a selected image tag, including before publication. An empty value must fail rather than silently select an imagined release. Developer builds are separate; `npm run docker:build:local` builds/loads only web and API and does not deploy.

## Optional starter recipe books

After setup, download either or both native recipe-book JSON bundles from the `recipe_book_bundles/` directory at the same source tag/revision as the installed app: [Deliciously Healthy Dinners](../recipe_book_bundles/deliciously-healthy-dinners-full.recipe-bundle.json) and [Deliciously Healthy Family Meals](../recipe_book_bundles/deliciously-healthy-family-meals-full.recipe-bundle.json). These files are not included in the five Docker release assets, so downloading them requires repository access. On GitHub, open a bundle at the matching tag and choose **Raw** or **Download**. Import requires an app version that supports native bundle version 4.

In DietLedger, open **Settings → Data → Recipe Bundle Export / Import → Import** and select a `.recipe-bundle.json` file. Import the books separately. If a same-named book already exists, review the importer's merge/replace/cancel choice.

Both are text-only transcriptions from the National Heart, Lung, and Blood Institute's (NHLBI) *Keep the Beat Recipes* series. [*Deliciously Healthy Dinners*](https://www.nih.gov/news-events/news-releases/nhlbi-publishes-new-heart-healthy-cookbook) (NIH Publication No. 10-2921; 2009, reprinted 2010) is a collection of 75 heart-healthy dinner and side-dish recipes influenced by several cuisines, plus cookbook appendices. [*Deliciously Healthy Family Meals*](https://www.nhlbi.nih.gov/resources/keep-beat-recipes-deliciously-healthy-family-meals) (NIH Publication No. 10-7531; December 2010) focuses on family-friendly meals, snacks, and cooking together; its bundle contains 46 DietLedger recipe entries representing 43 printed entries, with one multi-panel dips-and-vegetables item separated into individual entries. The original photographs and printed tables of contents are not included. Nutrition labels, food-safety instructions and other guidance are historical source material, not current medical or food-safety advice.

## Reruns, upgrades and recovery

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL bootstrap login |
| `MIGRATION_DB_PASSWORD` | schema migration login |
| `API_DB_PASSWORD` | restricted API runtime login |
| `HMAC_SECRET` | signing and encryption of stored provider configuration |
| `SETUP_CLAIM_SECRET` | one-use first-administrator claim |

Reruns use the same selected assets/project and existing credentials; upgrades require intentional reviewed asset selection and a rehearsed backup, not an automatic downgrade guarantee. There is no automatic secret generation or rotation. Preserve all five values and configuration in an encrypted offline backup together with a tested full PostgreSQL backup; a recipe export is not a full database backup. **The original HMAC is essential to decrypt stored provider configuration after restore.** Restore missing initialized credentials; do not regenerate database passwords or HMAC. A consumed claim remains consumed after factory reset. If first-admin recovery is needed, generate a different independent claim, update only that variable through the existing deployment manager, and recreate the API so it receives the new environment. Do not alter the HMAC or database passwords. Claim rotation does not authorize an additional administrator while users remain.

## Portainer CE Docker Standalone

Use a new Docker Standalone stack/project and volume; existing stacks remain operator-managed. The current candidate platform is **Linux/amd64 only**; do not infer arm64 or other platform support. Portainer submission/acceptance is asynchronous: a successful click or accepted deployment request is not evidence that services are ready.

### Web editor or Upload: released Compose asset

1. In Portainer CE, open **Stacks → Add stack**, enter a new stack name (for example `dietledger` only if unused), and choose **Web editor** to paste the verified contents of the downloaded `docker-compose.portainer.yml`, or choose **Upload** and select that released file. This release file already has literal app digests; do not set `DIETLEDGER_VERSION` for this route.
2. In **Environment variables**, explicitly add every assignment from the protected `.env`, or use **Load variables from .env file** and select it. Portainer does not implicitly read a host `.env`. Include the five secrets plus required non-secret settings (`BIND_ADDRESS`, `PORT`, `CORS_ORIGIN`, `AUTH_ALLOW_INSECURE_LOOPBACK`) and any configuration required by the released file. Never paste values into shared logs. Protect and back up Portainer's stored variables and the encrypted offline copy.
3. Select **Deploy the stack**. Poll the actual stack and container/service states until PostgreSQL/API/web are healthy and bootstrap/migrate show successful completion. Inspect failure state/logs privately; do not treat API/web running, the request being accepted, or an initially pending state as readiness. Do not remove dependency conditions to force startup.

### Git stack: exact source ref and file

1. Open **Stacks → Add stack**, choose **Repository**, and enter Repository URL `https://github.com/DietLedger/DietLedger`. Set **Repository reference** to the exact owner-approved protected release ref/tag, in the form `refs/tags/v<version>` (the angle-bracket value is a placeholder; this guide does not assert that any tag exists). Set **Compose path** to `docker-compose.portainer.yml`. Disable automatic GitOps updates.
2. The repository file is source Compose, not the digest-pinned release asset: explicitly set `DIETLEDGER_VERSION=<same package version without v>` to the exact approved version, plus all five secrets and applicable non-secret variables in the Portainer Variables section. Explicitly add them or load the protected `.env`; Git does not import a host file automatically. The release/version and image digests must be independently approved; never guess a tag.
3. Select **Deploy the stack**, then poll actual runtime state until PostgreSQL/API/web are healthy and bootstrap/migrate have completed successfully. An accepted Git deployment is not readiness. Check each service/container and diagnose failed jobs before considering installation ready.

The definitions use named storage, no relative host binds or Business Edition-only feature, and retain identical service health/completion semantics. The target must honor both `service_healthy` and `service_completed_successfully`; stop if it cannot. These are orchestration-time conditions, not continuous gates after restarts; API startup independently verifies its ledger/authority.

**Source-reviewed candidate, not runtime certification:** Portainer CE 2.45.4 LTS at commit `505380c8eecff08cf513c457494bde91634db9ff` embeds Compose 2.40.3 / compose-go 2.9.1; its published compatibility matrix includes Docker 29.10. Source review traces file/Upload/Git deployments through `deploymentConfiger.Deploy` to `composeService.Up`. The [pinned Portainer Compose integration](https://github.com/portainer/portainer/blob/505380c8eecff08cf513c457494bde91634db9ff/pkg/libstack/compose/composeplugin.go#L74-L107), [module versions](https://github.com/portainer/portainer/blob/505380c8eecff08cf513c457494bde91634db9ff/go.mod#L18-L24), and [upstream Compose dependency handling](https://github.com/docker/compose/blob/v2.40.3/pkg/compose/convergence.go#L499-L535) support the required healthy and successful-completion (exit 0) conditions. This does not establish a minimum Portainer version or prove an actual deployment. The approved target/version and fresh/second-deploy/failure/restore runtime checks remain **pending**; CLI Compose parsing is not Portainer certification. See also [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) and [Portainer stack documentation](https://docs.portainer.io/user/docker/stacks/add).

## Release gate

Release automation is not deployment. Build and scan the exact two application images before any push, bind their matching source/version metadata to the literal digest-pinned Compose assets, and verify checksums and anonymous exact-digest pulls before release. Package visibility, sanitized history, protected environments, actual fresh installation, manual testing and final publication require separate owner action and evidence; none is claimed here. See [CI verification](CI_VERIFICATION.md) and [the approved spec](specs/standard-compose-ghcr-install.md).

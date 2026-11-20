# DietLedger

**Recipes, nutrition insights, meal plans, and shopping lists—connected in one self-hosted workspace.**

DietLedger helps households and care professionals bring food planning and nutrition tracking into a single workflow. Build recipes, review their nutrition, plan meals, and turn those plans into a grocery list—then track food and revisit your goals over time.

> **Beta software:** DietLedger is self-hosted software, not a hosted service. You provide and operate the server and database. Features and setup are still evolving; validate the application and its data before relying on it. It is not medical advice or a substitute for professional care.

## Why DietLedger?

- **Recipes with nutrition context.** Organize recipes and review nutrient analysis. Recipes can preserve published cookbook nutrition with source and unreported-nutrient notices; nutrition depends on the data and matches available.
- **Dietary filters you can inspect.** Explore recipes against editable nutrition targets, including an optional Diabetes-aware starter profile. This is a screening aid—not a diabetes-safe certification or treatment plan. Unknown nutrition is not a confirmed match.
- **Plan it, shop for it.** Put recipes on a meal plan and generate a grocery list that scales and aggregates planned recipe ingredients.
- **Keep the workflow together.** Log food, review nutrition over time, manage recipe collections, and export printable cookbooks.
- **Self-host and manage your own instance.** You operate the deployment and PostgreSQL database. Recipe/book export and owner backups support portability; they are not full-account backups.

## Installation: Docker Compose first

> **Pre-publication candidate.** No public release, image availability or fresh-install runtime verification is claimed. Manual testing, security/history review and publication remain separate owner gates. Do not use real patient/client information in a candidate test.

Public installation targets **Linux/amd64 only**, using standard **Docker Compose or Portainer CE Docker Standalone**, pulling `ghcr.io/dietledger/dietledger-web` and `ghcr.io/dietledger/dietledger-api` directly; PostgreSQL uses the pinned official upstream image. No setup helper/image, host installer, Node, Go, Git, buildx or registry login is required. See [the full installation and recovery guide](docs/docker-registry-install.md).

### Compose after an approved release is published

1. Download all five files—`release.json`, `.env.example`, `docker-compose.yml`, `docker-compose.portainer.yml` and `SHA256SUMS`—from that exact approved GitHub release. Check origin, run `sha256sum --check SHA256SUMS` (or compare every file with Windows `Get-FileHash -Algorithm SHA256`), and review the literal web/API image digests in the released Compose assets. Do not invent a release tag or digest. Source Compose instead requires an explicit `DIETLEDGER_VERSION`; an unpublished source checkout is not a registry release.
2. Copy `.env.example` to `.env` in a private directory. Before filling it, restrict the directory/file (Linux: `chmod 700` on the directory, `chmod 600 .env`; Windows: protected restrictive ACLs for the intended account/trusted administrators). Fill the five empty assignments—`POSTGRES_PASSWORD`, `MIGRATION_DB_PASSWORD`, `API_DB_PASSWORD`, `HMAC_SECRET`, `SETUP_CLAIM_SECRET`—with **five independent** CSPRNG values: each 32 random bytes rendered as 64 lowercase hex characters, from a trusted password manager or five separate optional `openssl rand -hex 32` invocations. Migration/runtime passwords must be distinct and exactly 64 lowercase hex. Hex passwords are URL-safe for the connection URLs. Never publish `.env` or credential-bearing expanded configuration.
3. Confirm the Docker endpoint and a new project/volume, then run from the assets directory:

   ```sh
   docker compose --env-file .env -f docker-compose.yml -p dietledger config --quiet
   docker compose --env-file .env -f docker-compose.yml -p dietledger pull
   docker compose --env-file .env -f docker-compose.yml -p dietledger up -d
   ```

Only web publishes a host port: `127.0.0.1:3000` by default. Open [http://localhost:3000](http://localhost:3000); `CORS_ORIGIN` must match the exact browser origin. `AUTH_ALLOW_INSECURE_LOOPBACK=true` is for loopback HTTP only. First administrator creation requires the private `SETUP_CLAIM_SECRET`. Verify healthy PostgreSQL/API/web and successful bootstrap/migration jobs before use.

### Optional starter recipe books

After setup, you can import either or both native recipe-book bundles. Download the JSON files from the `recipe_book_bundles/` directory at the same source tag/revision as your installed app: [Deliciously Healthy Dinners](recipe_book_bundles/deliciously-healthy-dinners-full.recipe-bundle.json) and [Deliciously Healthy Family Meals](recipe_book_bundles/deliciously-healthy-family-meals-full.recipe-bundle.json). These are repository files, not part of the five Docker release assets, so downloading them requires repository access. In GitHub, open a file at the matching source tag/revision and choose **Raw** or **Download**. Use an app version that supports native bundle version 4.

In DietLedger, go to **Settings → Data → Recipe Bundle Export / Import → Import**, then select a downloaded `.recipe-bundle.json` file. Import the books separately. If a book with the same name already exists, review the importer's merge/replace/cancel choice.

Both are text-only transcriptions from the National Heart, Lung, and Blood Institute's (NHLBI) *Keep the Beat Recipes* series. [*Deliciously Healthy Dinners*](https://www.nih.gov/news-events/news-releases/nhlbi-publishes-new-heart-healthy-cookbook) (NIH Publication No. 10-2921; 2009, reprinted 2010) is a collection of 75 heart-healthy dinner and side-dish recipes influenced by several cuisines, plus cookbook appendices. [*Deliciously Healthy Family Meals*](https://www.nhlbi.nih.gov/resources/keep-beat-recipes-deliciously-healthy-family-meals) (NIH Publication No. 10-7531; December 2010) focuses on family-friendly meals, snacks, and cooking together; its bundle contains 46 DietLedger recipe entries representing 43 printed entries, with one multi-panel dips-and-vegetables item separated into individual entries. The original photographs and printed tables of contents are not included. Nutrition labels, safety advice and other guidance are historical source material, not current medical or food-safety advice.

### Portainer and developer builds

Portainer CE Docker Standalone can use Web editor/Upload with the reviewed release Compose asset, or a Git stack with the approved repository, **exact approved tag/ref** and `docker-compose.portainer.yml`. Explicitly enter/import variables in Portainer; it does not read a host `.env` automatically. Keep identical service health/successful-completion dependencies, disable automatic updates, and use a new stack/volume. No relative bind mounts or Business Edition feature is required. Source review identifies a candidate version; actual Portainer runtime verification remains pending—see the guide.

Developer source builds are separate and may require Node/buildx: `npm run docker:build:local` builds/loads web and API only, without deployment. Local runtime tests need explicit approval and disposable resources; they do not prove anonymous GHCR installation.

### Reruns, upgrades and recovery

Operators must preserve credentials/data across reruns; there is no automatic generation or rotation. Keep **all five values and deployment configuration in an encrypted offline backup alongside a tested full PostgreSQL backup**; recipe/book exports are not full-account/database backups. **The original HMAC is essential to decrypt stored provider settings after restore.** Missing/incorrect initialized credentials require recovery, not silent password/HMAC replacement. Never delete a data volume to get past validation, and never add `down -v` to routine maintenance.

Ordinary API startup does not perform migrations or use database bootstrap authority. Existing deployments need an explicit, backed-up database-role/session/configuration migration; rebuilding images alone is not that migration. Existing Portainer stacks remain owned by their original manager and must not receive an automatic replacement configuration. Operator-specific build/deploy scripts remain private local tools, not public installation dependencies.

Factory reset retains consumed first-admin claim receipts. Recovery uses explicit **claim-only rotation**, preserving database/HMAC secrets; see the installation guide before changing anything. A fresh deployment is not permission to adopt existing data or change its manager.

### Before permitting LAN or internet access

- Complete the security verification, manual test, history/credential and publication gates. Loopback is not protection if another service proxies it publicly.
- Keep `BIND_ADDRESS=127.0.0.1` for a reviewed host-local HTTPS reverse proxy; broader binding needs an explicit firewall/TLS design. PostgreSQL and API are not host-published by default.
- Set `CORS_ORIGIN` to the exact browser-facing HTTPS origin and `AUTH_ALLOW_INSECURE_LOOPBACK=false`. Web Locks are always required, including localhost; HTTPS through trusted ingress is required except for explicitly configured loopback HTTP. Serve the web UI and `/api` on the same browser origin, not separate API origins. CORS is not a firewall.
- Verify full restoration, protect Portainer's stored variables, and confirm the license permits your use. Do not publish private configuration, local build folders, unresolved audit material or credentials.

## License and permitted use

DietLedger is **source-available under the Community Care License (CCL) 1.0**. It is not offered under a conventional OSI-approved open-source license, and “free” does not mean every organization or use is permitted.

The license permits non-commercial personal or household use, specified internal use by qualifying educational institutions, registered non-profits and public agencies, and use by eligible small direct-care organizations with **fewer than 40 personnel and under $3,000,000 in annual gross revenue** (with affiliates aggregated). It includes source-availability and notice obligations for covered distribution and external network use. Standalone SaaS, competing products, white-labeling and certain larger-enterprise uses are restricted or require a separate written commercial license. This summary is not the license; read the full terms and definitions to determine whether your use qualifies.

Read [LICENSE.md](LICENSE.md) in full before use. For commercial licensing inquiries, see the contact information in the license and on [dietledger.app](https://www.dietledger.app).

## Learn more

- **GitHub repository:** [DietLedger/DietLedger](https://github.com/DietLedger/DietLedger)
- **Project landing page:** [GitHub Pages](https://dietledger.github.io/DietLedger/)
- **Full license:** [Community Care License 1.0](LICENSE.md)

## Beta feedback

Review the project and open a GitHub issue for reproducible bugs or product feedback. Do not include passwords, API keys, personal health information, or other sensitive data in issues. Do not submit real patient or client information to a beta instance.

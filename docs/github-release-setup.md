# GitHub beta release setup

Prepared repository metadata and artwork for `DietLedger/DietLedger`.

## Repository description

> Self-hosted nutrition and meal-planning workspace: connect recipes, nutrition analysis, dietary filters, food logs, meal plans, and grocery lists. Beta; source-available under the Community Care License (CCL 1.0).

Suggested GitHub topics: `nutrition`, `meal-planning`, `recipe-manager`, `self-hosted`, `grocery-list`, `food-tracking`.

## Account and repository artwork

- **GitHub account/organization avatar:** upload `docs/assets/dietledger-avatar.png` (512 × 512). The matching editable vector is `docs/assets/dietledger-avatar.svg`.
- **Repository social preview:** upload `docs/assets/dietledger-social-preview.png` (1280 × 640). Source: `docs/assets/dietledger-social-preview.svg`.
- The app logo remains `public/logo.svg`; these assets extend its cookbook motif into the GitHub formats.

Configure the avatar in the GitHub account or organization profile settings. Configure the social preview under the repository’s **Settings → General → Social preview**. GitHub’s settings must be changed by an account owner; this repository does not do so automatically.

## GitHub Pages

1. Push the reviewed release branch to the intended public repository only after completing the security review in the release checklist below.
2. In **Settings → Pages**, choose **Deploy from a branch**, select the release branch and `/docs` folder, and save.
3. `docs/index.html` is the adventure homepage, designed for `https://dietledger.github.io/DietLedger/`. The previous homepage is preserved at `docs/archive/index.html`, with its assets still in `docs/assets/`. Focused homepage tests remain in `docs/GitHubPagesTemp/*.test.cjs`; the PDF in that directory is retained.
4. Verify the published links and mobile layout after GitHub finishes deploying Pages. The homepage links to the repository and installation guide; it does not promise a hosted DietLedger service or a binary download. All files under `docs/`, including the archive, tests, and PDF, are publicly accessible when Pages is enabled.

### Local Pages verification

Run `node --test docs/GitHubPagesTemp/*.test.cjs` from the repository root. The tests now load `docs/index.html`, not the former `preview.html`. Browser checks are optional and explicitly skipped unless Playwright is available; set `PLAYWRIGHT_MODULE_PATH` and, if needed, `CHROMIUM_EXECUTABLE_PATH` to existing local installations to run all checks without adding dependencies.

Serve `docs/` locally to check both `/index.html` and `/archive/index.html`, including the archive's shared CSS and logo. Test with a repository-path prefix such as `/DietLedger/` as well as desktop/mobile viewports. Local checks do not verify GitHub settings, remote link availability, a full accessibility audit, or actual publication. Keep the branch `/docs` publishing configuration above; no deployment is performed by these tests.

## Repository description and README

Copy the description above into the repository's **About** settings. `ReadMe.md` contains the installation instructions and full-license link. The project currently has no confirmed public hosted demo or published beta binary; do not add a demo/download promise until one is actually available.

## Installation assets and publication gates

The owner selected [standard Compose / GHCR installation](specs/standard-compose-ghcr-install.md), superseding the separate setup package and required host installer. Public installs pull exactly `ghcr.io/dietledger/dietledger-web` and `ghcr.io/dietledger/dietledger-api`, plus the allowed pinned official PostgreSQL image. No Node/Go/Git/buildx/login is required. Operators explicitly provide five independent secrets in a restricted `.env` or Portainer environment UI/import; no generated secret belongs in a release.

### Candidate workflow evidence path (not a claim that it ran)

The manually dispatched beta workflow requires owner confirmations and the exact `v<package version>` tag. Before either GHCR push, it builds exactly `dietledger-web:<version>` and `dietledger-api:<version>` for `linux/amd64`, checks each image's source/revision/version labels, scans the saved candidate images, then runs the Compose-install harness against those exact local candidates on an isolated runtime. A harness/build/scan failure blocks publication. The images phase then pushes those same candidates, resolves and validates their registry digests, and uses a fresh anonymous Docker configuration to pull both exact digest references and compare the pulled image IDs with the candidates. It generates `release-assets/` from the post-push digests and reruns the Compose-install harness against the generated digest-pinned Compose asset. These are workflow steps, not evidence that any run succeeded; actual run, runtime and publication status must be reported separately.

The generated public allowlist is exactly `release.json`, `.env.example`, `docker-compose.yml`, `docker-compose.portainer.yml` and `SHA256SUMS`. `.env.example` is a dotfile: the Actions artifact upload explicitly uses `include-hidden-files: true` so it is retained, and the release job checksum-verifies it and passes it explicitly to release creation. Confirm it is present in the downloaded release—do not assume GitHub's UI presents a dotfile like an ordinary asset. Both Compose assets contain literal digests of the exact built/scanned/pushed images with coordinated source/version metadata, not floating tags or runtime release.env selectors. Source Compose instead requires explicit `DIETLEDGER_VERSION`; do not invent an available tag or digest before publication. Keep the five template secret assignments empty and retain independent 32-byte/64-lowercase-hex guidance and encrypted offline database/configuration backup instructions; original HMAC is essential for provider-setting restoration.

After manual/security gates and explicit publication approval, the release workflow may publish only those five files. It does not deploy DietLedger.

The documented Portainer CE Docker Standalone Web editor/Upload route and Git stack use the exact approved tag/ref and `docker-compose.portainer.yml` path, with explicit environment entry/import rather than implicit host `.env`. The same health/completion dependencies and named storage need no relative binds or Business Edition. Source review identifies CE 2.45.4 LTS as a candidate whose embedded Compose supports the dependency conditions; actual version/runtime verification is pending. See [the install guide](docker-registry-install.md) and [CI gates](CI_VERIFICATION.md).

### Owner-only GitHub permissions and first-package visibility

1. In repository **Settings → Environments**, configure required reviewers for **both** `beta-images` and `beta-release` before dispatch. The workflow uses the built-in Actions `GITHUB_TOKEN`, with `packages: write` only in the images job; no PAT is required. Release creation has separately scoped `contents: write`. Image source labels associate the packages with the repository; that association does not make them public.
2. For **each** GHCR package separately—`dietledger-web` and `dietledger-api`—open its **Package settings → Manage Actions access** and grant the `DietLedger/DietLedger` repository the access required for publishing. Review the package's visibility setting separately and change it to public **only with owner approval**. Public source alone does not change either package's visibility.
3. New packages default private. An initial authorized run may create them and then stop at anonymous pulls, with no released install assets. After the owner approves and sets both package visibilities/access, rerun the exact approved tag through the required reviews. **Do not bypass the anonymous-pull gate.** It must pull both exact digests using an isolated anonymous `DOCKER_CONFIG`, without a token/login or changes to operator credentials, before assets can be released.
4. Sanitized candidate remote adoption is still pending: do not push private integration lineage, rewrite refs or change remotes based on these instructions. Exact history/ref operations and publication require separate approval.

No hosted run, package availability, runtime test, GitHub setting or publication is asserted here.

## Public-release security gate — not yet cleared

Earlier review found a tracked credential-bearing `.env`; publication removals do not establish that retained history or the remote is safe. Before making the repository public:

- identify whether any committed value was real, not a placeholder; rotate/revoke exposed real credentials through an approved operational plan;
- verify runtime `.env` files and local credential/data/archive artifacts are excluded, while `.env.example` remains safe and empty;
- inspect **all retained history and tags**, including nested artifacts. Removing files from the latest tree does not remove prior values;
- coordinate and obtain exact ref/operation approval for any history purge, force-update or remote change; do not push private integration lineage as the sanitized release;
- complete the separate security/manual-test gates before publication.

This documentation update changes no private `.env`, Git history, GitHub setting or remote and publishes nothing.

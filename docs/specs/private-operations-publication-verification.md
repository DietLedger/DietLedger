# Private operations publication boundary — implementation evidence

## Approved scope

The owner requested complete security remediation and removal of their local-only build/deploy tooling from Git tracking while retaining the local files. Portable Docker build/load remains available. Deployment, history force-updates and public beta publication are not performed by this change.

## Changes

- Untrack and ignore the operator-specific full build/upload wrappers, SSH helpers, obsolete native-service/PM2 definitions and legacy `.zscripts` release paths. Preserve local copies; do not publish or require them in clean-source tests.
- Remove package aliases that advertise the private remote-upload workflow; retain portable `docker:build:local` / Portainer build-only commands.
- Exclude retained local-only tools from Docker build input as well as Git. Git ignore alone is insufficient.
- Replace old tests of private scripts with portable local-build/publication-boundary contracts. Retire the obsolete remote-deploy plan's operator details and update agent deployment guidance.
- Stop ignoring the reviewed dependency lockfile; dependency remediation supplies the actual locked graph separately.

## Test-first evidence

`src/scripts/private-operations-publication.test.ts` initially failed two tests: private tools were tracked and package aliases advertised the private workflow. After index-only removal and alias changes those tests passed. Adding the Docker-context boundary test then failed because the retained tools were not all excluded. Adding explicit context exclusions made it pass.

Verification:

```sh
npx vitest run src/scripts/private-operations-publication.test.ts src/scripts/deploy-scripts.test.ts src/scripts/bootstrap-packaging.test.ts src/scripts/publication-hygiene.test.ts
npx eslint src/scripts/private-operations-publication.test.ts src/scripts/deploy-scripts.test.ts src/scripts/bootstrap-packaging.test.ts src/scripts/publication-hygiene.test.ts
```

Result at this checkpoint: **15 tests passed** and targeted ESLint passed. Source/index history removal beyond the current publication boundary remains a separate reviewed operation. These checks do not establish clean historical refs, healthy deployed images or Windows runtime behavior.

## Recipe conversion build exclusion

The owner requires `recipe_book_bundles/` (PDF recipe conversions and finished bundles, formerly `recipe_meals_pdfs/`) to stay out of Docker build input. The root `.dockerignore` exclusion ensures ordinary local and release builds enforce the same boundary as the manually tested, filtered candidate. Other conversion inputs remain allowed subject to existing ignore rules; do not change artifacts or private conversion scripts.

Acceptance: Docker excludes that entire directory, including nested files, while retaining an unrelated conversion fixture. Verify RED/GREEN using Docker's actual context filtering on a disposable synthetic context with the repository `.dockerignore` copied into it and a scratch-stage local export. Do not read recipe artifacts or add artifact-dependent application tests. No application rebuild, publication, deployment, or repeat of the owner's completed release checks is included in this change.

Verification: before the exclusion, Docker exported both synthetic recipe-conversion files (including the nested file); after the exclusion, the entire fixture directory was absent and the unrelated conversion fixture remained. The four existing publication/build-boundary test files passed (16 tests), and `git diff --check` passed. The probe used only synthetic files outside the repository and read no actual recipe artifacts. Application images and running services were not changed.

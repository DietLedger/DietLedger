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

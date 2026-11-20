# Legacy remote-tar deployment — retired from the public workflow

The operator-specific SSH/upload/native-service workflow is no longer part of the public source or installation contract. Needed local scripts may remain on the operator's machine as ignored, untracked files; do not delete them or assume they exist in a clean clone.

## Portable development build

Use `npm run docker:build:local` to build/load the web and API images into the currently selected Docker daemon. This does not upload images, replace configuration or restart a stack.

An optional offline application export retains the established single combined `docker-build/dietledger-{VERSION}.tar` containing `recipetool-dietledger` and `recipetool-api`. Runtime credentials must never be included in the archive or distributed output folder.

## Public installation direction

The selected release workflow is Docker Compose first, with Portainer CE Docker Standalone Web editor/Upload or an exact approved Git ref, subject to separate runtime verification. Application images and reviewed installation configuration come from the project's GitHub/GHCR, while the official PostgreSQL upstream image is allowed.

Standard Compose pulls web/API directly from GHCR with operator-supplied secrets, not a setup helper or host installer. Registry publication and actual fresh Compose/Portainer runtime must be verified before being advertised as available. See [the installation guide](../docker-registry-install.md). The owner requested a local build/deploy/manual-test handoff before public beta publication.

## Existing installations

Existing Portainer stacks remain operator-managed. No build success, image upload or image load is evidence that running services changed. Never adopt a stack, overwrite its credentials, reset its database or change its stored Compose configuration without explicit authorization.

Private hostnames, accounts, storage paths and operator-specific topology do not belong in public examples or retained publication history. History cleanup and remote updates are separate reviewed operations; this document does not authorize either.

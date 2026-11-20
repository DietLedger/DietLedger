# Owned web/setup OpenSSL patch

> **Historical exact-image evidence.** Setup-image references/results below are retained for their original artifact scope. [Standard Compose / GHCR](standard-compose-ghcr-install.md) supersedes that deployment route with web/API application packages only, no setup helper. New candidate images still require their own scan/runtime/publication evidence.

Authorized follow-up to `security-runtime-image-remediation.md`: eliminate the ten known fixable MEDIUM records in each owned web/setup image without changing application code, Node 22.23.2, services, PostgreSQL or scanner filtering.

Official Alpine **v3.24/main/x86_64** APK metadata confirms `libcrypto3` and `libssl3` **3.5.9-r1** are available, both from `openssl`; they retain `libcrypto.so.3` / `libssl.so.3`, and libssl3 depends on the matching libcrypto3 revision. Security metadata and the actual prior image findings agree on this fix. Root Dockerfile adds minimum upgrade constraints for these existing packages only.

Focused contract RED: one expected failure for the missing libcrypto3 floor, four passes. After implementation: all five runtime-image contracts and seven release-manifest regressions pass. Parent merged the patch before the actual shared-Dockerfile web/setup rebuild and all-severity scans recorded below. API needed no source change.

PostgreSQL stays the official unmodified pinned image. Its ten OpenSSL MEDIUM records remain an explicit **upstream vendor-update gate**; no wrapper, filtering or new exception is introduced. Other PostgreSQL raw findings and the separately reviewed exact-bound gosu determination retain their existing scope.

Sources: https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/APKINDEX.tar.gz ; https://secdb.alpinelinux.org/v3.24/main.json . Private receipts/raw reports remain outside source and build contexts.

## Actual merged-image verification

Integration `3a8f685f2c0322389720c4bb069deb1a8a396848`, version `1.0.0-beta.175`: actual web/setup bake/load passed in 120.0 seconds. Shared Dockerfile bytes match source patch `d886504`; build output confirms both OpenSSL packages upgraded from 3.5.8-r0 to 3.5.9-r1. API inputs/image remained unchanged. All three owned images were rescanned and report **zero findings at every severity**, without ignore/VEX filtering. Twelve merged image/release contracts pass; 514 source-input fingerprints and eight existing user tag mappings are preserved.

Exact tested image IDs:

- web: `sha256:a7153c1c234559d5a6ef18b89eee5b2e5bece6a70edad76d718197a0a0ca7c43`
- API (retained): `sha256:57cf34d63cd6befbb37489a3ecf3b1d0430add25392d360347627872acf19683`
- setup: `sha256:3faa123004cabef5110f24899cce9d4c3b34ba29f91619d2a108d78114f8d747`

Separate actual **secret scans of all three exact image IDs above returned zero findings and exit 0**, with no exceptions/suppressions or path findings. Raw reports are retained privately; this is distinct from the vulnerability scan and does not certify every possible private datum or image history.

The later host-only PowerShell caller-environment restoration changes the installer's exported script, not web/API application code. Setup was rebuilt again from `716bb228c63a48181330dc1400f60775dec5da21` as `sha256:cf2d517f143e6fa080ec9e93311f523caad83b35a8fc7524620c0352f971d50d`; combined actual all-severity vulnerability and secret scanning again returned zero, using the same cached database without filtering. Every other existing image tag remained unchanged and no container was started. This supersedes only the setup image identity above.

Official PostgreSQL remains unmodified with raw 26 HIGH, 1 CRITICAL, 40 MEDIUM, 3 LOW and 1 UNKNOWN. Its ten OpenSSL MEDIUM records remain an open vendor-update gate. The separately approved exact-bound 27-ID gosu note is retained, with corrected 2,031/32 text/os symbol counts; **raw PostgreSQL scanning still exits 1**. No source/CI/VEX filtering or blanket exception was added. These results supersede the prior owned-image OpenSSL findings, not the PostgreSQL raw reports; they are not an all-clear publication/CI claim. Images/cache and private raw evidence are retained.

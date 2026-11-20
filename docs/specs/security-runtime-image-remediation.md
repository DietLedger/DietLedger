# Runtime image remediation and PostgreSQL binary review

> **Exact-artifact historical evidence.** Web/setup image identities and scan results below describe the earlier frozen candidate, not the replacement installation. [Standard Compose / GHCR](standard-compose-ghcr-install.md) requires only web/API application packages and no setup package/helper. Preserve the security evidence and unresolved gates; it does not certify newly built images, runtime or publication.

Status: final requested web rebuild/scans verified against frozen integration commit `9d4dab6ae0e39562309bccbfdd853867d8bbe908`, package version `1.0.0-beta.175`. API/setup were built at `6be4281c9956fcfd5a9a690895bac2e03c629c44`; their build inputs and retained image IDs are verified unchanged/equivalent at `9d4dab6`. Source remediation was prepared from `77c6d21b9d4ce4dc9fff2eee5cff5b15498aa7f3` in commit `f66fa4cd258b2fe3ad0463657ce2119815084537`. No publication, deployment or all-severity-clean claim.

## Objective and acceptance

Remove unused package-manager executables/libraries from final web/setup filesystems, retain the verified Node 22.23.2 runtime and the existing builder's locked `npm ci`, and patch known Alpine package findings using reviewed branch-compatible fixed versions. No host application dependency changes, new service/image product, version bump or application-logic changes.

Keep PostgreSQL on the exact official upstream image. Review its public gosu binary against every one of the 27 reported HIGH/CRITICAL Go stdlib advisory records, tied to the immutable image reference and binary digest. A finding remains open unless exact package/symbol evidence supports a precise unaffected determination or an actual patched official image fixes it. Any proposed VEX/source/CI handling needs parent review before implementation; no blanket standard-library exclusion or risk waiver.

## Ordered tasks and verification

1. Add focused failing Node tests for final-stage package-manager removal, retained builder npm/Node and reviewed Alpine minimum fixes. Confirm expected RED before Dockerfile edits.
2. Preserve the three-image architecture and non-root entrypoints. Implement common internal runtime-stage deletion/checks, with final web/setup stages inheriting it. Upgrade only existing Alpine libraries required for findings; verify authoritative security/repository metadata first.
3. Run static contract/regression tests and inspect the source diff. No host dependency installation is necessary for Node standard-library tests.
4. Extract only the public gosu binary from the immutable official PostgreSQL image, using an explicitly permitted stopped task-owned inspection fixture if needed. Never start it or a database. Remove only that fixture and its own anonymous volume.
5. Run pinned govulncheck binary mode plus build/package/symbol/source review; retain a complete per-ID ledger privately and sanitized evidence here. Unverifiable/reachable findings remain gates, not exceptions.
6. After parent integrated the pending application fixes and authorized the frozen snapshot, rebuild only the held task tags and repeat actual-image scans/package-manager/Node/runtime checks. Preserve all existing user tags; no publication/deployment/pruning. This step is now verified below.

## Evidence and remaining gates

Initial image scans found 17 HIGH + 1 CRITICAL records in each web/setup image, including bundled global npm and Alpine libraries; API had one MEDIUM zlib record. Official PostgreSQL had 26 HIGH + 1 CRITICAL records in gosu's Go 1.24.6 stdlib. No source change is a substitute for executable image evidence. The authorized final rebuild now includes those welcome/auth follow-ups and the runtime fixes. Build and actual scan results are recorded below; PostgreSQL raw findings remain visible separately from the reviewed exact-binary classification.

## Runtime source change and TDD evidence

- `scripts/runtime-image-contract.test.cjs` initially produced expected RED: three failures, two existing positive contracts pass. After the Dockerfile changes, all five pass. Seven existing release-manifest contracts also pass. All 13 Docker RUN shell fragments pass `sh -n`; `go test -count=1 -run '^TestDockerContextIncludesOnlyAPITransport$' .` passes with application/test DB variables unset. No host application dependencies were installed or changed.
- Root Dockerfile retains its exact Node 22.23.2 manifest and npm 11.16.0 builder install/locked `npm ci`. A common **internal** runtime stage removes `/usr/local/lib/node_modules/npm`, corepack libraries, `/opt/yarn-v*`, and npm/npx/yarn/yarnpkg/corepack/pnpm/pnpx shims. It verifies the Node version and rejects any remaining tool on PATH. Only final setup/runner inherit it; there is no fourth distributed image or new service. Both existing non-root entrypoints still execute Node directly.
- Reviewed Alpine v3.24 main x86_64 metadata provides musl/musl-utils `1.2.6-r3` and zlib `1.4-r0`. Root base enforces these minimums with standard `apk add --no-cache --upgrade` constraints. v3.23 main likewise supplies zlib `1.4-r0`, used for the API's existing library update. Both branches advertise the same `so:libz.so.1` ABI. Official package/security metadata receipts are private; no arbitrary cross-branch repository or new host package was added.
- Sources: https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/APKINDEX.tar.gz ; https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86_64/APKINDEX.tar.gz ; https://secdb.alpinelinux.org/v3.24/main.json ; https://secdb.alpinelinux.org/v3.23/main.json . Actual rebuilt package versions/scans are verified below.

## Exact official PostgreSQL/gosu evidence

This is a narrow code-presence review, **not a risk waiver or a blanket standard-library skip**. No VEX document, scanner exclusion, CI filter or official-image replacement is implemented. Parent subsequently authorized these exact 27 not-affected determinations after independent Bria review, bound to the identities and advisory revisions in the standalone note. No machine-applied VEX/CI filter was added; the raw PostgreSQL scan still exits 1.

- Official reference unchanged: `postgres:17-alpine@sha256:e80acae3f1109e8e4533618b594918936f2858c63afc7204c4773148a673add8` (linux/amd64).
- Its public OCI manifest identifies image-config digest `sha256:fa7e2700e906190f900a3c9d47e87f9032cfa38b60d9ac25129a357f85c2da8c`. The local Docker store reports the immutable manifest digest as its image ID; both identities were recorded rather than equated incorrectly.
- Extracted only `/usr/local/bin/gosu`. Binary SHA-256: `b1892636c281590f34bc63c1118f058cd9de66c4ea463772e3909672d8b302ac`. It **matches the published digest of the official gosu 1.20 `gosu-amd64` release asset**. Build metadata identifies `github.com/tianon/gosu v1.20.0`, Go 1.24.6, `CGO_ENABLED=0`, moby/sys/user 0.4.1 and x/sys 0.1.0.
- A uniquely named task-owned inspection fixture used `--entrypoint /bin/false`, no network, read-only root filesystem and **was never started**. Only its public binary was copied. Its one newly allocated anonymous volume and the stopped fixture were removed; existing user/task image tags were unchanged. No PostgreSQL database/container was started.
- Ran **unfiltered** pinned `govulncheck@v1.10.0 -mode=binary` in JSON and text modes against these exact bytes. It reported zero vulnerable compiled symbols. JSON still retains 64 module-level finding records and three package-level records; exit zero alone is not treated as proof. Text reports zero affected vulnerabilities while explicitly noting imported/module matches.
- `go tool nm` successfully enumerated **2,031 text symbols**. The initial parser indexed tokens from the right and dropped names containing spaces; corrected `split(maxsplit=2)` parsing is independently confirmed by Bria. The correction changes counts, not any affected-symbol-absence conclusion. Each of the 27 Trivy CVEs is present in the official Go vulnerability records; full affected package/symbol lists, exact record hashes, binary scan output and symbol inventory are retained in the private per-ID evidence ledger. No selected advisory is missing from the Go dataset.
- All affected package text symbols are absent except `os`. For `CVE-2026-39822`, `os` is present (**32** text functions), but **all 12 specifically affected Root/OpenInRoot/rootFS functions are absent**. This is not an exemption of the entire os package. Official gosu 1.20 source uses ordinary user-file lookup/`exec.LookPath`/`syscall.Exec`; the exact moby/sys/user 0.4.1 non-test source uses ordinary `os.Open` and has no `os.Root`/`OpenRoot`/`OpenInRoot` calls. Binary analysis plus source review avoids relying on `nm` absence alone where compiler inlining could matter.

### All 27 per-ID observations (narrow classification approved)

`P0` means the affected package has no compiled text functions in this exact binary; the unfiltered binary scanner also finds no affected compiled symbols. `S0` means a package is present but every listed vulnerable function is absent, corroborated by source use. Every row is bound to the image/config/binary digests above; it is not portable to another image, architecture, helper binary or future advisory revision. The private ledger retains every affected symbol name, not only the counts below.

| CVE | Official Go advisory | Affected packages | Affected names absent / evidence |
|---|---|---|---|
| CVE-2025-68121 | GO-2026-4337 | crypto/tls | 10, P0 |
| CVE-2025-61726 | GO-2026-4341 | net/url | 3, P0 |
| CVE-2025-61729 | GO-2025-4155 | crypto/x509 | 2, P0 |
| CVE-2026-111943 | GO-2026-6809 | crypto/x509 | 1, P0 |
| CVE-2026-25679 | GO-2026-4601 | net/url | 6, P0 |
| CVE-2026-27145 | GO-2026-5037 | crypto/x509 | 4, P0 |
| CVE-2026-32280 | GO-2026-4947 | crypto/x509 | 2, P0 |
| CVE-2026-32281 | GO-2026-4946 | crypto/x509 | 2, P0 |
| CVE-2026-32283 | GO-2026-4870 | crypto/tls | 15, P0 |
| CVE-2026-33811 | GO-2026-4981 | net | 3, P0 |
| CVE-2026-33814 | GO-2026-4918 | golang.org/x/net/http2, net/http | 35, P0 |
| CVE-2026-33818 | GO-2026-5972 | encoding/asn1 | 4, P0 |
| CVE-2026-39820 | GO-2026-4986 | net/mail | 8, P0 |
| CVE-2026-39821 | GO-2026-5026 | golang.org/x/net/idna, net/http, net/http/internal/http2 | 29, P0 |
| CVE-2026-39822 | GO-2026-4970 | os | 12, S0 (Root-specific, not all os) |
| CVE-2026-39836 | GO-2026-4971 | net | 37, P0 |
| CVE-2026-42499 | GO-2026-4977 | net/mail | 6, P0 |
| CVE-2026-42504 | GO-2026-5038 | mime | 1, P0 |
| CVE-2026-56853 | GO-2026-6089 | net/http | 10, P0 |
| CVE-2026-56858 | GO-2026-6091 | html/template | 3, P0 |
| CVE-2026-56859 | GO-2026-6088 | encoding/xml | 10, P0 |
| CVE-2026-56860 | GO-2026-6218 | net/url | 3, P0 |
| CVE-2026-56862 | GO-2026-6090 | crypto/tls | 11, P0 |
| CVE-2026-78667 | GO-2026-6609 | net/http | 6, P0 |
| CVE-2026-78669 | GO-2026-6611 | golang.org/x/net/http2, net/http, net/http/internal/http2 | 411, P0 |
| CVE-2026-97031 | GO-2026-6607 | crypto/tls | 10, P0 |
| CVE-2026-97054 | GO-2026-6859 | net/http | 149, P0 |

Sources: official Go records at `https://vuln.go.dev/ID/<GO-ID>.json` / `https://pkg.go.dev/vuln/<GO-ID>`; https://github.com/tianon/gosu/releases/tag/1.20 ; https://api.github.com/repos/tianon/gosu/releases/tags/1.20 ; pinned tag source `main.go`, `setup-user.go`, `go.mod`, `SECURITY.md` at https://github.com/tianon/gosu/tree/1.20 ; https://github.com/moby/sys/tree/user/v0.4.1/user . Upstream's CVE policy corroborates interface-based review, but is **not** used as a blanket exemption; the per-binary/per-ID checks above are the basis of the narrowly approved unaffected determination.

## Initial final-app image checkpoint — owned results superseded

The owned web/setup MEDIUM findings and image IDs in this checkpoint are superseded by [the tested OpenSSL follow-up](security-owned-openssl-patch.md): final owned web/API/setup vulnerability **and separate secret scans are zero**, without exceptions. Preserve this earlier table as dated evidence, not current owned-image status. The PostgreSQL raw findings and narrow binary-scoped determination below remain applicable.

The three-image bake/load first completed successfully in 140.9 seconds from `6be4281c9956fcfd5a9a690895bac2e03c629c44`. A later source check correctly detected the last settings-cache fix in `9d4dab6ae0e39562309bccbfdd853867d8bbe908`; parent then explicitly authorized and froze that newer commit. The final **web-only** bake/load completed in 83.4 seconds, including `refetchType: 'all'`, with `APP_VERSION=1.0.0-beta.175`. API/setup build inputs differ in none of their applicable files and their existing image IDs were retained; only the two web hook/test inputs changed. All four image references were rescanned afterward.

The same local Docker daemon/Unix endpoint was verified and frozen with explicit `--host`; only the authorized task web tag was replaced by the last build. Eight pre-existing user tag mappings and all 514 final declared build-input fingerprints remain unchanged. Docker production output includes `ƒ /api/[...path]`; the runtime-stage Node-version/package-manager-absence assertions are built successfully. Twelve image/release contract tests pass. No host app-source edit, version bump, production startup or additional feature work was performed.

| Task tag | Exact new Docker image ID | Raw HIGH / CRITICAL | Other raw findings |
|---|---|---|---|
| `dietledger-security-web:UauPZ0q6` | `sha256:b228f9da671a00c89caefcb7d45edbf19c7e082d6fe92ebff60a450568881cd9` | 0 / 0 | 10 MEDIUM |
| `dietledger-security-api:UauPZ0q6` | `sha256:57cf34d63cd6befbb37489a3ecf3b1d0430add25392d360347627872acf19683` | 0 / 0 | none reported |
| `dietledger-security-setup:UauPZ0q6` | `sha256:3859538dc9fc955098e7acab506e19f591fbdfd404e8aaf56e58b86581d6adb3` | 0 / 0 | 10 MEDIUM |
| unchanged official PostgreSQL digest above | image-config `sha256:fa7e2700e906190f900a3c9d47e87f9032cfa38b60d9ac25129a357f85c2da8c` | 26 / 1 raw; all 27 reviewed not affected in exact gosu binary | 40 MEDIUM, 3 LOW, 1 UNKNOWN, unclassified |

Thus **zero unreviewed HIGH/CRITICAL records remain in these tested artifacts** after the authorized narrow 27-ID classification; this is not an all-severity-zero result. Web/setup retain five MEDIUM records each in libcrypto3 and libssl3 `3.5.8-r0` (reported fix `3.5.9-r1`), not waived. API zlib is updated and its actual all-severity scan reports none. No bundled global npm/tooling vulnerability records remain in final web/setup scans.

Native Trivy is checksum-verified source `v0.69.3` (unstamped binary reports `dev`, provenance recorded), with telemetry disabled, empty private Docker auth configuration and no ignorefile/VEX filtering. DB v2 was available, updated `2026-11-19T19:04:59.970326968Z`; all images used the same verified snapshot. Full raw and HIGH/CRITICAL-only reports are retained privately outside source/build contexts. File-misconfiguration scans returned no records under the selected defaults; runtime/ingress/secret/license testing is not inferred from that result.

The standalone reviewed note binds the exact PostgreSQL manifest/config, linux/amd64, gosu binary SHA-256, each CVE/Go ID, and every official Go advisory JSON revision hash. All 27 current IDs and revisions were rechecked. Seven private boundary checks prove unknown IDs and changed image/config/architecture/binary/advisory revisions do not qualify. No source/CI exemption was implemented to meet the requested finish scope: **the raw PostgreSQL HIGH/CRITICAL command continues to fail (exit 1)**, and repository CI has not been modified to consume the note. Any automated handling still requires an exact-bound, fail-closed implementation/review; no broad path/stdlib ignore is approved.

## Remaining scope limits

1. Other medium/low/unknown findings remain in raw evidence and were not covered by the 27-ID classification. No all-clear CI/all-severity claim is made.
2. Images and build cache are retained for parent inspection. No new service or PostgreSQL wrapper image was introduced; no database/startup, canonical retag, registry/beta publication, tar, deployment or pruning was performed.
3. Exact final web evidence is for `9d4dab6`; API/setup retain their verified `6be4281` builds with unchanged/equivalent inputs at `9d4dab6`. Changes to source/images or the reviewed helper/advisory identities require renewed verification.

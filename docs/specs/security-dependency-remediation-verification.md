# M11 dependency remediation and verification

Verified 2026-11-19, including authorized follow-up. **Application dependency graph remediated at source; release gate remains incomplete.** The reviewed OpenCode dependency replacement is now adopted in the actual ignored local installation: clean install, audit, eight offline tests and strict declaration checking pass against that installed graph. Configuration bytes and external manifest backups are verified unchanged. Running processes, separately bundled core/global packages and TUI integrations are not verified. Lint errors are resolved with a test-guarded, four-file CommonJS exception. EOL migration and final image/platform gates remain explicit. This is not a secure-release certification. The private advisory inventory and approved application-security M11 contract govern this slice.

## Objective, scope and verification plan

Preserve editor, PDF, nutrition and import workflows while removing proven-unused dependency roots, updating required dependencies to reviewed fixes, tracking a clean-install lockfile and enforcing TypeScript build errors. Account for all **115 original npm package/advisory pairs (114 IDs), eight local OpenCode pairs and 26 Go module matches**.

Owned files: dependency sections of `package.json`, `package-lock.json`, `sync-server/go.mod`, `sync-server/go.sum`, `next.config.ts`, `SECURITY.md`, `eslint.config.mjs`, `eslint.config.test.mjs`, `docs/TESTING_STRATEGY.md`, and this document. Scripts are unchanged (compared programmatically with the baseline Git version). Docker, CI and publication exclusions belong to the parent/installer stream. No application database, service, Docker build, image publication or user-global tooling was changed. Subsequent narrow authorization permits only the original ignored `.opencode/package.json`, `.opencode/package-lock.json` and its reinstalled `node_modules`; the two prior manifests were backed up privately outside source before mutation. `opencode.json` was hashed before/after without exposing values and its exact-byte hash is unchanged.

Ordered plan executed:

1. Recover the ignored audit lockfile read-only; reproduce audit ranges and clean-install failure; establish baseline TypeScript/tests; inspect imports, callers and scripts.
2. Remove confirmed-unused dependency roots only; retain script dependencies and the editor/PDF graph.
3. Update required graph, avoiding unrelated editor/test major upgrades; review registry affected ranges and upstream release/security notes.
4. Upgrade compatible Go modules, verify sums through the public checksum database and run symbol-level vulnerability checks without an application database.
5. After baseline TypeScript passes, enforce `ignoreBuildErrors: false`; run clean installation, tests, TypeScript, production build, npm audits and Go checks on the final graph.
6. Record every original advisory's disposition, remaining local-tooling/lifecycle risks and installer handoff requirements.

For registry-only dependency changes, vulnerable-range scans are the failing-before/passing-after check. Weaponized reproduction of third-party bugs is inappropriate here; existing workflow regressions and focused compatibility smoke checks are the narrow TDD alternative permitted by M11. No application behavior change is intended.

## Discovery and compatibility decisions

CodeGraph original-project status, file discovery, searches, exploration and caller queries were used before literal imports/script searches. Its context endpoint returned `Unknown tool`; direct searches/known-source reads filled that gap. This is not evidence of deployment reachability.

- `next-auth`, `react-syntax-highlighter`, `stream-json`, `stream-chain`, `z-ai-web-dev-sdk`: no executable imports/requires/callers in application, tests, scripts or build configuration. Remove these five roots. Stream declarations remain inert; documentation mentions do not require installed packages. Go auth and ordinary React Markdown do not call Auth.js or the removed highlighter. The vulnerable nested Auth.js uuid and highlighter refractor/Prism subtree disappear; another patched Prism instance remains.
- `adm-zip`: **retain**. `scripts/convert-seed-recipes.js` creates ZIPs with `new AdmZip()`, `addFile`, `writeZip`; it does not extract attacker ZIPs. Upgrade 0.5.17 -> 0.6.1 after reading upstream behavior changes: extraction subdirectory semantics, duplicate-name rejection, permission stripping and size/symlink guards do not alter the script's unique `manifest.json` creation. Synthetic creation/read roundtrip passes.
- `sharp`: **retain** for `scripts/generate-icons.js` and `scripts/gen-palette-swatches.js`, and Next's optional image graph. Upgrade 0.34.5 -> 0.35.5 (Next 16.4.6 itself requests `^0.35.5`). Synthetic SVG -> resized PNG -> metadata smoke passes; local libvips is 8.18.7, librsvg 2.63.2, libheif 1.23.5. This is not an Alpine/native-image scan.
- Next 16.4.6 stays on supported Active LTS 16.x; matching eslint-config-next 16.4.6. React/React DOM resolve together to 19.3.1 within existing 19.x constraints. No Next 17, Vite 9, Vitest 5, jsdom 31, or MDXEditor 4 migration was taken.
- Initial commit retained `@mdxeditor/editor` 3.55.0 conservatively and patched its yaml pin. Authorized follow-up removes this **proven-unused** root after repeated import/require/config/script and CodeGraph caller review: actual recipe/template/custom-nutrition editors are repository components, not MDXEditor. This also removes Sandpack's obsolete intersection-observer dependency. The only executable yaml caller is the retained seed-conversion script, so **js-yaml ^4.3.2 is now declared directly**, not silently borrowed from dev/editor transitives. This is an existing package made explicit, not a new library. Remove the now-unnecessary editor override. Avoid js-yaml 5's documented schema/API changes. All resolved yaml nodes remain 4.3.2; frontmatter load/dump smoke and application regressions verify compatibility.
- PDF roots `jspdf`, `html2canvas`, `html-to-image` remain. `src/lib/pdf-export.ts` and its cookbook-export caller are preserved. DOMPurify/fflate are jspdf transitives; direct IN_PLACE/custom sanitizer modes and ZIP64 decompression were not found in application code. Removing the unused editor root also removes the remaining Prism instance. This qualification does not replace PDF dependency patches or the separately owned PDF-injection fixes.
- Vitest/coverage 4.1.12, Vite 8.3.8, jsdom 29.1.1 and updated Babel/ESLint transitives stay within their parent-supported constraints. The unused MDXEditor removal is also a lifecycle reduction, not a replacement of application editors. Minimatch 10 -> 11 occurs through updated typescript-eslint's declared dependency, not an override forced onto incompatible callers. The unused SDK graph disappears; Undici 7.30.2 remains dev-only through jsdom. Native Tailwind optional binding is aligned to its resolved 4.3.5 parent.

### Reachability classes used by every npm ledger row

| Packages | Source/feature exposure qualification and shared verification |
|---|---|
| next | Standalone Next server and API proxy are active; Linux is the source-build target. Images are unoptimized; no application `next/og`, Server Actions (`use server`) or `use cache` declarations were found. Windows-specific RCE, image/AVIF/SVG, custom-server Actions, SSG/ISR and cache conditions differ; all 21 records are patched anyway, not waived by presumed feature absence. Proxy/auth/public routes compile in the production build. |
| next-auth | Removed, no callers; its provider-cookie/getToken/email-normalizer paths were not application auth. |
| adm-zip | Seed ZIP creation script only; no application extraction caller found; smoke test plus upgraded graph. |
| sharp | Asset scripts plus optional Next dependency; local native smoke and production build, not final-image proof. |
| dompurify, fflate, prismjs | PDF transitives retained and patched; no application direct IN_PLACE sanitizer or vulnerable ZIP64 decode invocation demonstrated. Both highlighter and unused-editor Prism nodes are removed in the final graph. Existing PDF/custom-nutrition tests pass. |
| stream-json | Removed, no executable parser/filter callers; stream-chain root removed too. |
| undici | jsdom developer test environment, not a separately imported production client. SOCKS/cache/cookie/WebSocket/EventSource/SRI/decompression conditions are advisory-specific; no proof all are invoked, but all 29 are patched and tests pass. Node's built-in fetch is separately owned by the runtime version. |
| @babel/core, baseline-browser-mapping, browserslist, brace-expansion, minimatch, js-yaml, nanoid, postcss, source-map-js | Build/lint/test or editor transitive processing of source/maps/globs/config; do not expose developer servers or process untrusted projects as trusted. js-yaml also has the retained seed-script caller. Patched rather than waived as dev-only. Clean install, typecheck, tests and production build verify integration. |
| @vitest/mocker, vite, vitest | Test/developer server and mocking/editor endpoints, not standalone runtime routes. Do not expose watch/mock/dev servers to untrusted clients. Both shared-ID package rows are counted; test suite runs successfully. |
| uuid, zod | Vulnerable Auth.js uuid node removed; retained root uuid is 11.1.1. Zod 4.6.7 is outside the oversized-collections range, also used by lint transitives. No application Zod collection exploit is asserted. |

## Reproducibility and toolchain handoff

- Original ignored lockfile is not `npm ci`-ready: missing platform-specific optional watcher/SWC/Tailwind/lightningcss entries cause EUSAGE. Lock-only repair reproduced the baseline without changing its selected versions. The committed replacement is lockfileVersion 3 with registry URLs and integrity values, including cross-platform optional metadata; no local-file/Git/private registry resolutions were found.
- The host initially disallowed remote tarball resolutions. An explicit per-command `--allow-remote=all` enabled official-registry resolution; no global configuration changed. Final **plain `npm ci`** succeeds. npm 11.16.0 clean installation also succeeds using the same lockfile. The initial installations warn that four lifecycle scripts are not locally allowlisted (watcher, SWC, core-js, es5-ext); removing the unused editor subtree reduces this to watcher, SWC and core-js; do not blanket-enable unknown scripts. Native/test/build checks pass under this host policy; clean image behavior is a separate gate.
- Tested Node **22.23.2**, npm **12.2.0** and **11.16.0**. The Linux dependency graph requires at least Node 22.13.0 in the 22.x line (jsdom); the tested npm 12.2.0 itself requires 22.22.2+. Use a current reviewed Node 22 patch, not bare old Node 20/22 assumptions. Retain documented supported platform limits.
- Go module minimum becomes **1.26.0**: pgx 5.9.2 requires 1.25, crypto 0.59.0 and its text 0.44.0 require 1.26. Crypto 0.58.1 is not a published stable tag; 0.59.0 is the reviewed published release after OpenPGP's separate-module removal. Do not introduce a pseudo-version or import the unsafe OpenPGP module merely to silence a report. Required x/sync resolves to 0.25.0. `go.sum` is retained/regenerated and verified, not discarded.
- Tested toolchain **go1.27.4-X:nodwarf5 linux/amd64**; official Go download metadata confirms stable 1.27.4 (and maintained 1.26.11). Minimum language compatibility is not a security endorsement of Go 1.26.0. Prefer reviewed 1.27.4 for release builds and re-scan the actual compiler/runtime artifact.
- **Installer owner handoff:** copy `package.json` **and** `package-lock.json` before `RUN npm ci`; retain required platform optional packages. Remove blanket `GONOSUMCHECK=*`/checksum-database bypasses, retain normal `GOSUMDB=sum.golang.org` verification. Replace old Go 1.24 builder with reviewed 1.27.4. This dependency commit does not edit installer-owned Dockerfiles or CI, pin base digests, or assert those changes have landed. Parent removes the lockfile ignore and retires private script aliases separately.

## npm per-advisory ledger (115 pairs / 114 IDs)

Source: fresh npm registry `npm audit --json` against the original lockfile, exact installed-version/range matching, then fresh full/dev and production audits against the committed lock. Every ID below identifies its canonical security record at `https://github.com/advisories/<ID>`. A **patched** disposition means all final resolved versions of that package are outside every reported affected range for that ID and the final audit is clean; it does not mean no other vulnerability exists.

Node keys are repo-relative: normally `node_modules/<package>`. Original exceptions: brace-expansion 1.1.14 at `node_modules/minimatch/node_modules/brace-expansion`, 5.0.6 at `node_modules/brace-expansion`; minimatch 10.2.5 at `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch`; postcss 8.4.31 root, 8.5.14 under `@tailwindcss/postcss/node_modules/postcss`, 8.5.15 under `vite/node_modules/postcss`; Prism 1.27.0 under `refractor/node_modules/prismjs`; uuid 8.3.2 under `next-auth/node_modules/uuid`. Final exact node/integrity provenance is the committed lockfile. Reachability and verification for each row are inherited from its package's class above.

| npm package @ original version(s) | Advisory ID | Registry affected range | Final version(s) / disposition |
|---|---|---|---|
| @babel/core @ 7.29.0 | GHSA-4x5r-pxfx-6jf8 | <=7.29.0 | 7.29.13 patched |
| @vitest/mocker @ 4.1.8 | GHSA-82fw-gwwq-j7x9 | >=2.1.0 <4.1.11 | 4.1.12 patched |
| @vitest/mocker @ 4.1.8 | GHSA-qxg6-89mg-rqv8 | >=2.1.0-beta.7 <4.1.12 | 4.1.12 patched |
| adm-zip @ 0.5.17 | GHSA-xcpc-8h2w-3j85 | <0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-vwc7-r8mq-g2x9 | >=0.5.9 <=0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-7q85-xj36-vmfc | <0.6.1 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-rcw4-f5rp-g42v | <=0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-j5f4-cc29-5x44 | <=0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-p634-w6r4-rjp2 | <=0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-c6fg-446q-cg94 | <=0.6.0 | 0.6.1 patched |
| adm-zip @ 0.5.17 | GHSA-8238-w5pm-2374 | <=0.6.0 | 0.6.1 patched |
| baseline-browser-mapping @ 2.10.29 | GHSA-w5vr-8v7q-w6rv | >=2.0.0 <2.11.0 | 2.11.38 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-3jxr-9vmj-r5cp | <1.1.16 or >=3.0.0 <5.0.7 | 1.1.22, 5.0.13 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-mh99-v99m-4gvg | <1.1.17 or >=4.0.0 <5.0.8 | 1.1.22, 5.0.13 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-rgw5-rvv9-x895 | <1.1.18 or >=4.0.0 <5.0.9 | 1.1.22, 5.0.13 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-q2hr-2g5m-vwhr | <1.1.21 or >=4.0.0 <5.0.12 | 1.1.22, 5.0.13 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-qhr7-859c-m2p7 | <1.1.20 or >=4.0.0 <5.0.11 | 1.1.22, 5.0.13 patched |
| brace-expansion @ 1.1.14, 5.0.6 | GHSA-6j4f-fj2g-mc7p | <1.1.19 or >=4.0.0 <5.0.10 | 1.1.22, 5.0.13 patched |
| browserslist @ 4.28.2 | GHSA-c83g-rgw3-j3cx | <=4.28.6 | 4.29.6 patched |
| browserslist @ 4.28.2 | GHSA-73wf-gq98-2v4g | <=4.28.6 | 4.29.6 patched |
| dompurify @ 3.4.3 | GHSA-hpcv-96wg-7vj8 | <=3.4.5 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-r47g-fvhr-h676 | <=3.4.5 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-rp9w-3fw7-7cwq | <=3.4.6 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-cmwh-pvxp-8882 | <=3.4.10 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-vxr8-fq34-vvx9 | <3.4.9 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-gvmj-g25r-r7wr | >=3.0.0 <=3.4.7 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-x4vx-rjvf-j5p4 | <=3.4.6 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-76mc-f452-cxcm | <3.4.7 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-55q2-fjhq-7xh7 | <=3.4.12 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-c2j3-45gr-mqc4 | <=3.4.11 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-6688-9rhm-gjv2 | <=3.4.15 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-c6gr-qvv4-5v3f | <=3.4.16 | 3.4.18 patched |
| dompurify @ 3.4.3 | GHSA-mrv2-3pqr-j5jr | <=3.4.16 | 3.4.18 patched |
| fflate @ 0.8.2 | GHSA-px8p-9vwx-vf98 | >=0.8.0 <0.8.3 | 0.8.3 patched |
| js-yaml @ 4.1.1 | GHSA-h67p-54hq-rp68 | >=4.0.0 <=4.1.1 | 4.3.2 patched |
| js-yaml @ 4.1.1 | GHSA-52cp-r559-cp3m | >=4.0.0 <4.3.0 | 4.3.2 patched |
| js-yaml @ 4.1.1 | GHSA-5p4m-2wfm-xmqj | >=4.0.0 <4.3.1 | 4.3.2 patched |
| js-yaml @ 4.1.1 | GHSA-2883-xcg3-v3hh | >=4.0.0 <4.3.2 | 4.3.2 patched |
| minimatch @ 10.2.5 | GHSA-g3hv-75wg-m249 | >=7.0.0 <11.0.1 | 11.0.9, 3.1.5 patched |
| nanoid @ 3.3.12 | GHSA-28wg-ghj8-5hjv | <3.3.16 | 3.3.20 patched |
| nanoid @ 3.3.12 | GHSA-2v37-7h3g-55p8 | <3.3.18 | 3.3.20 patched |
| next @ 16.2.6 | GHSA-6gpp-xcg3-4w24 | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-m99w-x7hq-7vfj | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-89xv-2m56-2m9x | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-68g3-v927-f742 | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-4633-3j49-mh5q | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-4c39-4ccg-62r3 | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-p9j2-gv94-2wf4 | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-q8wf-6r8g-63ch | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-955p-x3mx-jcvp | >=16.0.0 <16.2.11 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-p293-qw3h-jr36 | >=16.0.0 <16.3.3 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-2xp9-vwfh-vxw4 | >=16.0.0 <16.3.3 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-vcvr-r3jv-pc5j | >=16.2.0 <16.3.6 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-4jqv-mc3x-m676 | >=16.0.0 <16.3.8 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-39w2-rjm5-chcv | >=16.0.0 <16.3.8 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-f87g-xv8r-7p7x | >=16.0.0 <16.3.8 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-mcj8-r9mp-w47p | >=16.0.0 <16.3.8 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-cjq9-62q9-8jv4 | >=16.0.0 <16.3.8 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-2464-fhr4-w9xw | >=16.0.0 <=16.4.0 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-p3m5-59mp-jv5r | >=16.0.0 <=16.4.0 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-673q-mjm6-r5xr | >=16.0.0 <=16.4.0 | 16.4.6 patched |
| next @ 16.2.6 | GHSA-vc7v-qv4w-wrv8 | >=16.2.0 <=16.4.4 | 16.4.6 patched |
| next-auth @ 4.24.14 | GHSA-7rqj-j65f-68wh | >=4.10.3 <4.24.15 | removed |
| next-auth @ 4.24.14 | GHSA-xmf8-cvqr-rfgj | >=4.0.6 <=4.24.14 | removed |
| next-auth @ 4.24.14 | GHSA-x445-f3h2-j279 | <=4.24.14 | removed |
| postcss @ 8.4.31 | GHSA-qx2v-qp2m-jg93 | <8.5.10 | 8.5.23, 8.5.33 patched |
| postcss @ 8.4.31 | GHSA-6g55-p6wh-862q | <=8.5.11 | 8.5.23, 8.5.33 patched |
| postcss @ 8.4.31, 8.5.14, 8.5.15 | GHSA-fxqj-rqcc-2cmp | <=8.5.22 | 8.5.23, 8.5.33 patched |
| postcss @ 8.4.31, 8.5.14, 8.5.15 | GHSA-r28c-9q8g-f849 | <=8.5.17 | 8.5.23, 8.5.33 patched |
| prismjs @ 1.27.0 | GHSA-x7hr-w5r2-h6wg | <1.30.0 | removed with highlighter/editor roots; no final Prism nodes |
| sharp @ 0.34.5 | GHSA-f88m-g3jw-g9cj | <0.35.0 | 0.35.5 patched |
| sharp @ 0.34.5 | GHSA-rgj7-g3m4-5g8c | <0.35.4 | 0.35.5 patched |
| sharp @ 0.34.5 | GHSA-wq5f-xc86-pv6w | <0.35.5 | 0.35.5 patched |
| source-map-js @ 1.2.1 | GHSA-68fv-2mgg-jv7q | >=1.0.0 <1.2.2 | 1.2.4 patched |
| stream-json @ 2.1.0 | GHSA-528h-pc64-c93x | <=3.4.0 | removed |
| stream-json @ 2.1.0 | GHSA-hqr4-qq8f-hg3x | <=3.5.0 | removed |
| stream-json @ 2.1.0 | GHSA-mjw6-4jj6-33hc | <3.6.0 | removed |
| stream-json @ 2.1.0 | GHSA-jj87-hc4r-jwfw | >=2.0.0 <=3.6.0 | removed |
| undici @ 7.27.1 | GHSA-vmh5-mc38-953g | >=7.23.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-p88m-4jfj-68fv | >=7.0.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-hm92-r4w5-c3mj | >=7.23.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-g8m3-5g58-fq7m | >=7.0.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-pr7r-676h-xcf6 | >=7.0.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-8xcm-r25x-g524 | >=7.0.0 <7.29.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-4cwx-7wf7-3272 | >=7.0.0 <7.29.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-m8rv-5g2x-5cg5 | >=7.0.0 <7.29.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-jr45-8vmc-qm54 | >=7.0.0 <7.29.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-v3r7-h72x-cjcm | >=7.0.0 <7.29.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-35p6-xmwp-9g52 | >=7.0.0 <7.28.0 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-pmjh-fq2x-6v4x | >=7.11.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-r53p-7pc4-xj5r | >=7.0.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-rfgv-xxqx-mfg5 | >=7.0.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-3xpg-4rpp-hhhm | >=7.15.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-2jfj-6hjv-fm6j | >=7.0.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-2gqq-gqf2-x968 | >=7.1.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-w293-vg96-wgc3 | >=7.24.1 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-8436-99hf-9mmv | >=7.0.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-rx4f-c7p8-82vq | >=7.0.0 <7.29.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-4qv8-2p9j-2685 | >=7.0.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-f72v-6w45-q472 | >=7.15.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-xjj6-f33q-929c | >=7.18.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-4w7w-5xrc-9h26 | >=7.0.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-2m5v-pch6-74hx | >=7.0.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-qrxm-fqhp-jwvm | >=7.0.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-9fm3-97px-rjf6 | >=7.0.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-55wc-3pg8-jfw6 | >=7.15.0 <7.30.1 | 7.30.2 patched |
| undici @ 7.27.1 | GHSA-vxpw-j846-p89q | >=7.0.0 <7.28.0 | 7.30.2 patched |
| uuid @ 8.3.2 | GHSA-w5hq-g745-h8pq | <11.1.1 | Auth.js node removed; retained root 11.1.1 patched |
| vite @ 8.0.16 | GHSA-698v-4r3x-3vcv | >=8.0.0 <=8.1.5 | 8.3.8 patched |
| vite @ 8.0.16 | GHSA-r825-w8mm-5pxw | >=8.0.0 <=8.1.5 | 8.3.8 patched |
| vite @ 8.0.16 | GHSA-587h-7wmj-h5pm | >=8.0.0 <=8.1.5 | 8.3.8 patched |
| vite @ 8.0.16 | GHSA-9jrq-w75r-8gcw | >=8.0.0 <=8.1.5 | 8.3.8 patched |
| vite @ 8.0.16 | GHSA-rq7h-c2jc-7f22 | >=8.0.0 <=8.1.5 | 8.3.8 patched |
| vitest @ 4.1.8 | GHSA-82fw-gwwq-j7x9 | >=2.1.0 <4.1.11 | 4.1.12 patched |
| zod @ 4.4.3 | GHSA-mrhx-c7xc-m3w5 | <4.6.6 | 4.6.7 patched |

Inherited affected nodes are accounted for, not additional advisory IDs: unused MDXEditor 3.55.0 is removed and the seed script's yaml is declared directly at 4.3.2; react-syntax-highlighter/refractor subtree is removed; coverage/mocker update together to 4.1.12; typescript-eslint/parser/plugin/type-utils/estree/utils are updated through eslint-config-next (final 8.73.0) with fixed glob dependency. Registry package-node count is not a vulnerability-ID count.

## Independent local OpenCode ledger (eight resolved in actual installed local graph)

Before maintenance, original ignored package files selected `@opencode-ai/plugin` 1.15.12, effect 4.0.0-beta.66, toml 4.1.1 and zod 4.1.8. Fresh actual baseline audit confirmed **four affected graph nodes / eight pairs / eight IDs**. The live manifest contained only the expected plugin dependency; unexpected other dependencies would have stopped adoption. The two original manifests were backed up byte-for-byte in external private storage with 0700 directory / 0600 files before edits. No config/credentials were copied, and no original config, global environment, tool process or service was changed/restarted. Standard node keys are `.opencode/node_modules/<package>`.

The actual installed replacement retains plugin **and SDK 1.15.12**, overrides **only that plugin's effect to stable 4.1.4 and zod to 4.6.7**, and resolves without TOML. Original root package naming and all expected local dependencies are preserved; selected package records/integrities match the tested candidate exactly. This closes the eight matches in the actual local package graph, not merely in an excluded/private candidate. The ignored tooling manifests remain untracked.

| Package @ original version | Advisory | Affected range | Reviewed patch / actual installed disposition |
|---|---|---|---|
| effect @ 4.0.0-beta.66 | GHSA-chp3-j5qr-2vfr | >=4.0.0-beta.0 <4.0.0-beta.103 | stable 4.1.4 patched; cookie constructor AND serializer rejection tests pass |
| toml @ 4.1.1 | GHSA-82x6-q7mm-w9cf | <4.2.0 | TOML subtree removed by reviewed stable Effect graph |
| toml @ 4.1.1 | GHSA-v5mp-jgw5-2x6j | <4.1.2 | TOML subtree removed by reviewed stable Effect graph |
| toml @ 4.1.1 | GHSA-4qx8-w7c3-pj3p | <=5.0.0 | TOML subtree removed; upstream 5.0.1 also exists if a parser is later needed |
| toml @ 4.1.1 | GHSA-9j65-hcg3-gc64 | <=5.0.0 | TOML subtree removed; upstream 5.0.1 exists |
| toml @ 4.1.1 | GHSA-9qmh-m7c6-f92p | <=5.0.0 | TOML subtree removed; upstream 5.0.1 exists |
| toml @ 4.1.1 | GHSA-h895-cgqg-jf52 | <=5.0.0 | TOML subtree removed; upstream 5.0.1 exists |
| zod @ 4.1.8 | GHSA-mrhx-c7xc-m3w5 | <4.6.6 | 4.6.7 patched; plugin schema construct/parse/reject/execute tests pass |

Reachability review is specific: plugin `dist/index.js` only reexports its tool helper; `dist/tool.js` only imports Zod and returns the tool definition unchanged. **No published executable plugin module imports Effect or TOML**, and the pinned SDK does not import them either. Thus replacing this unused installed Effect transitive with its patched stable release removes no executed plugin API or TOML caller. It is not a blind beta jump or an assumption of compatibility based on semver. The optional TUI entry still depends on its existing optional peers; it was not launched. Newest plugin 1.19.6 still pins affected effect beta.83/zod 4.1.8; npm's suggestion to move backwards to plugin 1.4.3 was rejected.

Candidate files are retained privately under ignored `tmp/m11/opencode-patched/`: `package.json`, `package-lock.json`, `compat.test.mjs`, `typecheck.mts`, `README.md`. Do not publish them as an application dependency contract. Manifest SHA-256: `9c401d2df460c103519a64e3c65c189b0e0e6e9df672b2c7c4bd34d7078e0f7e`; lock SHA-256: `c419540c1a804b72d48d8af664aea386698b7ff440b4e4b49ea7c7c859213ce6`.

Candidate verification first passed isolated install/audit, eight offline tests and strict declaration checking. Actual adoption then ran fresh `npm ci --prefix .opencode --ignore-scripts --bin-links=false`, `npm audit --prefix .opencode --json` and `npm ls --prefix .opencode --all`: all exit zero, 10 packages installed, **zero findings at every severity**, no invalid dependencies and no TOML nodes. The first actual install attempt without the command-local bin-link flag failed with filesystem `EPERM` on a symlink and was explicitly treated as incomplete, not validated by a clean lock-only audit. The approved flag required no persistent/global npm configuration change.

All **eight offline tests were rerun against the actual installed graph**, not the candidate: an ESM stdin harness with current directory `.opencode` resolves its static imports and lockfile from that installation. Separate assertions confirm plugin/SDK/Effect/Zod imports resolve under actual `.opencode/node_modules`. Tests cover retained plugin/SDK identities, no executable Effect/TOML plugin imports, tool/Zod compatibility, injected-only SDK transport, three cookie-field injection negatives including direct serializer, and ordinary cookie serialization. Strict TypeScript NodeNext checking with `skipLibCheck: false` also passes using the actual plugin/SDK/Zod declaration graph; resolution tracing confirms no candidate `node_modules` declarations were used.

**Filesystem/link qualification:** the only omitted `.bin` entry is `node-which`, a CLI launcher. The plugin has no bin entry and its tool helper imports Zod directly. The SDK's cross-spawn resolver imports the `which` **library**, not `.bin/node-which`; direct library resolution plus all eight tests pass without that link. This makes command-local `--bin-links=false` appropriate for this local library graph only; it is not a blanket recommendation for application/developer CLI installs. `--ignore-scripts` remains in effect.

After installation and tests, the original `opencode.json` SHA-256 exactly matches the pre-maintenance hash; original backup hashes and permissions are intact. No config/provider/global package change or process restart occurred. The actual local manifest/lock/library graph is verified; running OpenCode processes, separately bundled core/global packages, optional TUI integrations and real provider/session workflows were not exercised or certified fixed.

## Go per-advisory ledger (26 matches)

Authoritative source: newly fetched `https://vuln.go.dev` records via govulncheck 1.10.0 (database last modified 2026-11-11T02:51:11Z), also available as `https://pkg.go.dev/vuln/<ID>`. Node keys are `sync-server/go.mod` module selections, not npm paths. Before versions: `github.com/jackc/pgx/v5` 5.7.4, `golang.org/x/crypto` 0.33.0, `golang.org/x/text` 0.22.0.

Baseline source scan reported **26 distinct module matches**, five imported-package matches and five entry-point symbol traces across **three distinct advisory IDs**: GO-2026-5004 and both x/text records. Pgx's SQL sanitizer trace does not alone prove exploitation: the advisory requires non-default simple protocol plus dollar-quoted placeholder confusion. x/text normalization/PRECIS traces arise through pgx connection handling. These are stronger evidence than a module-only match but not live exploit demonstrations. The crypto SSH/agent/knownhosts/OpenPGP packages have no application callers; application uses bcrypt. All modules are updated anyway.

| Advisory | Module | Reported first fix | Final selection / disposition |
|---|---|---|---|
| GO-2025-3487 | x/crypto | 0.35.0 | 0.59.0 patched; SSH not imported |
| GO-2025-4116 | x/crypto | 0.43.0 | 0.59.0 patched; agent not imported |
| GO-2025-4134 | x/crypto | 0.45.0 | 0.59.0 patched; SSH not imported |
| GO-2025-4135 | x/crypto | 0.45.0 | 0.59.0 patched; agent not imported |
| GO-2026-4771 | pgx/v5 | 5.9.0 | 5.9.2 patched; pgproto3 imported, no baseline symbol trace |
| GO-2026-4772 | pgx/v5 | 5.9.0 | 5.9.2 patched; pgproto3 imported, no baseline symbol trace |
| GO-2026-5004 | pgx/v5 | 5.9.2 | 5.9.2 patched; baseline SanitizeSQL entry-point trace |
| GO-2026-5005 | x/crypto | 0.52.0 | 0.59.0 patched; agent not imported |
| GO-2026-5006 | x/crypto | 0.52.0 | 0.59.0 patched; agent not imported |
| GO-2026-5013 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5014 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5015 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5016 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5017 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5018 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5019 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5020 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5021 | x/crypto | 0.52.0 | 0.59.0 patched; knownhosts not imported |
| GO-2026-5023 | x/crypto | 0.52.0 | 0.59.0 patched; SSH not imported |
| GO-2026-5033 | x/crypto | 0.52.0 | 0.59.0 patched; agent not imported |
| GO-2026-5932 | x/crypto | 0.58.1-0.20261009181718-2f1f834330b2 | 0.59.0 no unsafe OpenPGP module selected; never claim OpenPGP itself is safe |
| GO-2026-5970 | x/text | 0.39.0 | 0.44.0 patched; baseline norm symbol traces |
| GO-2026-6303 | x/crypto | 0.55.0 | 0.59.0 patched; SSH not imported |
| GO-2026-6354 | x/crypto | 0.56.0 | 0.59.0 patched; SSH not imported |
| GO-2026-6355 | x/crypto | 0.56.0 | 0.59.0 patched; SSH not imported |
| GO-2026-6629 | x/text | 0.41.0 | 0.44.0 patched; baseline precis Profile.Bytes trace |

Final `govulncheck -json ./...` reports **zero findings at module, package and symbol levels**, including the tested Go standard library; plain-text scan says `No vulnerabilities found.` JSON-mode exit zero is not used alone as proof: findings were parsed explicitly. Final-image Go/OS checks remain outstanding.

## Executed checks and remaining gates

All commands below are from repository root unless shown otherwise; raw outputs remain private and are not published as source artifacts.

| Check | Actual outcome |
|---|---|
| Baseline npm audit (original lock) | 33 nodes: low 1, moderate 19, high 11, critical 2. 115 unique package/ID pairs, 114 IDs. Six brace records repeat per version in raw registry output; deduplicated without dropping either version. |
| Baseline lock repair + own clean install | Original `npm ci` fails missing optional metadata; repair then own `npm ci` succeeds. No symlinked node_modules. |
| Baseline `npx tsc --noEmit --incremental false` | pass |
| Baseline `npm test` | 59 files / 541 tests pass |
| Final plain `npm ci` | pass; 742 packages installed after unused-editor removal (initial commit: 895); audit zero |
| `npx --yes --allow-remote=all npm@11.16.0 ci` | pass on final lockfile; 742 packages; audit zero |
| Final `npm audit --json` and `npm audit --omit=dev --json` | both exit 0, all severity counts zero, no advisory exceptions used |
| `npm ls --all --json` | exit 0; no invalid/peer dependency graph |
| Final `npm test` after clean installation | 59 files / 541 tests pass, none skipped |
| Final `npx tsc --noEmit --incremental false` | pass; no ignore of baseline type failures |
| Final `npm run build:web` after clean installation | pass, Next 16.4.6 webpack standalone production compilation, TypeScript and 22 prerendered pages; proxy and dynamic/public routes included |
| In-memory AdmZip/YAML/sharp compatibility smoke | pass; no generated tracked assets or provider/API requests |
| `npm run lint` | **pass**, zero errors / three existing warnings. Baseline 21 errors were reproduced first; exception is only no-require-imports on four exact standalone harness files, never application TypeScript or all CJS. |
| `node --test eslint.config.test.mjs` | RED: four expected failures, two already-enforced negatives pass; GREEN: all six pass after the four-file exception. Integrating CI should run this command alongside lint. |
| `node --test docs/GitHubPagesTemp/*.test.cjs` | 49 pass, 5 browser tests skip (no borrowed browser/runtime); all four unchanged CJS harnesses still load as designed. |
| Actual ignored OpenCode clean install / audit / npm ls / tests / types | pass with command-local `--ignore-scripts --bin-links=false`, zero findings, eight actual-graph offline tests, strict actual full declaration typecheck; config byte hash and original external backups unchanged. No core/global/process/TUI claim. |
| `cd sync-server && go mod tidy` / `go mod verify` | pass, public proxy/checksum verification enabled, no blanket checksum exception |
| `cd sync-server && go run golang.org/x/vuln/cmd/govulncheck@v1.10.0 -json ./...` and plain-text variant | pass, final zero findings; scanned source plus tested stdlib, not deployed binaries |
| `cd sync-server && go test -count=1 -json ./...` with DATABASE_URL and TEST_DATABASE_URL unset | exit 0, **91 top-level tests pass, 223 top-level tests skip** for absent disposable PostgreSQL; including subtests 226 pass / 314 skip. This is not database regression coverage. |
| Scripts unchanged / lock URL-integrity review / `git diff --check` | pass |

Not run: `npm run build` because it invokes private version-bump/build orchestration rather than the ordinary production compilation; browser/manual PDF/editor journeys; PostgreSQL integration/migration/auth persistence tests; Windows/arm64/Alpine-native verification; Docker image builds/scans; deployed Node/Go/OS/native scans; release publication. These remain parent/operator candidate gates, not waived by green source checks.

Lifecycle review: the obsolete intersection-observer subtree is **removed**, along with its caller-free MDXEditor/Sandpack root. **ESLint 9.39.5 remains EOL** (upstream 2026-08-06): a private strict-peer resolution of ESLint 10.15.0 + eslint-config-next 16.4.6 fails **ERESOLVE**. Latest eslint-plugin-import 2.32.0, eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 still declare peers only through ESLint 9. Therefore there is no currently compatible supported upstream lint graph on this Next config without a separate reviewed plugin/config migration. Do not use --force/--legacy-peer-deps, remove accessibility/import/React checks, or call EOL 9 supported. This precise upstream compatibility blocker must return to the maintainer; passing lint resolves the 21-error CI failure, not the EOL gate.

Recharts 2.15.4 remains inactive and used by seven nutrition/health chart components plus the shared chart wrapper; it is runtime UI, not disposable tooling. There is no newer 2.x upstream patch. Removing it would break active workflows, and a 3.x migration requires separately reviewed chart API/layout/accessibility/browser verification, not a blind dependency bump. No new advisory match is reported for either lifecycle issue, and no owner exception is inferred. Vitest/Vite's future native-config-loader warning remains unsuppressed; current tests/build pass.

Minimal reporting policy is `SECURITY.md` (private report to Matthew Dumas, matt@dietledger.app). Final CI/npm-ci/image-digest/checksum and publication-exclusion acceptance belongs to the integrating stream; re-run against its merged sanitized commit and actual images. Keep unresolved detailed security evidence private until coordinated review.

## Authoritative sources rechecked

- npm registry metadata/affected ranges and fresh `npm audit` for both independent lockfiles: https://registry.npmjs.org/
- Next supported 16.x policy: https://nextjs.org/support-policy
- Next TypeScript build-error behavior: https://nextjs.org/docs/app/api-reference/config/typescript#disabling-typescript-errors-in-production
- Clean locked installation: https://docs.npmjs.com/cli/v11/commands/npm-ci
- Scoped overrides: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides
- ZIP behavioral/security fixes: https://github.com/cthackers/adm-zip/releases
- Sharp reviewed release/native update: https://github.com/lovell/sharp/releases/tag/v0.35.5
- YAML affected/fixed ranges: https://github.com/advisories/GHSA-2883-xcg3-v3hh ; major-change avoidance: https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md
- Effect cookie patch: https://github.com/advisories/GHSA-chp3-j5qr-2vfr ; reviewed stable package/exports/dependencies: https://registry.npmjs.org/effect/4.1.4 ; source constructor/serializer validation was also inspected in that exact package tarball.
- TOML 5.0.1 security release (not needed after candidate removes its subtree): https://github.com/BinaryMuse/toml-node/releases/tag/v5.0.1
- Narrow CommonJS import rule options: https://typescript-eslint.io/rules/no-require-imports/
- Go module requirements: https://proxy.golang.org/github.com/jackc/pgx/v5/@v/v5.9.2.mod ; https://proxy.golang.org/golang.org/x/crypto/@v/v0.59.0.mod
- OpenPGP carve-out, not security rehabilitation: https://github.com/golang/crypto/commit/2f1f834330b2
- Go source/symbol advisories: https://vuln.go.dev/ ; https://pkg.go.dev/vuln/GO-2026-5004 ; https://pkg.go.dev/vuln/GO-2026-6354 ; https://pkg.go.dev/vuln/GO-2026-6629
- Official maintained toolchain releases: https://go.dev/dl/?mode=json
- ESLint lifecycle: https://eslint.org/version-support/

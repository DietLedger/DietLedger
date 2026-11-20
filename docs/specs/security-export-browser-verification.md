# M8 UI-01/UI-02 and M10 UI-04 browser remediation

Authorized slice of the privately approved application-remediation contract and complete security-release roadmap. This slice changes export presentation and legacy browser-cache retirement only. Authentication storage, API clients, provider logging, domain calculations, deployment and real user data are outside scope.

## Implemented contract

- Treat stored/imported fields as plain text in every PDF family. Encode template text/quoted values; allow only supported system fonts and plain hex colors. Build the dashboard's main-document header with DOM `textContent`, not HTML interpolation.
- Render template exports in a script-disabled `sandbox="allow-same-origin"` iframe. Parent DOM access is necessary for html2canvas; no `allow-scripts` permission is granted. Encoding remains primary protection, including against the renderer's own cloned documents.
- Preserve food-specific unit display, custom per-serving facts, source labels and unknown-nutrient notices. Uploaded PNG/JPEG/GIF/WebP base64 data logos remain supported. SVG, malformed data and external URLs are not loaded: external raster URLs can track private export activity, and SVG is active-capable content. Both cookbook/report controls explain this before export; each omitted logo also produces a visible notice in the PDF. Brand name/tagline remain text.
- Keep `/sw.js` as a network-only retirement update: no fetch handler, no persistent API cache. It uses `skipWaiting`, claims old controlled tabs, deletes only `dietledger-v1`, then unregisters. A dedicated message/acknowledgement deletes that cache again; acknowledgement waits for activation/claim completion.
- `retireLegacyBrowserCache()` updates only the known root `/sw.js` registration, verifies the retirement acknowledgement and removes only the known cache. It never unregisters a still-caching old worker and falsely declares control gone. Mixed/unrelated worker registrations are not adopted. Worker-update and acknowledgement waits are bounded.
- The startup component displays a reconnect/close-all-tabs warning if retirement cannot be confirmed. An offline old worker can otherwise repopulate its cache: deleting CacheStorage or unregistering alone is not a purge. Previously unregistered but still-controlling old tabs also require the warning/close-tabs path.

### Authentication integration

```ts
import { retireLegacyBrowserCache } from '@/lib/legacy-browser-cleanup';
const { reloadRequired } = await retireLegacyBrowserCache();
```

The auth owner must await this on logout/account switch and heed `reloadRequired` (reconnect, close all DietLedger tabs, then reopen before switching accounts). The startup component renders that warning for its own cleanup result. This slice does not edit authentication files or assert that the auth hook is integrated. Returning `reloadRequired: false` means the tested legacy control/cache retirement path completed, not that all origin storage was cleared.

## Reproducible isolated browser check

```sh
node scripts/security-browser/run.mjs
```

Requires existing Node.js 22, project dependencies and Chromium. `CHROMIUM_PATH` can select an already-installed executable; no browser/test dependency is installed or downloaded. The runner uses Vite to compile actual source and real html2canvas/html-to-image/jsPDF, replacing only the API boundary with synthetic records. It starts its own ephemeral loopback-only HTTP server and a new browser profile. Generated files/profile live under a fixture-owned repo-relative `.security-browser-*` directory and are removed afterward. `--keep-artifacts` retains synthetic artifacts for inspection; never stage them. Linux's short proc-cwd alias avoids Chromium's Unix-socket path-length limit without writing temporary files outside the fixture directory.

Only fixture bootstrap/module URLs may be requested during exports. CDP blocks foreign HTTP(S) traffic before transmission; attempted foreign requests still fail the test. Payload image/CSS URLs use fixture canaries, with a reserved example hostname for the rejected HTTPS-logo case. No real account, token, cookie, user browser profile, database, application service, Docker operation or external provider is involved.

### Browser coverage and results

Verified on Linux with **Chromium 159.0.8154.6**, html2canvas 1.4.1, html-to-image 1.11.13 and jsPDF 4.2.1:

| Area | Automated assertions / result |
|---|---|
| Cookbook cover/TOC/index/recipe/card | Literal book title/description, chapter/recipe names, ingredients/amounts/units, instructions, description/serving labels, brand/tagline and malformed colors/font/attribute inputs remain inert. |
| Custom nutrition | Published 992 total / 4 servings remains 248; source/sourceLabel text, `Vitamin D Not reported` and unknown-not-zero notices survive, including malicious missing-nutrient labels. |
| Nutrition report and dashboard | Hostile profile and report branding remain inert; dashboard profile/period/date/diet/allergen fields are independently checked in the **main document**, not inferred from an iframe test. DOM-element export uses safe synthetic text, not arbitrary caller-created active DOM. |
| Meal plans/groceries | Date/day/slot/entry/serving and grocery name/displayAmount/recipe-label fields remain literal text. |
| Logos/styles/positive presentation | Active schemes, HTML data, SVG data (plain/base64), attribute breakout and same-origin/HTTPS image URLs never load. Omission notices are present. Actual PNG/JPEG/GIF/WebP data logos render without omission warnings. Supported colors/font, 488 g milk, retained whole-egg units and original-unit notice survive. |
| Real renderers | **17 valid PDF blobs**, **30 nonblank final JPEG canvases**, **140 observed DOM documents/wrappers**, **0 executed script/event markers**, **0 active injected elements/attributes**, **0 unexpected export HTTP requests**. The real renderers are not mocked. A sampled recipe-canvas screenshot was inspected: raster branding, literal payload text, ingredient/instruction columns and nutrition label were visible. |
| Legacy-worker RED precondition | The historical install/activate/API/static caching implementation is served at `/sw.js`. A controlled tab caches synthetic account A and returns A offline, despite response `no-store`. |
| Active-control regression | Before the follow-up fix, unregister/delete cleanup was followed by an online read and then offline read: the already-controlled tab returned **synthetic-A again**. The verifier then failed because no reload-required result was provided. |
| Offline/update failure | With the worker update unavailable and the page offline, cleanup returns `reloadRequired: true`, retaining the registration's future supported update path. Component regression checks prove the close-tabs warning is rendered. |
| Upgrade/logout/account switch | Forced update replaces the historical worker with the actual current tombstone. Two previously controlled tabs are covered. A delayed in-flight legacy API response settles without recreating the retired cache **before any repeat cleanup**. Awaited cleanup at synthetic logout A / switch to B permits B online, then both old tabs fail offline rather than returning A or B. |
| Scope/fresh navigation | Unrelated CacheStorage marker and `/other/` registration survive. Fresh-install cleanup is harmless; fresh navigation after retirement has no root controller and no private offline fallback. No uncaught page exceptions were observed. |

The independent automated browser acceptance for this frontend slice is now satisfied; missing browser fixtures are no longer a blocker for UI-01/UI-02/UI-04 here. Authentication integration, actual release/deployment verification and independent merge review remain separate gates, not claims made by these fixtures.

## RED / GREEN and executable checks

- Initial cookbook regression was observed RED before encoding: injected cover/TOC/recipe/index DOM, SVG logo and style-attribute breakout. Initial cleanup test was RED because the utility did not exist. Additional families added after that fix are regression coverage, not separately observed pre-fix browser failures.
- Follow-up browser RED reproduced the real old-controller cache revival described above. New Vitest cases were observed RED for omitted-logo notices, absent startup warning, unbounded worker update, a mixed root registration incorrectly reporting success, and acknowledgement before activation/claim completion. Each is GREEN after its corresponding change.
- `node scripts/security-browser/run.mjs`: all export and worker stages passed against the final implementation.
- Focused export/worker/startup/branding tests: **5 files, 22 tests passed**.
- Final `npm test`: **63 files, 558 tests passed**, including the activation/ack race regression.
- `npx tsc --noEmit --pretty false`: passed.
- Targeted ESLint, including fixture scripts with `--no-ignore` because the repository normally ignores `scripts/**`: passed without warnings.
- Final full `npm run lint`: still fails on 21 pre-existing CommonJS `require` errors in `docs/GitHubPagesTemp/*.test.cjs` and two unrelated browser-script warnings. No unrelated cleanup was performed.

## Explicit limits

- These are independent synthetic browser fixtures, not the complete Next.js app, a live deployment, actual authentication/token lifecycle, or a saved user's browser. Synthetic account switching changes a fixture response and invokes the real cleanup utility. Gil's auth integration must be reviewed/tested separately.
- Chromium/Linux only; no Firefox, Safari, native Windows or mobile verification. The disposable browser uses its OS `--no-sandbox` test flag; the HTML iframe sandbox remains enabled and is asserted. This is not a production browser-launch recommendation.
- DOM/write observers inspect generated markup without sanitizing/modifying it. Canvas/PDF checks prove rendering and nonblank output, not pixel-perfect pagination, every viewport, every font or accessible PDF quality. The sampled screenshot is not a complete visual-regression baseline.
- The delayed-request case and two-tab takeover cover a concrete race, not every browser scheduling possibility. Offline/unresponsive updates or unknown registration transitions require the visible reconnect/close-tabs procedure. No forced reload, deletion of unrelated state, or claim of instantaneous revocation/purge of arbitrary already-open tabs is made.
- Supported data URLs are raster MIME/base64 allowlisted, not a new image-security decoder. Invalid/corrupted raster bytes may still fail image rendering; they do not gain HTML/script privileges. External/SVG branding intentionally requires replacement with an uploaded raster image and is no longer silently omitted.
- No production build, image, API cache-header change, provider transport test, dependency audit, live-stack test or all-vulnerabilities certification is implied.

## Font compatibility follow-up

Parent review identified that the initial bare-family allowlist rejected the template editor's actual font stacks, silently replacing shipped serif templates with system-ui. Acceptance: preserve every exact `FONT_OPTIONS` choice from `src/components/template-editor-panel.tsx` and the shipped template packs (inherit/system default, Arial/sans-serif, Georgia/serif, quoted Times New Roman/serif, quoted Courier New/monospace, Verdana/sans-serif), while retaining existing bare BrandKit font choices. HTML-attribute-encode allowed CSS quotes; do not accept arbitrary CSS. Test both recipe and index root styles, including malicious suffixes, attribute breakout and markup terminators. Verify focused RED/GREEN, broader tests/type/lint and existing browser fixtures. No font-picker or template data changes.

Evidence: the new parameterized regression run was RED for all five non-default editor stacks (system-default and malicious-input rejection already passed). After allowlisting the exact stacks and HTML-attribute-encoding their quotes, all 18 PDF tests passed, including six positive choices and three breakout cases checked on both recipe and index root styles. Final `npm test`: 63 files / 567 tests passed; typecheck, targeted ESLint and the existing full synthetic browser verifier passed. The browser verifier remains the previously documented export/worker coverage; the per-choice font-stack assertions use Vitest/DOM parsing, not a new visual font comparison.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/unregister
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker/postMessage
- https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim

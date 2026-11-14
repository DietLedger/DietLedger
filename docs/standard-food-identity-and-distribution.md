# Standard food identity and USDA distribution findings

Status: factual research and implementation recommendation for the approved recipe-package/preflight work. This is not legal advice and does not authorize publishing or redistributing a database.

## Scope and repository inventory

DietLedger currently imports four standard datasets, all from USDA FoodData Central (FDC):

| DietLedger key | USDA data type | Current repository importer |
| --- | --- | --- |
| `foundation` | Foundation Foods | `FoundationFoods` bulk JSON |
| `sr_legacy` (`srLegacy` in the browser catalog) | SR Legacy | `SRLegacyFoods` bulk JSON |
| `fndds` | Survey (FNDDS) | `SurveyFoods` bulk JSON |
| `branded` | USDA Global Branded Food Products Database | `BrandedFoods` bulk JSON |

The browser also lists a Full Download. That file combines all FDC data types and is an artifact choice, not a fifth DietLedger standard database.

The catalog is currently duplicated and inconsistent: `src/lib/usda-datasets.ts` and `sync-server/seed.go` name different current Foundation/Branded release artifacts, and the SR Legacy key is spelled differently. The authoritative-inventory phase must replace this duplicated release knowledge with one server-owned catalog before preflight relies on it.

## Canonical food identity finding

### Decision

Use the canonical food-record identity:

```text
usda:fdc:<fdcId>
```

for records from all four supported datasets.

An FDC ID is in one provider-wide FoodData Central food-record namespace. The API fetches a food from `/food/{fdcId}` and accepts FDC IDs across the supported data types. The bulk field description identifies `fdc_id` as the permanent food-table identifier. A dataset name or release must therefore not be added to the canonical food ID.

This identity has an important version semantic: USDA defines an FDC food record as the complete published information for a food item and assigns a new FDC ID when that record changes. Therefore:

- the same unchanged upstream record retains the same `usda:fdc:<fdcId>` across DietLedger installations and later bulk releases;
- a changed USDA record is a new canonical record identity, even when USDA links it to the same conceptual food/product lineage;
- DietLedger must not rewrite an old canonical identity to a newer FDC ID merely because an NDB number, food code, GTIN, name, or content resembles it;
- release and dataset provenance remain separate from food identity.

This satisfies package synchronization for the exact standard-food record that supplied the nutrition. It also prevents a later upstream revision from silently changing a recipe's referenced source facts.

### Dataset-specific findings

| Dataset | Canonical record identity | Upstream aliases/lineage | Why aliases are not the canonical record identity |
| --- | --- | --- | --- |
| Foundation Foods | `usda:fdc:<fdcId>` | NDB number where present; FDC source IDs for samples; optional upstream food lineage metadata | NDB identifies a food/form while a changed published record receives a new FDC ID. Sample/source IDs identify other food records, not the Foundation record used by the ingredient. |
| SR Legacy | `usda:fdc:<fdcId>` | NDB number | NDB is useful for legacy lookup and Foundation/SR connectivity, but the canonical transferred nutrition must identify the exact published FDC record. |
| Survey (FNDDS) | `usda:fdc:<fdcId>` | Eight-digit FNDDS food code plus release/cycle provenance | Food code identifies an FNDDS food for survey use; FNDDS releases follow NHANES cycles. It must not be treated as an unversioned substitute for the exact FDC record. |
| Branded Foods | `usda:fdc:<fdcId>` | GTIN/UPC, market country, publication/modified dates, and upstream history metadata | USDA explicitly documents duplicate GTIN/UPC values for product updates and gives updated records new publication history/FDC records. GTIN alone cannot identify an exact nutrition record. |

Aliases are lookup and provenance data. They must be typed and persisted separately from the canonical provider identity and from DietLedger's local `food_items.id`. Nutrient IDs such as 2048, 2047, and 1008 remain nutrient-definition identities and never participate in food identity.

### Required implementation consequences

1. Derive `usda:fdc:<positive fdcId>` deterministically during bulk import, live API caching, package export, package import, and preflight.
2. Enforce one local standard-food row per FDC ID; local integer row IDs may differ between installations.
3. Store dataset/data type, release, artifact URL or filename, checksum when available, import completion, and record counts as provenance/inventory—not as part of the canonical ID.
4. Preserve typed aliases and historical identifiers without using them to merge records automatically.
5. Test all four data types with the same FDC ID-to-canonical-ID function in separate disposable installations.
6. Treat a newer upstream record linked to an older product/food as an explicit update candidate, not the same exact record.

## Official identity sources

- FoodData Central Help defines an FDC ID as the number for each food data record and says: “Each time the data in a food record changes, that food item receives a new FDC_ID number.” It separately defines stable NDB numbers, FNDDS food codes, and GTINs: https://fdc.nal.usda.gov/help/
- The FDC API guide exposes `/food/{fdcId}` and `/foods` for FoodData Central food records across data types: https://fdc.nal.usda.gov/api-guide/
- USDA's download page provides JSON/CSV archives and the common field descriptions used across data types: https://fdc.nal.usda.gov/download-datasets/
- Foundation documentation says FDC IDs identify records across the data types and that new or updated versions receive an assigned FDC ID; static NDB numbers provide SR connectivity where appropriate: https://fdc.nal.usda.gov/Foundation_Foods_Documentation/
- Branded documentation says manufacturers may update products, historical versions remain viewable, and download snapshots lag monthly API updates: https://fdc.nal.usda.gov/GBFPD_Documentation/

## Distribution and licensing findings

### Findings common to all four datasets

FoodData Central's official site states:

- FDC data are in the public domain and not copyrighted;
- they are published under CC0 1.0 Universal;
- no permission is needed for use;
- USDA requests that users identify FoodData Central as the source and, when possible, notify USDA of products using the data.

The API guide repeats the same public-domain/CC0 statement. Data.gov catalogs FoodData Central as public and uses the U.S. Public Domain label. Federal open-license guidance says an open license must allow reuse, modification/derivative works, redistribution, and commercial or non-commercial use without royalties.

Official sources:

- FDC licensing and suggested citation: https://fdc.nal.usda.gov/
- FDC API licensing and API limits: https://fdc.nal.usda.gov/api-guide/
- Data.gov FoodData Central catalog/public-domain metadata: https://catalog.data.gov/dataset/fooddata-central
- Federal open-license guidance: https://resources.data.gov/open-licenses/
- CC0 legal tool linked by USDA: https://creativecommons.org/publicdomain/zero/1.0/

### Dataset-by-dataset assessment

#### Foundation Foods

- **Owner/source:** USDA Agricultural Research Service; analytical and supporting metadata may also originate with USDA units or external organizations.
- **Status:** covered by FDC's public-domain/CC0 statement.
- **Redistribution/modification:** permitted by the published status; additive identity/provenance metadata is allowed.
- **Attribution/notices:** attribution is requested, not stated as a condition. Preserve the dataset name, release, source URL, and suggested citation.
- **Trademark/endorsement:** Foundation documentation says product/trade-name references do not imply USDA recommendation, endorsement, approval, or association. DietLedger must not use USDA marks or wording that implies endorsement.
- **Update obligation:** none stated as a license condition. DietLedger must identify the snapshot date so users are not misled about currency.

#### SR Legacy

- **Owner/source:** USDA; values were compiled from analyses, calculations, literature, and other sources.
- **Status:** included in FDC and covered by the same public-domain/CC0 statement.
- **Redistribution/modification:** permitted. SR Legacy is a final data type and is not expected to receive ordinary new releases, though USDA has corrected archive packaging/data issues.
- **Attribution/notices:** preserve FDC/SR Legacy provenance and citation.
- **Risk:** low copyright risk under the official publication statement; do not imply that DietLedger's transformed subset is an official USDA release.

#### Survey (FNDDS)

- **Owner/source:** USDA, derived from Foundation/SR data for What We Eat in America/NHANES analyses.
- **Status:** distributed as an FDC data type under the common public-domain/CC0 statement.
- **Redistribution/modification:** permitted.
- **Attribution/notices:** preserve FNDDS cycle/release and FDC source citation.
- **Update obligation:** none stated as a license condition, but releases correspond to survey cycles. A redistributed snapshot must state its exact cycle/release.

#### Branded Foods

- **Owner/source:** USDA hosts and standardizes data supplied through a public-private partnership. Food-industry data providers remain responsible for submitted descriptions, nutrient values, serving sizes, and ingredients.
- **Status:** USDA's FDC-wide public-domain/CC0 statement expressly covers FoodData Central data, while the Branded documentation describes the goal as open sharing and makes the database downloadable.
- **Redistribution/modification:** the published FDC terms permit it. DietLedger may normalize/store the data and may redistribute a snapshot under those terms.
- **Attribution/notices:** preserve FDC/Branded provenance, release date, and USDA's suggested citation. Preserve data-provider attribution fields such as `data_source` where distributed.
- **Trademark/endorsement:** brand names, product names, and GTINs identify commercial products. Their presence does not grant a right to use logos or imply sponsorship. Include a no-endorsement notice consistent with USDA's statement: mention of trade names/products/companies is informational and does not imply USDA or DietLedger endorsement.
- **Third-party risk:** the official FDC license is strong evidence for redistribution of the published database fields, but it does not adjudicate every separate trademark, packaging image, or external linked asset. DietLedger should redistribute only fields in the official FDC bulk archive, not scrape product images or external proprietary material.
- **Currency:** online/API branded data update monthly while bulk downloads are generally generated twice yearly. A mirror must disclose its snapshot date and must not present itself as current live USDA data.

Official Branded source: https://fdc.nal.usda.gov/GBFPD_Documentation/

## Risk summary

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Copyright/database redistribution | Low based on USDA's explicit public-domain and CC0 publication | Retain source/release metadata and citation; distribute only official FDC fields/artifacts. |
| Creating an additive/modified database | Low copyright risk, but users could mistake it for an official USDA release | Keep DietLedger metadata in a sidecar or clearly separate columns; label it as DietLedger metadata and identify the untouched upstream snapshot. |
| Trademark or implied endorsement | Moderate for Branded Foods if product/USDA marks are used in marketing | Do not distribute logos; use names only as data identifiers; include no-endorsement language; do not brand the package as USDA-approved. |
| Third-party branded content | Low-to-moderate residual legal uncertainty despite FDC's blanket publication statement | Limit redistribution to official bulk fields; preserve provider/provenance fields; obtain counsel before a public commercial bulk mirror if risk tolerance is low. |
| Stale or partial snapshots | Product/correctness risk, not principally license risk | Publish exact release/artifact/checksum/count/completion state; never certify cached live rows as a complete dataset. |
| API terms confused with bulk rights | Operational risk | Use bulk archives for installation/mirroring; API keys and rate limits govern API access, while the data licensing statement remains public-domain/CC0. |

## Recommended low-risk architecture

### Recommendation

Prefer an **installer that downloads the official bulk artifact directly from USDA**, plus a small DietLedger-owned manifest/sidecar containing:

- canonical dataset identity;
- upstream release/version and URL;
- artifact checksum and expected completeness signal when available;
- DietLedger importer/schema version;
- imported record count and completed/failed state;
- canonical identity rule (`usda:fdc:<fdcId>`);
- typed legacy aliases actually present in the source;
- required citation and no-endorsement notice.

Reasons:

1. FDC already supplies a global canonical record ID, so DietLedger does not need to assign a second standard-food ID.
2. Direct download avoids the bandwidth, staleness, and release-monitoring burden of a DietLedger mirror.
3. A sidecar keeps DietLedger metadata clearly separate from the official artifact and makes it easy to prove which upstream snapshot was installed.
4. It minimizes trademark/endorsement confusion and retains official documentation/metadata unchanged.

### Acceptable fallback

If reliability later requires DietLedger-hosted snapshots, hosting the **unmodified official archive plus a separate DietLedger manifest** is lower risk and simpler to audit than repacking the database. Preserve the original filename/archive contents, source URL, release, citation, and notices. Verify checksums and make clear that DietLedger is a mirror, not USDA and not endorsed by USDA.

### Not recommended initially

Do not begin with a modified/additive redistributed database containing DietLedger IDs inside USDA rows. It is legally plausible under CC0/public-domain status, but it adds no identity value because FDC IDs already solve the cross-installation record problem. It also increases provenance confusion, artifact size, update work, and the chance users mistake DietLedger transformations for USDA data.

## Matters for legal counsel before public distribution

Counsel is not required to continue implementing canonical IDs, inventory, direct USDA installation, or private/local use. Obtain legal advice before launching a public DietLedger-hosted commercial bulk mirror if any of these apply:

- DietLedger plans to redistribute product images, logos, packaging, or external fields not contained in the official FDC archive;
- marketing could imply USDA, GS1, 1WorldSync, Euromonitor, manufacturer, or retailer sponsorship;
- DietLedger wants contractual assurances beyond USDA's public-domain/CC0 statement for third-party Branded fields;
- DietLedger plans to rename or materially transform a dataset while presenting it as an official USDA release;
- distribution will occur in jurisdictions where database rights or trademark treatment creates material business risk.

No database redistribution or publication is part of the current implementation task.

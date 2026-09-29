# Source Analysis — Seoudi Product Content Operations

_Analyst: PIM build team · Date: 2026-09-29 · Inputs: `source-files/Creation.xlsx` (preserved, unmodified copy of the uploaded original)_

## 1. Sources

| Source | Status | Notes |
|---|---|---|
| `Creation.xlsx` | **Analyzed** | 4.5 MB workbook, **301 worksheets**, ~8,100 non-empty product rows, **2,626 distinct SKUs**, batches dated 15-Jun-2026 → 30-Sep-2026. |
| `Product Content Creation Playbook.pptx` (SharePoint, personal OneDrive of the content lead) | **Not accessible** | The build environment's egress proxy rejects `seoudisupermarket-my.sharepoint.com` (HTTP 403, organization network policy) and the file requires a Seoudi Microsoft 365 login. The workflow below is therefore **inferred from the workbook** and from the stage list in the product brief. See §9 for what should be re-validated once the Playbook is reviewed. |

## 2. What the workbook actually is

`Creation.xlsx` is not a master data file. It is a **log of Magento CSV import batches** built by hand by the e‑commerce content team. Each working day (or campaign) produces a *triplet* of sheets:

| Sheet pattern | Examples | Purpose |
|---|---|---|
| `<date> ar` | `15-6-2026 ar`, `22.9ar`, `faddan.ar`, `back to school 2 ar` | Magento import rows for the **Arabic store view** (`store_view_code = ar_EG`). |
| `<date> en` | `15-6-2026 en`, `22.9en`, `v7 en` | Magento import rows for the **default/English store view** (`store_view_code = default`). |
| `<date> cat` | `15-6-2026 cat`, `22.9cat`, `leafletcat` | Category-assignment import: `sku, product_online, categories` (80 sheets share this exact header). |
| `urlkey*`, `url3` | `urlkey`, `urlkey2`, `urlkey16` | URL-key correction imports. |
| `SheetNNN` | `Sheet177`, `Sheet258` | Working/scratch sheets: raw RMS name + drafts, visibility fixes, brand fixes. Some are empty (`Sheet304`, `Sheet223`, `Sheet313`) or contain a single stray title (`Sheet273`). |
| Named campaigns | `back to school*`, `leaflet*`, `waterkind`, `توتشي`, `ناتشو`, `raslan cat`, `v7 bundle`, `faddan.*` | Campaign / supplier-driven creation waves. |
| `email` | `sku, name` | List of SKUs to communicate to another team (hand-off by email). |

**105 different header layouts** exist across the 301 sheets for what is essentially the same Magento import schema — column order changes daily, columns are sometimes duplicated (`volume_or_weight` ×2, `meta_title` ×2), misspelt (`ame` instead of `name`), or renamed (`url` instead of `url_key`). This is the core operational pain the PIM must remove.

### 2.1 Canonical column set (union of all layouts)

| Column | Observed values / type | Meaning |
|---|---|---|
| `sku` | Numeric; stored as float in 78% of rows (`6221236068099.0`) | Business key. Mostly EAN‑13 barcodes; 582 rows use short internal codes (`135438`, `1605465`) for weighed/fresh or house items; 346 rows start with `0` (UPC‑A, e.g. `028400032520`) — leading zeros are lost whenever Excel treats the SKU as a number. |
| `Rms` | Arabic free text (only 102 rows) | **Raw RMS item description** — abbreviated, no spaces before units: `بيك رولز كاتشب 110جم`, `جلاف ايليت جوانتى ابيض 50ق`. This is the RMS "truth" that content is created from. |
| `name` | Text | Product title **in the language of the row's store view** (Arabic for `ar_EG`, English for `default`). |
| `localized_name` | Text | The *other* language title, kept on the row as a helper/cross-check. Not a Magento core column. |
| `store_view_code` | `default` (2,430), `ar_EG` (2,479), `defualt` (10 — typo) | Magento store view. |
| `product_type` | `simple` (100%) | Magento product type. |
| `attribute_set_code` | `Default` (100%) | Magento attribute set — no specialisation used yet. |
| `visibility` | `Search` (3,986), `Catalog, Search` (896), `Not Visible Individually` (34) | Magento visibility. |
| `product_online` | `1` (7,869), `2` (52) | Magento status: 1 = enabled, 2 = disabled. |
| `weight` | Decimal kg: `0.25`, `0.5`, `0.33` … | Magento physical weight (kg). |
| `volume_or_weight` | 603 distinct values: `1 Piece`/`1 قطعة` (2,177), `330 ml`/`330 مل`, `250 g`/`250 جم`, `Pack of 12`/`عبوة من 12`, `Set of 3`/`طقم من 3`, `12 Colors`/`12 لون`, `10 Capsules`, `2 - 3 g`, `700 + 700 g`… | Customer-facing size/pack text; one per store view (Arabic units in `ar_EG`). |
| `related_skus`, `crosssell_skus`, `upsell_skus` | Comma-separated SKU lists, usually same list in all three | Merchandising links (typically same brand/line). |
| `additional_attributes` | Only `product_brand_id=<Brand>` (2,879 rows; 268 distinct brands) | Brand is carried as a Magento additional attribute (by label). |
| `categories` | `Default Category/A|Default Category/A/B|…` | Full category paths, `|` separated, every ancestor listed. |
| `meta_title` | `<Title> | Seoudi Supermarket` / `<العنوان> | سعودي سوبرماركت` | SEO title = product title + store suffix. |
| `url_key` / `url` | `mintra-swimming-towel-175-x-110-cm-rose` | Slug of the English title, shared by both store views. |

No column exists for descriptions, images, meta descriptions, owner, dates, status or QC — **all workflow state lives outside the workbook** (sheet names act as the batch date; e‑mail/Teams presumably carry hand-offs).

## 3. Current process (as evidenced by the workbook)

1. **RMS creation** – Procurement/master-data creates the item in RMS. RMS gives SKU/barcode and an abbreviated Arabic description (`Rms` column).
2. **Content creation** – A content creator rewrites the RMS name into a structured bilingual title: `Brand + Product type + Variant/Flavor[, Dimension/Spec] - Size` (e.g. `بى ناتشرل عسل فلفل حار 450 جم` → `B Natural Hot Pepper Honey - 450 g` / `بى ناتشورال عسل فلفل حار - 450 جم`). Brand, `volume_or_weight`, weight, visibility, related SKUs are filled in the same sheet.
3. **Magento file preparation** – The same data is split into an `ar` sheet (`ar_EG`), an `en` sheet (`default`) and a `cat` sheet; `meta_title` and `url_key` are derived from the English title.
4. **Magento import** – Sheets are exported as CSV and imported. Follow-up fix sheets (`urlkey*`, visibility-only sheets such as `Sheet21`, brand-only sheets such as `raslan cat`, `ناتشو`) show that corrections are re-imported as partial files.
5. **Images** – `import images 28.7` indicates a separate image-import step; image status is otherwise untracked.
6. **Go-live / review** – `product_online` and `visibility` flips indicate products are enabled after the content is complete; there is no recorded final review.

## 4. Data-quality findings (evidence for PIM rules)

| # | Finding | Evidence | PIM response |
|---|---|---|---|
| 1 | SKUs stored as floats; leading zeros lost | 6,327 float SKUs; 346 leading-zero SKUs | SKU is a **string**; importer normalises `x.0` and warns on 11/12-digit numerics that may have lost a leading zero. |
| 2 | SKU lists corrupted by Excel scientific notation | `7.33900140498073e+210` in 185 related/cross/upsell cells | Import validation **ERROR** on `e+` in SKU lists; lists stored as arrays. |
| 3 | Trailing commas in SKU lists | Most related-SKU cells end in `,` | Normalised on import/export. |
| 4 | Store view typo | `defualt` ×10 | Validation against a configured store-view list. |
| 5 | Volume converted to physical weight | 517 rows where `volume_or_weight` is ml/L **and** `weight` is set (e.g. `330 ml` → `0.33`) | Unit engine never derives kg from a volume; QC rule `WEIGHT_FROM_VOLUME` flags weight = litres as NEEDS_REVIEW. |
| 6 | Weight set for piece-counted items | 66 rows (`1 Piece` with a weight) | Allowed (manual physical weight) but not auto-derived. |
| 7 | Meta titles over SEO length | 1,765 meta titles > 60 chars | Configurable `META_TITLE_LENGTH` rule (WARNING). |
| 8 | Language mismatch in meta title | 80 `ar_EG` rows with English meta title; 39 `default` rows with Arabic meta title | `LANGUAGE_MISMATCH` rule per field/locale. |
| 9 | URL keys with upper case / bad characters / inconsistent style | 165 upper-case (`Nagel-Fish-Large`), 9 with illegal characters, `184.2-g` vs `2-1-liter` | URL keys generated by one slugger; duplicates warned, never auto-overwritten. |
| 10 | Same SKU re-created with different names | 24 SKU/store-view pairs with conflicting names across batches | RMS/Magento snapshots + comparison view; re-import never overwrites content. |
| 11 | Duplicated/misspelt/renamed headers | `volume_or_weight`×2, `meta_title`×2, `ame`, `url` vs `url_key` | Import wizard with header auto-detection + aliases + manual mapping. |
| 12 | Unit spellings vary | `g`/`جم`/`حم`(typo)/`g` without space (`#g`), `Liter`/`Liters`/`L`/`لتر`, `Piece`/`piece`/`Pieces`, `عبوه`/`عبوة` | `UNIT_FORMAT` rule with canonical unit dictionary (EN+AR). |
| 13 | Pack/multi-pack expressions | `Pack of 12`, `عبوة من 5+1`, `700 + 700 g`, `3 x 100 ml`, `2 - 3 g`, `قطعتين` (dual form) | Pack parser supports `N x Q`, `A+B`, `Pack/Set of N`, Arabic dual. |
| 14 | Taxonomy inconsistencies | 329 distinct paths; parallel trees `Home, Kitchen & Garden` vs `Home & Kitchen & Garden`; leading spaces (`/ Skin Care`); repeated root inside path (`…/Oral Care/Default Category/…`); `,` used instead of `|` in some rows; `Beauty and Personal Care/Beauty and Personal Care` | Managed taxonomy tree with Magento IDs; imports map paths to nodes and report unknown/malformed paths. |
| 15 | Brand only as free text label | `product_brand_id=Mintra`; near-duplicates (`Home`, `Kitchen`, `White` used as brands) | Brand master table; brand required by completeness; QC `MISSING_BRAND` checks title starts with brand. |
| 16 | `product_type`/`attribute_set_code` never vary | 100% `simple` / `Default` | Kept as configurable Magento fields; PIM attribute sets are internal and map to Magento `attribute_set_code`. |

## 5. Field classification

**Important (source of truth in the PIM):** `sku`, barcode, RMS name, brand, English title, Arabic title, size/pack (`volume_or_weight` per locale), physical weight (kg), primary category + additional categories, visibility, product_online, url_key, meta titles, related/cross-sell/upsell SKUs, images.

**Redundant / derived (generated at export, not typed by hand):**
- `localized_name` — derived from the other-language title.
- `meta_title` — default template `{title} | Seoudi Supermarket` / `{title} | سعودي سوبرماركت`, overridable.
- `url_key` — slug of the English title, overridable, uniqueness-checked.
- `store_view_code` — determined by the export profile (default vs `ar_EG`).
- Ancestor category paths in `categories` — generated from the leaf node(s).
- `additional_attributes` — built from brand + attribute values flagged "export as additional attribute".
- Duplicate copies of `volume_or_weight`/`meta_title` columns — replaced by per-locale fields.

**Missing from the source but required by the brief:** descriptions (AR/EN), meta descriptions, images, owners, due dates, priority, campaign, workflow status, QC results, comments, audit trail. These are native PIM entities.

## 6. Normalized model (implemented in `prisma/schema.prisma`)

```
User ─┬─< Session
      └─< (assignments, comments, audit, QC reviews)
Brand ─< Product >─ Category (primary) ;  Product >─< Category (ProductCategory: additional)
Product ─< ProductAttributeValue >─ AttributeDefinition ─< AttributeSetItem >─ AttributeSet
Category ─< CategoryAttribute >─ AttributeDefinition   (category-specific required/optional)
Product ─< ProductImage
Product ─< RmsSnapshot (hash per import)  ;  Product ─< MagentoSnapshot (per store view)
Product ─< Comment (field-level, threaded, resolvable) ─< Mention
Product ─< QcReview ; Product ─< QcFlag (field flags / suspected)
AuditLog (entity, field, old, new, actor, source, reason)
ImportBatch ─< ImportRow            ExportProfile            SavedView
WorkflowTransitionRule (configurable)  QcRule (configurable)  CompletenessRule (configurable)  Setting
```

Key decisions:
- **SKU is the business identifier** (unique, string). Internal `id` (cuid) is the technical key.
- **Fixed core columns** for fields every product has and that Magento consumes (titles, size text, weight, SEO, visibility…).
- **EAV for everything else** (`AttributeDefinition` with types TEXT, NUMBER, DROPDOWN, MULTISELECT, BOOLEAN, DATE; `AttributeSet` + per-category requirements). New attributes (e.g. `shade_number`, `skin_type`, `wattage`) are configuration, not migrations.
- **Size is stored structured** (`sizeKind`, `sizeValue`, `sizeUnit`, `packCount`) and rendered to the customer text per locale; physical weight (kg) is a separate field.
- **Snapshots, not overwrites**: every RMS import stores a hashed RMS snapshot; Magento-side values can be captured as Magento snapshots. Comparison states: SAME / CHANGED / MISSING / CONFLICT.

## 7. Workflow stages (inferred)

```
NEW_IN_RMS → RMS_QA → READY_FOR_CONTENT → CONTENT_IN_PROGRESS → AWAITING_IMAGES → READY_FOR_QC
  → QC_IN_PROGRESS → QC_APPROVED → READY_FOR_MAGENTO → MAGENTO_LINKED → LIVE → FINAL_REVIEW → COMPLETED
Exceptions: QC_REJECTED, NEEDS_EDIT, BLOCKED, MISSING_DATA, MISSING_IMAGES, PROCUREMENT_FOLLOW_UP
```

| Stage | Owner role | Exit validation (default, configurable) |
|---|---|---|
| NEW_IN_RMS | E‑commerce specialist | — |
| RMS_QA | E‑commerce specialist | SKU, RMS name present; barcode check digit valid (warning) |
| READY_FOR_CONTENT | Content creator | Brand + category assigned |
| CONTENT_IN_PROGRESS | Content creator | Content-stage completeness = 100% |
| AWAITING_IMAGES | Content creator / studio | Main image READY/AVAILABLE |
| READY_FOR_QC → QC_IN_PROGRESS | Content quality | QC rules evaluated |
| QC_APPROVED | Content quality | No QC ERROR, no open field flags |
| READY_FOR_MAGENTO | E‑commerce specialist | Magento-stage completeness = 100% (url_key, meta titles, visibility…) |
| MAGENTO_LINKED | E‑commerce specialist | Exported / linked to Magento |
| LIVE → FINAL_REVIEW → COMPLETED | E‑commerce / QC | Final review sign-off |

Rejections require a reason and return the item to `QC_REJECTED` / `NEEDS_EDIT` with field-level flags. `BLOCKED` stores the previous status so the item resumes where it stopped.

## 8. Configurable (no code change needed)

- Workflow transitions: allowed roles, required validations, reason-required, active flag.
- QC rules: severity, parameters (max lengths, title pattern, suffixes, allowed Latin tokens), active flag.
- Completeness requirements per workflow stage, per attribute set and per category.
- Attribute definitions, dropdown options, attribute sets, category requirements.
- Taxonomy (with Magento category IDs), brand master.
- Export profiles (columns, store view, meta-title suffix, category separator).
- Store views list, meta-title suffixes, default visibility.

## 9. Assumptions & limitations

1. **Playbook not reviewed** (inaccessible). Title convention `Brand Type Variant[, Spec] - Size` and suffixes `| Seoudi Supermarket` / `| سعودي سوبرماركت` are inferred from ~2,300 created titles. Stage owners and SLAs are assumptions; the Playbook should be used to tune QC rules and transition validations (all configurable).
2. RMS integration is **file-based** (XLSX/CSV import) for the MVP; no live RMS/Magento API.
3. The workbook holds no descriptions or images; demo data for those is generated/placeholder and clearly marked.
4. Magento category IDs are not in the source; the taxonomy stores an optional `magentoId` to be filled by the team. Exports use category **paths**, which is what the workbook uses.
5. `product_online = 2` is interpreted as "disabled"; `visibility` defaults to `Catalog, Search`.
6. Physical weight for liquids requires a manual (or future density-based) entry; the PIM never converts volume to weight automatically, even though the historical sheets did.
7. Seed data uses a sample (~180 SKUs) of real product titles/brands from the workbook — public retail catalogue content, no personal data. Employee names found in sheet names are **not** used anywhere; users are role-based demo accounts.
8. Source file limitations: many sheets are partial fix-ups, empty, or scratch; the latest batch for a SKU is not reliably identifiable (sheet names are not strictly dated), so the demo seeding takes the first complete bilingual record per SKU.

# Architecture

## Layers

```
Browser ──► Next.js App Router
             ├─ Server Components (pages)          read via Prisma, render dense tables
             ├─ Client Components (forms, tables)  call Server Actions, router.refresh()
             ├─ Server Actions  src/app/actions/*  requirePermission() → service → audit
             └─ Route handlers  src/app/api/*      CSV export, import report, health
                     │
             src/lib/server/*   product service (update/transition/recompute), imports, exports, queries, auth
                     │
             src/lib/domain/*   PURE rules – no I/O, fully unit-tested
                     │
             Prisma ──► PostgreSQL
```

The **domain layer** holds every business rule (units, QC, workflow, completeness, import classification, Magento rows, comparison, RBAC). Server code only loads configuration/data, calls these functions and persists results, so the rules are testable in isolation (`tests/`).

## Product record

- `Product.sku` is the unique business key; `id` (cuid) is technical.
- Core, Magento-consumed fields are columns (titles, size text per locale, `weightKg`, SEO, visibility, product_online, related/cross-sell/up-sell SKU arrays).
- Structured size (`sizeKind`, `sizeValue`, `sizeUnit`, `packCount`, `packExpression`) is derived from the size text on every save.
- Everything else is **EAV**: `AttributeDefinition` → `AttributeSet`/`AttributeSetItem` (required/optional) → `CategoryAttribute` (category-specific) → `ProductAttributeValue` (typed value columns + locale).
- Derived/cached per product: `completeness`, `missingFields[]`, `qcOutcome`, `qcScore`, `qcIssues` (JSON) – recalculated on every change (`recompute()`), and in bulk from Settings or `npm run db:recompute`.

## Workflow

`WorkflowTransitionRule` rows define `from → to`, allowed roles, validation codes and whether a reason is required. `evaluateTransition()` refuses anything not declared (no arbitrary jumps), then checks role, reason and validations. Validation results are computed from the live record (`evaluate()`):

| Code | Meaning |
|---|---|
| HAS_RMS_DATA | SKU and RMS name or a title |
| RMS_COMPLETE / CONTENT_COMPLETE / MAGENTO_COMPLETE | all required fields up to that stage are filled |
| IMAGES_READY | main image READY/AVAILABLE with URL |
| QC_EVALUATED / QC_NO_ERRORS / NO_OPEN_FLAGS | automated QC ran, no ERROR, no open field flags |
| URL_KEY_UNIQUE | URL key present and not used by another SKU |
| MAGENTO_LINKED | Magento ID recorded or an export was recorded as snapshot |

`* → BLOCKED` stores `previousStatus`; `BLOCKED → @previous` resumes.

## Completeness

`CompletenessRule(stage, fieldKey, categoryId?, attributeSetId?)` + required attributes from the product's attribute set and category lineage. Stages are cumulative: RMS → CONTENT → QC → MAGENTO → LIVE. `weightKg` only applies when the size is a weight (volumes are never forced into weight).

## Re-import safety

For each incoming field the importer compares the **incoming value**, the **current PIM value** and the **previous snapshot** of the same source:

| State | When | Applied? |
|---|---|---|
| SAME | equal | – |
| FILL | PIM empty | yes |
| RMS_UPDATE | RMS-owned field (barcode, RMS name/brand/category) changed | yes + new RMS snapshot |
| APPLY | PIM value still equals the previous import (untouched) or explicit OVERWRITE mode | yes |
| CONFLICT | PIM value was edited by the team | **no** – reported in preview and CSV report |

Snapshots are append-only (`RmsSnapshot`, `MagentoSnapshot`), which also powers the RMS / PIM / Magento comparison (SAME / CHANGED / MISSING / CONFLICT).

## Audit

`audit()` writes one row per changed field (actor, entity, field, old, new, source, reason). Comments and QC flags are resolved, never deleted. Categories are deactivated, never deleted. Duplicates are reported, never merged or removed automatically.

## Security

- Sessions: random 32-byte token in an httpOnly, SameSite=Lax cookie (Secure when `COOKIE_SECURE=true`); only its SHA-256 is stored; configurable TTL; sessions revoked on password/role/deactivation changes.
- Passwords: bcrypt (cost 10); login throttling per email+IP.
- Authorization: middleware only checks cookie presence; **every** page, server action and API route re-validates the session and checks `can(role, permission)`; field-level edit permissions via `canEditField`.
- Server Actions include Next.js origin checks (CSRF protection). Upload size and type are validated; uploaded files are stored outside the web root (`UPLOAD_DIR`).

# Seoudi PIM – Product Information Management & Content Operations

Internal web application for Seoudi Supermarket's e-commerce content team. One central **Product Record per SKU** covering identity, bilingual (Arabic/English) content, size & weight, taxonomy, dynamic attributes, images, SEO, Magento data, workflow, QC, assignments, comments and a complete change history — managing the flow:

```
RMS → Product intake → Content creation → Images → Content QC → Magento preparation → Magento → Live → Final review
```

> Built from an analysis of the team's real working file (`source-files/Creation.xlsx`, 301 sheets of Magento import batches). Read [`docs/SOURCE_ANALYSIS.md`](docs/SOURCE_ANALYSIS.md) first — it explains the current process, data-quality problems found and every assumption. The *Product Content Creation Playbook* (SharePoint) was not reachable from the build environment; see §9 of the analysis.

## Features

| Area | What you get |
|---|---|
| **Products workspace** | Dense table, partial-match search (SKU, barcode, EN/AR title, RMS name, brand, URL key), filters (status, category subtree, brand, owner, QC, images, priority, campaign, missing data, overdue, date ranges), sorting, pagination, column visibility, **server-side saved views** (15 standard + personal/shared), bulk assign / QC reviewer / validated status change / category / priority / due date / campaign / image status / export. |
| **Product detail** | Tabs: Overview, English, Arabic (RTL), Specifications (parsed size, weight rules), Taxonomy (primary + additional categories, attribute set), dynamic Attributes, SEO & Magento, RMS / PIM / Magento comparison, QC reviews, full History. Right panel: workflow transitions with live validation blockers, QC flags, completeness by stage, automated QC findings, images, people, threaded field-level comments with @mentions and resolve/reopen (history kept). RMS vs current value shown and highlighted per field. |
| **Workflow** | 19-state machine (13 main + 6 exception states). Transitions, allowed roles, validations and "reason required" are **configurable data** (Settings). No arbitrary jumps; Block → resume to previous status. |
| **Completeness** | Computed from required fields per **workflow stage** (cumulative), **attribute set** and **category** (incl. ancestors). Weight is only required for weight-based sizes. |
| **QC** | 17 configurable automated rules (severity + JSON parameters): title structure & length, SEO length & suffix, missing brand/type/size, size consistency EN↔AR↔titles, weight validation (never volume→weight), duplicates & near-duplicates, repeated words, punctuation, unit format, language mismatch (brand/model/shade/code tokens allowed), URL key format, GTIN check digit, RMS size match. Outcomes PASS / WARNING / ERROR / NEEDS_REVIEW + score. |
| **QC queue** | RMS vs created content side-by-side, fields changed since submission, automated findings per field, checklist, field flags (incl. *suspected*), approve / reject / request edit with mandatory precise feedback, assign back, next-in-queue. |
| **Units engine** | EN + AR units and Arabic-Indic digits: `500 g → 0.5 kg`, `1 kg → 1`, `1 L` stays volume, packs `10 pieces x 250 g`, `250 g x 10`, `700+700 g`, `5+1`, `Pack of 12`, `عبوة من 12`, Arabic dual `قطعتين`, ranges, dimensions. |
| **Taxonomy** | Tree with create / rename (EN+AR) / move (subtree paths rebuilt) / deactivate / Magento ID / attribute set / history. |
| **Attributes** | Definitions (TEXT, NUMBER, DROPDOWN, MULTISELECT, BOOLEAN, DATE; localized; validation; Magento code), attribute-set matrix (required/optional), category-specific rules. |
| **Images** | NOT_REQUESTED → REQUESTED → IN_PHOTOGRAPHY → AVAILABLE/REJECTED/MISSING → READY, main + additional images by URL, thumbnails, bulk status. |
| **Imports** | XLSX/CSV wizard: upload → sheet picker → auto-detected mapping (aliases, duplicate columns, EN/AR routed by script) → validation preview (errors, warnings, per-field diff) → import → downloadable error/conflict report. Re-imports classify each field as FILL / APPLY / RMS_UPDATE / CONFLICT against the current record and the previous snapshot — **edited content is never overwritten** (explicit, audited overwrite mode available). |
| **Exports** | Configurable column profiles: Magento default/English, Magento `ar_EG`/Arabic, category assignment, URL-key fix, bilingual review sheet. Preview + warnings; optional "record as Magento snapshot" for drift detection. |
| **Comparison** | RMS vs PIM vs Magento per field with SAME / CHANGED / MISSING / CONFLICT, per product and across the catalogue. |
| **Dashboard / Today** | KPI cards, pipeline with ageing & overdue per status, QC findings by rule, completeness distribution, owner workload, image status, most-missing fields, overdue list, recent activity; Today control center (due today, overdue, urgent, waiting on QC, rework, blocked, ready for Magento, unassigned). |
| **Audit** | Every change: actor, timestamp, entity, field, old/new value, source (UI, IMPORT, BULK, WORKFLOW, QC, EXPORT, SYSTEM) and reason. |
| **Security** | DB-backed sessions (random 256-bit token, SHA-256 stored, httpOnly/SameSite cookie), bcrypt passwords, login throttling, RBAC on every server action and route, role-based field permissions. No business data in localStorage. |

## Roles

`ADMIN`, `ECOMMERCE_SPECIALIST`, `CONTENT_CREATOR`, `CONTENT_QUALITY`, `VIEWER` — permissions are attached to roles only (see *Users → Permission matrix*). Demo accounts (password `Seoudi@2026`):

| Email | Role |
|---|---|
| admin@seoudi.local | Admin |
| ecom@seoudi.local | E-commerce Specialist |
| creator1@seoudi.local, creator2@seoudi.local | Content Creator |
| quality@seoudi.local | Content Quality |
| viewer@seoudi.local | Viewer |

## Tech stack

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript · Tailwind CSS v4 · shadcn/ui-style components on Radix primitives · Prisma 6 · PostgreSQL 16 · ExcelJS / PapaParse · Vitest.

## Getting started

Prerequisites: Node 20+ (22 recommended) and PostgreSQL 14+ (or Docker).

```bash
cd seoudi-pim
cp .env.example .env                  # adjust DATABASE_URL if needed
docker compose up -d db               # or use your own PostgreSQL
npm install
npx prisma migrate deploy             # create schema
npm run db:seed                       # demo data from Creation.xlsx + recompute QC/completeness
npm run dev                           # http://localhost:3000
```

Full stack in Docker:

```bash
docker compose --profile app up -d --build
docker compose run --rm app npx tsx prisma/seed.ts   # optional demo data
docker compose run --rm app npm run db:recompute
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / start |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `tsc --noEmit` · Vitest unit tests |
| `npm run check` | lint + typecheck + tests |
| `npm run db:migrate` | create a new migration during development |
| `npm run db:deploy` | apply migrations |
| `npm run db:seed` | reset demo data and recompute |
| `npm run db:recompute` | recalculate completeness & QC for all products (also available in *Settings*) |

### Try it

1. **Imports → New import**, type *Magento sheet*, upload `source-files/Creation.xlsx`, pick e.g. `Sheet177` (has the raw RMS column) → mapping is detected automatically → *Validate & preview* → *Import*. Existing SKUs show FILL / CONFLICT per field; download the conflict report.
2. **QC Queue** as `quality@…` → open an item → flag a field / reject with feedback → the creator sees it in *My Tasks* and on the product.
3. **Products** as `creator1@…` → *My products* view → edit a title → the workflow panel shows exactly what blocks *Submit to QC*.
4. **Exports** → *Magento – ar_EG store view* → download the CSV in the workbook's column layout.

## Project layout

```
seoudi-pim/
├─ source-files/Creation.xlsx     original workbook (unmodified copy)
├─ docs/SOURCE_ANALYSIS.md        source analysis, normalized model, assumptions
├─ docs/ARCHITECTURE.md           architecture & key rules
├─ prisma/schema.prisma           PostgreSQL schema  ·  migrations/  ·  seed.ts  ·  seed-data/
├─ scripts/recompute.ts           batch recalculation
├─ src/lib/domain/                pure business logic (units, QC, workflow, completeness, importer, magento, compare, rbac)
├─ src/lib/server/                db, auth/sessions, audit, product service, queries, imports, exports, stats
├─ src/app/actions/               server actions (all permission-checked)
├─ src/app/(app)/                 pages: dashboard, today, products, tasks, qc, images, categories, attributes, imports, exports, reports, users, settings, search
├─ src/app/api/                   export CSV, import report, health, image placeholder
└─ tests/                         Vitest suites for critical rules
```

## Known limitations / next steps

- RMS and Magento are file-based in this MVP (no live API); Magento category IDs must be filled in the taxonomy.
- Images are URLs (no binary storage/CDN upload yet).
- Mentions are in-app only (no e-mail/Teams notifications).
- Login throttling is in-process; use a shared store when scaling horizontally.
- Very large imports (> ~5k rows) run synchronously; move to a job queue for production scale.

import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { Prisma, WorkflowStatus as DbStatus } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import type { SessionUser } from "./auth";
import { loadCompletenessRules, loadQcRules, recompute, updateProduct } from "./products";
import {
  classifyRecord, crossRowChecks, detectMapping, normalizeRow, RMS_OWNED_FIELDS,
  type ImportKind, type Mapping, type NormalizedRow, type OverwriteMode,
} from "@/lib/domain/importer";
import { parseSize } from "@/lib/domain/units";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export interface SheetSummary { name: string; rows: number; headerRow: number; headers: string[] }
export interface ImportOptions { mode: OverwriteMode; initialStatus: DbStatus; createBrands: boolean }
export interface BatchMeta { sheets?: SheetSummary[]; columns?: Mapping; options?: ImportOptions; ext?: string }

export const DEFAULT_OPTIONS: ImportOptions = { mode: "FILL_EMPTY", initialStatus: "NEW_IN_RMS", createBrands: true };

type Cell = string | number | boolean | Date | null;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return null;
    return String(v);
  }
  return v as Cell;
}

function sheetRows(ws: ExcelJS.Worksheet): Cell[][] {
  const out: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = Array.from((row.values as ExcelJS.CellValue[]).slice(1), (v) => cellValue(v)); // Array.from fills sparse holes
    if (vals.some((v) => v != null && v !== "")) out.push(vals);
  });
  return out;
}

function findHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((c) => typeof c === "string" && c.trim().toLowerCase() === "sku")) return i;
  }
  return 0;
}

export async function readFileRows(file: Buffer, ext: string, sheet?: string): Promise<{ sheets: SheetSummary[]; rows?: Cell[][]; headerRow?: number }> {
  if (ext === "csv") {
    const text = file.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = parsed.data.map((r) => r.map((c) => (c === "" ? null : c)));
    const h = findHeaderRow(rows);
    return { sheets: [{ name: "CSV", rows: rows.length - h - 1, headerRow: h, headers: (rows[h] ?? []).map((x) => String(x ?? "")) }], rows, headerRow: h };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  const sheets: SheetSummary[] = [];
  let chosen: Cell[][] | undefined;
  let chosenHeader: number | undefined;
  for (const ws of wb.worksheets) {
    if (sheet && ws.name !== sheet) {
      // summary only: look at the first rows to find the header
      const head: Cell[][] = [];
      for (let i = 1; i <= Math.min(6, ws.rowCount); i++) head.push(Array.from((ws.getRow(i).values as ExcelJS.CellValue[]).slice(1), (v) => cellValue(v)));
      const h = findHeaderRow(head);
      sheets.push({ name: ws.name, rows: Math.max(0, ws.actualRowCount - h - 1), headerRow: h, headers: (head[h] ?? []).map((x) => String(x ?? "")).filter(Boolean) });
      continue;
    }
    const rows = sheetRows(ws);
    const h = findHeaderRow(rows);
    sheets.push({ name: ws.name, rows: Math.max(0, rows.length - h - 1), headerRow: h, headers: (rows[h] ?? []).map((x) => String(x ?? "")) });
    if (sheet && ws.name === sheet) { chosen = rows; chosenHeader = h; }
  }
  return { sheets, rows: chosen, headerRow: chosenHeader };
}

export async function storeUpload(batchId: string, ext: string, buf: Buffer) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, `${batchId}.${ext}`), buf);
}

export async function loadUpload(batchId: string, ext: string): Promise<Buffer> {
  return readFile(path.join(UPLOAD_DIR, `${batchId}.${ext}`));
}

/** Step 2: pick sheet -> parse rows into ImportRow and detect mapping. */
export async function selectSheet(batchId: string, sheetName: string) {
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const meta = (batch.mapping as BatchMeta | null) ?? {};
  const ext = meta.ext ?? "xlsx";
  const buf = await loadUpload(batchId, ext);
  const { rows, headerRow } = await readFileRows(buf, ext, ext === "csv" ? undefined : sheetName);
  if (!rows || headerRow == null) throw new Error(`Sheet "${sheetName}" not found`);
  const headers = (rows[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const data = rows.slice(headerRow + 1);
  await db.importRow.deleteMany({ where: { batchId } });
  const chunk = 500;
  for (let i = 0; i < data.length; i += chunk) {
    await db.importRow.createMany({
      data: data.slice(i, i + chunk).map((r, j) => ({
        batchId, rowNumber: headerRow + 2 + i + j,
        raw: Array.from(r, (c) => (c instanceof Date ? c.toISOString() : c ?? null)) as Prisma.InputJsonValue,
      })),
    });
  }
  await db.importBatch.update({
    where: { id: batchId },
    data: { sheetName, headers, totalRows: data.length, status: "MAPPED", mapping: { ...meta, columns: detectMapping(headers), options: meta.options ?? optionsFor(batch.kind as ImportKind) } as unknown as Prisma.InputJsonValue },
  });
}

export function optionsFor(kind: ImportKind): ImportOptions {
  return { ...DEFAULT_OPTIONS, initialStatus: kind === "MAGENTO" ? "LIVE" : kind === "CONTENT" ? "CONTENT_IN_PROGRESS" : "NEW_IN_RMS" };
}

/* --------------------------------------------------------------------------- validation */

async function currentRecords(skus: string[]) {
  const products = await db.product.findMany({
    where: { sku: { in: skus } },
    include: { brand: true, primaryCategory: true, categories: { include: { category: true } }, images: { where: { role: "MAIN" } },
      rmsSnapshots: { orderBy: { createdAt: "desc" }, take: 1 }, magentoSnapshots: { orderBy: { createdAt: "desc" }, take: 2 } },
  });
  const map = new Map<string, { id: string; current: Record<string, unknown>; rmsSnap: Record<string, unknown> | null; magentoSnap: Record<string, unknown> | null }>();
  for (const p of products) {
    const current: Record<string, unknown> = {
      ...p,
      brand: p.brand?.name ?? null,
      categories: [p.primaryCategory?.path, ...p.categories.map((c) => c.category.path)].filter(Boolean),
      imageUrl: p.images[0]?.url ?? null,
    };
    const mag = p.magentoSnapshots.length ? Object.assign({}, ...p.magentoSnapshots.map((s) => s.data as Record<string, unknown>).reverse()) : null;
    map.set(p.sku, { id: p.id, current, rmsSnap: (p.rmsSnapshots[0]?.data as Record<string, unknown>) ?? null, magentoSnap: mag });
  }
  return map;
}

export async function validateBatch(batchId: string) {
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const meta = (batch.mapping as BatchMeta | null) ?? {};
  const mapping = meta.columns ?? {};
  const options = meta.options ?? optionsFor(batch.kind as ImportKind);
  if (!Object.values(mapping).includes("sku")) throw new Error("Map a column to SKU before validating");
  const rows = await db.importRow.findMany({ where: { batchId }, orderBy: { rowNumber: "asc" } });
  const [storeViews, categories, brands] = await Promise.all([
    db.setting.findUnique({ where: { key: "storeViews" } }),
    db.category.findMany({ select: { path: true, active: true } }),
    db.brand.findMany({ select: { name: true } }),
  ]);
  const catSet = new Map(categories.map((c) => [c.path, c.active]));
  const brandSet = new Set(brands.map((b) => b.name.toLowerCase()));
  const normalized: NormalizedRow[] = rows.map((r) => normalizeRow(r.raw as unknown[], mapping, r.rowNumber, { storeViews: (storeViews?.value as string[]) ?? undefined }));
  crossRowChecks(normalized);
  const existing = await currentRecords(normalized.map((n) => n.sku).filter(Boolean) as string[]);

  // DB-level duplicate checks
  const urlKeys = normalized.map((n) => n.record.urlKey).filter(Boolean) as string[];
  const barcodes = normalized.map((n) => n.record.barcode).filter(Boolean) as string[];
  const namesEn = normalized.map((n) => n.record.nameEn).filter(Boolean) as string[];
  const [urlOwners, barcodeOwners, nameOwners] = await Promise.all([
    db.product.findMany({ where: { urlKey: { in: urlKeys } }, select: { sku: true, urlKey: true } }),
    db.product.findMany({ where: { barcode: { in: barcodes } }, select: { sku: true, barcode: true } }),
    db.product.findMany({ where: { nameEn: { in: namesEn } }, select: { sku: true, nameEn: true } }),
  ]);

  const counts = { created: 0, updated: 0, skipped: 0, errors: 0, warnings: 0 };
  // simulate sequential application so a second store-view row for the same SKU sees the first
  const simulated = new Map<string, Record<string, unknown>>();
  for (const n of normalized) {
    const row = rows.find((r) => r.rowNumber === n.rowNumber)!;
    let action = "ERROR";
    let diff: unknown = null;
    if (!n.errors.length && n.sku) {
      const ex = existing.get(n.sku);
      for (const c of (n.record.categories as string[] | undefined) ?? []) {
        if (!catSet.has(c)) n.warnings.push(`Unknown category path "${c}" – will be skipped`);
        else if (!catSet.get(c)) n.warnings.push(`Category "${c}" is inactive`);
      }
      if (typeof n.record.brand === "string" && !brandSet.has(n.record.brand.toLowerCase())) {
        n.warnings.push(options.createBrands ? `New brand "${n.record.brand}" will be created` : `Unknown brand "${n.record.brand}" – will be skipped`);
      }
      const u = urlOwners.find((o) => o.urlKey === n.record.urlKey && o.sku !== n.sku);
      if (u) n.warnings.push(`URL key already used by SKU ${u.sku}`);
      const b = barcodeOwners.find((o) => o.barcode === n.record.barcode && o.sku !== n.sku);
      if (b) n.warnings.push(`Barcode already used by SKU ${b.sku}`);
      const nm = nameOwners.find((o) => o.nameEn === n.record.nameEn && o.sku !== n.sku);
      if (nm) n.warnings.push(`English title identical to SKU ${nm.sku}`);
      const size = parseSize((n.record.volumeWeightEn as string) ?? (n.record.volumeWeightAr as string));
      if (n.record.weightKg != null && size.ok && size.kind === "VOLUME" && size.baseTotal != null && Math.abs(Number(n.record.weightKg) - size.baseTotal) < 1e-6) {
        n.warnings.push(`Weight ${n.record.weightKg} equals the volume (${size.input}) – looks converted from volume; please verify`);
      }
      const cur = simulated.get(n.sku) ?? ex?.current ?? null;
      const prev = batch.kind === "RMS" ? ex?.rmsSnap ?? null : batch.kind === "MAGENTO" ? ex?.magentoSnap ?? null : null;
      const record = { ...n.record };
      delete record.storeViewCode;
      const cls = classifyRecord(record, cur, prev, options.mode);
      action = cls.action;
      diff = cls.changes;
      const merged = { ...(cur ?? {}) };
      for (const ch of cls.changes) if (ch.state !== "CONFLICT") merged[ch.field] = ch.incoming;
      simulated.set(n.sku, merged);
      if (!cur) counts.created++;
      else if (action === "UNCHANGED") counts.skipped++;
      else counts.updated++;
    } else counts.errors++;
    if (n.warnings.length) counts.warnings++;
    await db.importRow.update({ where: { id: row.id }, data: { sku: n.sku, action, errors: [...new Set(n.errors)], warnings: [...new Set(n.warnings)], diff: diff as Prisma.InputJsonValue } });
  }
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: "VALIDATED", createdRows: counts.created, updatedRows: counts.updated, skippedRows: counts.skipped, errorRows: counts.errors, warningRows: counts.warnings },
  });
  return counts;
}

/* --------------------------------------------------------------------------- run */

interface Change { field: string; incoming: unknown; state: string }

const PRODUCT_FIELD_MAP: Record<string, string> = { brand: "brandId", categories: "primaryCategoryId" };

export async function runImport(batchId: string, user: SessionUser) {
  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.status !== "VALIDATED") throw new Error("Validate the batch before importing");
  const meta = (batch.mapping as BatchMeta | null) ?? {};
  const options = meta.options ?? optionsFor(batch.kind as ImportKind);
  const rows = await db.importRow.findMany({ where: { batchId, action: { in: ["CREATE", "UPDATE", "CONFLICT"] } }, orderBy: { rowNumber: "asc" } });
  const cats = new Map((await db.category.findMany({ select: { id: true, path: true } })).map((c) => [c.path, c.id]));
  const cache = { completeness: await loadCompletenessRules(), qc: await loadQcRules() };
  const touched = new Set<string>();
  let created = 0, updated = 0, conflicts = 0;

  const brandId = async (name: string): Promise<string | null> => {
    const b = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (b) return b.id;
    if (!options.createBrands) return null;
    return (await db.brand.create({ data: { name } })).id;
  };

  for (const row of rows) {
    const changes = ((row.diff as unknown as Change[]) ?? []).filter((c) => c.state !== "SAME");
    const apply = changes.filter((c) => c.state !== "CONFLICT");
    if (row.action === "CONFLICT") conflicts++;
    let product = await db.product.findUnique({ where: { sku: row.sku! } });
    const reason = `Import ${batch.fileName}${batch.sheetName ? ` [${batch.sheetName}]` : ""} row ${row.rowNumber}`;
    if (!product) {
      product = await db.product.create({ data: { sku: row.sku!, status: options.initialStatus, productOnline: options.initialStatus === "LIVE", liveAt: options.initialStatus === "LIVE" ? new Date() : null } });
      await audit(db, { entityType: "Product", entityId: product.id, productId: product.id, actorId: user.id, action: "CREATE", source: "IMPORT", reason });
      created++;
    } else if (apply.length) updated++;
    const patch: Record<string, unknown> = {};
    let extraCats: string[] = [];
    let imageUrl: string | null = null;
    for (const c of apply) {
      if (c.field === "brand") patch.brandId = await brandId(String(c.incoming));
      else if (c.field === "categories") {
        const ids = (c.incoming as string[]).map((p) => cats.get(p)).filter(Boolean) as string[];
        if (ids.length) { patch.primaryCategoryId = ids[0]; extraCats = ids.slice(1); }
      } else if (c.field === "imageUrl") imageUrl = String(c.incoming);
      else if (c.field === "storeViewCode") continue;
      else patch[PRODUCT_FIELD_MAP[c.field] ?? c.field] = c.incoming;
    }
    if (Object.keys(patch).length) await updateProduct(product.id, patch, user, { source: "IMPORT", reason, skipPermission: true, skipRecompute: true });
    if (extraCats.length) {
      await db.productCategory.createMany({ data: extraCats.map((categoryId) => ({ productId: product!.id, categoryId })), skipDuplicates: true });
    }
    if (imageUrl) {
      const main = await db.productImage.findFirst({ where: { productId: product.id, role: "MAIN" } });
      if (!main) await db.productImage.create({ data: { productId: product.id, role: "MAIN", url: imageUrl, status: "AVAILABLE" } });
    }
    // snapshots: never overwrite – append
    const incoming = Object.fromEntries(changes.map((c) => [c.field, c.incoming]));
    const raw = row.raw as unknown[];
    if (batch.kind === "RMS" || RMS_OWNED_FIELDS.some((f) => f in incoming)) {
      const prev = await db.rmsSnapshot.findFirst({ where: { productId: product.id }, orderBy: { createdAt: "desc" } });
      const data = { ...((prev?.data as Record<string, unknown>) ?? {}), ...Object.fromEntries(Object.entries(incoming).filter(([k]) => batch.kind === "RMS" || (RMS_OWNED_FIELDS as readonly string[]).includes(k))), sku: row.sku };
      await db.rmsSnapshot.create({ data: { productId: product.id, importBatchId: batchId, data: data as Prisma.InputJsonValue, hash: String(JSON.stringify(data).length) } });
    }
    if (batch.kind === "MAGENTO") {
      const svIdx = Object.entries(meta.columns ?? {}).find(([, f]) => f === "storeViewCode")?.[0];
      const sv = svIdx != null ? String(raw[Number(svIdx)] ?? "default").replace("defualt", "default") : "default";
      await db.magentoSnapshot.create({ data: { productId: product.id, storeViewCode: sv, source: "import", data: incoming as Prisma.InputJsonValue } });
    }
    touched.add(product.id);
  }
  for (const id of touched) await recompute(id, cache);
  await db.importBatch.update({ where: { id: batchId }, data: { status: "IMPORTED", completedAt: new Date(), createdRows: created, updatedRows: updated } });
  await audit(db, { entityType: "ImportBatch", entityId: batchId, actorId: user.id, action: "IMPORT", source: "IMPORT",
    newValue: `${created} created, ${updated} updated, ${conflicts} rows with conflicts left untouched`, reason: batch.fileName });
  return { created, updated, conflicts };
}

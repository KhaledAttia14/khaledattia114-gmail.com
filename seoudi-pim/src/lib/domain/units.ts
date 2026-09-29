/**
 * Size / pack / unit engine (English + Arabic).
 *
 * Rules:
 *  - Weight is normalised to kg (500 g -> 0.5, 1 kg -> 1).
 *  - Volume/capacity (ml, L) is NEVER converted into physical weight.
 *  - Pack expressions: "10 pieces x 250 g", "250 g x 10", "700+700 g", "5+1",
 *    "Pack of 12", "عبوة من 12", "Set of 3", "طقم من 3", Arabic dual ("قطعتين").
 */

export type SizeKind = "WEIGHT" | "VOLUME" | "COUNT" | "LENGTH" | "AREA" | "POWER" | "OTHER";

export interface UnitDef {
  canonical: string; // g, kg, mg, ml, l, cl, pc, cm, mm, m, w
  kind: SizeKind;
  /** multiplier to the kind's base unit: kg | l | pc | m | w */
  toBase: number;
  en: string;
  enPlural?: string;
  ar: string;
  arPlural?: string;
}

export const UNITS: Record<string, UnitDef> = {
  mg: { canonical: "mg", kind: "WEIGHT", toBase: 0.000001, en: "mg", ar: "ملجم" },
  g: { canonical: "g", kind: "WEIGHT", toBase: 0.001, en: "g", ar: "جم" },
  kg: { canonical: "kg", kind: "WEIGHT", toBase: 1, en: "kg", ar: "كجم" },
  ml: { canonical: "ml", kind: "VOLUME", toBase: 0.001, en: "ml", ar: "مل" },
  cl: { canonical: "cl", kind: "VOLUME", toBase: 0.01, en: "cl", ar: "سنتيلتر" },
  l: { canonical: "l", kind: "VOLUME", toBase: 1, en: "Liter", enPlural: "Liters", ar: "لتر" },
  pc: { canonical: "pc", kind: "COUNT", toBase: 1, en: "Piece", enPlural: "Pieces", ar: "قطعة", arPlural: "قطع" },
  mm: { canonical: "mm", kind: "LENGTH", toBase: 0.001, en: "mm", ar: "ملم" },
  cm: { canonical: "cm", kind: "LENGTH", toBase: 0.01, en: "cm", ar: "سم" },
  m: { canonical: "m", kind: "LENGTH", toBase: 1, en: "m", ar: "متر" },
  w: { canonical: "w", kind: "POWER", toBase: 1, en: "W", ar: "واط" },
};

/** Countable nouns that behave like "pieces" (kept as their own label). */
const COUNT_NOUNS: Record<string, { en: string; ar: string }> = {
  sachet: { en: "Sachets", ar: "ظرف" },
  capsule: { en: "Capsules", ar: "كبسولات" },
  bag: { en: "Bags", ar: "اكياس" },
  tablet: { en: "Tablets", ar: "اقراص" },
  tissue: { en: "Tissues", ar: "منديل" },
  sheet: { en: "Sheets", ar: "ورقة" },
  wipe: { en: "Wipes", ar: "مناديل" },
  pencil: { en: "Pencils", ar: "قلم" },
  color: { en: "Colors", ar: "لون" },
  roll: { en: "Rolls", ar: "لفة" },
  ply: { en: "Ply", ar: "طبقات" },
  can: { en: "Cans", ar: "علب" },
  bottle: { en: "Bottles", ar: "زجاجات" },
  stick: { en: "Sticks", ar: "أصابع" },
  pair: { en: "Pairs", ar: "أزواج" },
};

/** alias (lower-case) -> canonical unit key or "noun:<key>" */
const ALIASES: Record<string, string> = {
  // weight
  mg: "mg", "ملجم": "mg", "مجم": "mg",
  g: "g", gm: "g", gms: "g", gr: "g", grs: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  "جم": "g", "جرام": "g", "جرامات": "g", "غ": "g", "غم": "g", "غرام": "g", "ج": "g", "جر": "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  "كجم": "kg", "كيلو": "kg", "كغ": "kg", "كيلوجرام": "kg", "كجم.": "kg",
  // volume
  ml: "ml", mls: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  "مل": "ml", "ملل": "ml", "مللي": "ml", "ملي": "ml", "مليلتر": "ml",
  cl: "cl",
  l: "l", lt: "l", ltr: "l", ltrs: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  "لتر": "l", "لترات": "l", "ل": "l",
  // count
  piece: "pc", pieces: "pc", pc: "pc", pcs: "pc", pce: "pc", unit: "pc", units: "pc",
  "قطعة": "pc", "قطعه": "pc", "قطع": "pc", "ق": "pc", "حبة": "pc", "حبات": "pc",
  // length
  mm: "mm", "ملم": "mm", "مم": "mm",
  cm: "cm", "سم": "cm",
  m: "m", meter: "m", meters: "m", metre: "m", "متر": "m", "م": "m",
  // power
  w: "w", watt: "w", watts: "w", "واط": "w", "وات": "w",
  // countable nouns
  sachet: "noun:sachet", sachets: "noun:sachet", "ظرف": "noun:sachet", "اظرف": "noun:sachet", "أظرف": "noun:sachet",
  capsule: "noun:capsule", capsules: "noun:capsule", "كبسولة": "noun:capsule", "كبسولات": "noun:capsule",
  bag: "noun:bag", bags: "noun:bag", "كيس": "noun:bag", "اكياس": "noun:bag", "أكياس": "noun:bag",
  tablet: "noun:tablet", tablets: "noun:tablet", "قرص": "noun:tablet", "اقراص": "noun:tablet", "أقراص": "noun:tablet",
  tissue: "noun:tissue", tissues: "noun:tissue", "منديل": "noun:tissue",
  sheet: "noun:sheet", sheets: "noun:sheet", "ورقة": "noun:sheet", "ورقه": "noun:sheet",
  wipe: "noun:wipe", wipes: "noun:wipe", "مناديل": "noun:wipe",
  pencil: "noun:pencil", pencils: "noun:pencil", "قلم": "noun:pencil", "اقلام": "noun:pencil",
  color: "noun:color", colors: "noun:color", colour: "noun:color", colours: "noun:color", "لون": "noun:color", "الوان": "noun:color", "ألوان": "noun:color",
  roll: "noun:roll", rolls: "noun:roll", "لفة": "noun:roll", "لفات": "noun:roll",
  ply: "noun:ply", "طبقات": "noun:ply", "طبقة": "noun:ply",
  can: "noun:can", cans: "noun:can",
  bottle: "noun:bottle", bottles: "noun:bottle",
  stick: "noun:stick", sticks: "noun:stick",
  pair: "noun:pair", pairs: "noun:pair",
};

/** Arabic dual forms: "قطعتين" = 2 pieces, etc. */
const ARABIC_DUALS: Record<string, string> = {
  "قطعتين": "pc", "قطعتان": "pc", "كيسين": "noun:bag", "ظرفين": "noun:sachet", "لترين": "l", "كيلوين": "kg",
};

/** Preferred spellings by language (used for UNIT_FORMAT QC). */
export const PREFERRED_EN = new Set(["g", "kg", "mg", "ml", "cl", "Liter", "Liters", "Piece", "Pieces", "cm", "mm", "m", "W",
  "Sachets", "Capsules", "Bags", "Tablets", "Tissues", "Sheets", "Wipes", "Pencils", "Colors", "Rolls", "Ply", "Cans", "Bottles", "Sticks", "Pairs"]);
export const PREFERRED_AR = new Set(["جم", "كجم", "ملجم", "مل", "لتر", "قطعة", "قطع", "سم", "ملم", "متر", "واط",
  "ظرف", "كبسولات", "اكياس", "اقراص", "منديل", "ورقة", "مناديل", "قلم", "لون", "لفة", "طبقات"]);

export interface ParsedSize {
  ok: boolean;
  input: string;
  kind: SizeKind | null;
  /** per-item amount in `unit` */
  value: number | null;
  unit: string | null; // canonical unit key or noun key
  unitLabel: string | null; // label as written
  /** number of items (1 when not a pack) */
  packCount: number;
  /** total amount in `unit` (value * packCount, or sum of parts) */
  total: number | null;
  /** total in base unit: kg | l | pc | m | w */
  baseTotal: number | null;
  /** sub-parts for "a+b" expressions */
  parts?: number[];
  isRange?: boolean;
  isPack: boolean;
  expression: string | null;
  lang: "en" | "ar" | "mixed" | null;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const a = ARABIC_DIGITS.indexOf(ch);
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (a >= 0) out += String(a);
    else if (p >= 0) out += String(p);
    else if (ch === "٫") out += ".";
    else out += ch;
  }
  return out;
}

const AR_RE = /[؀-ۿ]/;
const LAT_RE = /[A-Za-z]/;

function langOf(s: string): ParsedSize["lang"] {
  const a = AR_RE.test(s);
  const l = LAT_RE.test(s);
  if (a && l) return "mixed";
  if (a) return "ar";
  if (l) return "en";
  return null;
}

function num(s: string): number {
  return Number(s.replace(",", "."));
}

export function resolveUnit(label: string): { key: string; def?: UnitDef; noun?: string } | null {
  const k = label.trim().toLowerCase().replace(/\.$/, "");
  const alias = ALIASES[k] ?? ALIASES[label.trim()];
  if (!alias) return null;
  if (alias.startsWith("noun:")) return { key: alias.slice(5), noun: alias.slice(5) };
  return { key: alias, def: UNITS[alias] };
}

function kindOf(u: { def?: UnitDef; noun?: string }): SizeKind {
  if (u.def) return u.def.kind;
  return "COUNT";
}

function toBase(amount: number, u: { def?: UnitDef; noun?: string }): number {
  return u.def ? round(amount * u.def.toBase) : amount;
}

export function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const empty = (input: string): ParsedSize => ({
  ok: false, input, kind: null, value: null, unit: null, unitLabel: null, packCount: 1,
  total: null, baseTotal: null, isPack: false, expression: null, lang: langOf(input),
});

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`([A-Za-z؀-ۿ]+\.?)`;

/** Parse a size / pack expression such as "500 g", "10 pieces x 250 g", "عبوة من 12". */
export function parseSize(raw: string | null | undefined): ParsedSize {
  const input = (raw ?? "").toString();
  const res = empty(input);
  let s = normalizeDigits(input).replace(/[×*✕]/g, " x ").replace(/\s+/g, " ").trim();
  if (!s) return res;
  s = s.replace(/(\d)\s*[xX]\s*(\d)/g, "$1 x $2");

  // Arabic dual on its own: "قطعتين", "عبوة من قطعتين"
  for (const [dual, key] of Object.entries(ARABIC_DUALS)) {
    if (s === dual || s.endsWith(" " + dual)) {
      const packish = /^(عبوة|عبوه|طقم)\s+من/.test(s);
      const u = key.startsWith("noun:") ? { key: key.slice(5), noun: key.slice(5) } : { key, def: UNITS[key] };
      return {
        ...res, ok: true, kind: kindOf(u), value: packish ? 1 : 2, unit: u.key, unitLabel: dual,
        packCount: packish ? 2 : 1, total: 2, baseTotal: toBase(2, u), isPack: packish, expression: s,
      };
    }
  }

  // "Pack of 12", "Pack of 5+1", "Set of 3 Pieces", "عبوة من 12", "طقم من 3", "عبوة 6"
  let m = s.match(new RegExp(String.raw`^(?:pack|set|box|bundle|carton|عبوة|عبوه|طقم|علبة)\s*(?:of|من)?\s*(\d+(?:\s*\+\s*\d+)*)\s*(.*)$`, "i"));
  if (m) {
    const parts = m[1].split("+").map((p) => parseInt(p.trim(), 10));
    const count = parts.reduce((a, b) => a + b, 0);
    const rest = m[2].trim();
    const u = rest ? resolveUnit(rest) : null;
    return {
      ...res, ok: true, kind: "COUNT", value: 1, unit: u?.key ?? "pc", unitLabel: rest || null, packCount: count,
      total: count, baseTotal: count, parts: parts.length > 1 ? parts : undefined, isPack: true, expression: s,
    };
  }

  // Dimensions: "175 x 110 cm", "7.62 x 7.62 سم"
  m = s.match(new RegExp(String.raw`^${NUM}\s*x\s*${NUM}(?:\s*x\s*${NUM})?\s*${UNIT}$`, "i"));
  if (m) {
    const u = resolveUnit(m[4]);
    if (u && kindOf(u) === "LENGTH") {
      return {
        ...res, ok: true, kind: "AREA", value: null, unit: u.key, unitLabel: m[4], packCount: 1,
        total: null, baseTotal: null, isPack: false, expression: s,
      };
    }
  }

  // "10 pieces x 250 g" / "10 x 250 g" / "10 قطع x 250 جم"
  m = s.match(new RegExp(String.raw`^(\d+)\s*(?:${UNIT})?\s*x\s*${NUM}\s*${UNIT}$`, "i"));
  if (m) {
    const count = parseInt(m[1], 10);
    const countUnit = m[2] ? resolveUnit(m[2]) : null;
    const u = resolveUnit(m[4]);
    if (u && (!countUnit || kindOf(countUnit) === "COUNT")) {
      const per = num(m[3]);
      const total = round(per * count);
      return {
        ...res, ok: true, kind: kindOf(u), value: per, unit: u.key, unitLabel: m[4], packCount: count,
        total, baseTotal: toBase(total, u), isPack: true, expression: s,
      };
    }
  }

  // "250 g x 10" / "250 g x 10 pieces"
  m = s.match(new RegExp(String.raw`^${NUM}\s*${UNIT}\s*x\s*(\d+)\s*(?:${UNIT})?$`, "i"));
  if (m) {
    const u = resolveUnit(m[2]);
    const countUnit = m[4] ? resolveUnit(m[4]) : null;
    if (u && (!countUnit || kindOf(countUnit) === "COUNT")) {
      const per = num(m[1]);
      const count = parseInt(m[3], 10);
      const total = round(per * count);
      return {
        ...res, ok: true, kind: kindOf(u), value: per, unit: u.key, unitLabel: m[2], packCount: count,
        total, baseTotal: toBase(total, u), isPack: true, expression: s,
      };
    }
  }

  // "700+700 g", "700 g + 700 g", "100 + 50 ml"
  if (s.includes("+")) {
    const pieces = s.split("+").map((p) => p.trim());
    const nums: number[] = [];
    let unitLabel: string | null = null;
    let valid = true;
    for (const p of pieces) {
      const pm = p.match(new RegExp(String.raw`^${NUM}\s*${UNIT}?$`, "i"));
      if (!pm) { valid = false; break; }
      nums.push(num(pm[1]));
      if (pm[2]) {
        if (unitLabel && resolveUnit(unitLabel)?.key !== resolveUnit(pm[2])?.key) { valid = false; break; }
        unitLabel = pm[2];
      }
    }
    if (valid && nums.length > 1) {
      const total = round(nums.reduce((a, b) => a + b, 0));
      const u = unitLabel ? resolveUnit(unitLabel) : { key: "pc", def: UNITS.pc };
      if (u) {
        const allEqual = nums.every((n) => n === nums[0]);
        return {
          ...res, ok: true, kind: kindOf(u), value: allEqual ? nums[0] : null, unit: u.key, unitLabel,
          packCount: kindOf(u) === "COUNT" ? total : nums.length, total, baseTotal: toBase(total, u),
          parts: nums, isPack: true, expression: s,
        };
      }
    }
  }

  // Range "2 - 3 g"
  m = s.match(new RegExp(String.raw`^${NUM}\s*-\s*${NUM}\s*${UNIT}$`, "i"));
  if (m) {
    const u = resolveUnit(m[3]);
    if (u) {
      const hi = num(m[2]);
      return {
        ...res, ok: true, kind: kindOf(u), value: hi, unit: u.key, unitLabel: m[3], packCount: 1,
        total: hi, baseTotal: toBase(hi, u), isRange: true, isPack: false, expression: s,
      };
    }
  }

  // Simple "500 g", "500g", "1.5 L", "330 مل", "12 لون"
  m = s.match(new RegExp(String.raw`^${NUM}\s*${UNIT}$`, "i"));
  if (m) {
    const u = resolveUnit(m[2]);
    if (u) {
      const v = num(m[1]);
      return {
        ...res, ok: true, kind: kindOf(u), value: v, unit: u.key, unitLabel: m[2], packCount: 1,
        total: v, baseTotal: toBase(v, u), isPack: false, expression: null,
      };
    }
  }

  // Bare unit word = 1 ("قطعة")
  const bare = resolveUnit(s);
  if (bare) {
    return {
      ...res, ok: true, kind: kindOf(bare), value: 1, unit: bare.key, unitLabel: s, packCount: 1,
      total: 1, baseTotal: toBase(1, bare), isPack: false, expression: null,
    };
  }
  return res;
}

/**
 * Magento physical weight (kg) derived from a size – ONLY for weight-based sizes.
 * Volume / capacity / count never produce a weight.
 */
export function deriveWeightKg(size: ParsedSize | string | null | undefined): number | null {
  const p = typeof size === "string" || size == null ? parseSize(size ?? "") : size;
  if (!p.ok || p.kind !== "WEIGHT" || p.baseTotal == null || p.isRange) return null;
  return round(p.baseTotal, 4);
}

function fmtNum(n: number): string {
  return String(round(n, 3));
}

function unitText(unit: string, amount: number, locale: "en" | "ar"): string {
  const def = UNITS[unit];
  if (def) {
    if (locale === "en") return amount !== 1 && def.enPlural ? def.enPlural : def.en;
    return amount > 2 && amount <= 10 && def.arPlural ? def.arPlural : def.ar;
  }
  const noun = COUNT_NOUNS[unit];
  if (noun) return locale === "en" ? noun.en : noun.ar;
  return unit;
}

/** Render a parsed size into the house style used by the Magento `volume_or_weight` column. */
export function formatSize(p: ParsedSize, locale: "en" | "ar"): string | null {
  if (!p.ok || !p.unit) return null;
  if (p.kind === "AREA") return p.expression;
  if (p.isPack && p.kind === "COUNT" && p.unit === "pc" && p.value === 1) {
    const expr = p.parts ? p.parts.join("+") : String(p.packCount);
    return locale === "en" ? `Pack of ${expr}` : `عبوة من ${expr}`;
  }
  if (p.isPack && p.parts && p.value == null) {
    return `${p.parts.map(fmtNum).join(" + ")} ${unitText(p.unit, 2, locale)}`;
  }
  if (p.isPack && p.parts) {
    return `${p.parts.map(fmtNum).join(" + ")} ${unitText(p.unit, p.value ?? 2, locale)}`;
  }
  if (p.isPack && p.value != null) {
    return `${p.packCount} x ${fmtNum(p.value)} ${unitText(p.unit, p.value, locale)}`;
  }
  if (p.value == null) return null;
  return `${fmtNum(p.value)} ${unitText(p.unit, p.value, locale)}`;
}

/** Two sizes describe the same quantity (language independent). */
export function sameQuantity(a: ParsedSize, b: ParsedSize): boolean {
  if (!a.ok || !b.ok) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "AREA") return (a.expression ?? "").replace(/[^\d.x]/g, "") === (b.expression ?? "").replace(/[^\d.x]/g, "");
  if (a.baseTotal == null || b.baseTotal == null) return false;
  return Math.abs(a.baseTotal - b.baseTotal) < 1e-9 && a.packCount === b.packCount;
}

/**
 * Find size-like tokens inside a free-text title, e.g. "Bake Rolz Ketchup - 110 g" -> ["110 g"].
 * Used to check that the title carries the right size.
 */
export function extractSizesFromText(text: string | null | undefined): ParsedSize[] {
  if (!text) return [];
  const s = normalizeDigits(text).replace(/[×*]/g, " x ");
  const out: ParsedSize[] = [];
  const re = new RegExp(String.raw`(\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)*)\s*([A-Za-z؀-ۿ]+)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const u = resolveUnit(m[2]);
    if (!u) continue;
    const p = parseSize(`${m[1]} ${m[2]}`);
    if (p.ok) out.push(p);
  }
  return out;
}

/** "500g" (number glued to unit) and non-preferred spellings. Returns human messages. */
export function unitFormatIssues(text: string | null | undefined, locale: "en" | "ar"): string[] {
  if (!text) return [];
  const issues: string[] = [];
  const s = normalizeDigits(text);
  const re = /(\d+(?:[.,]\d+)?)(\s*)([A-Za-z؀-ۿ]+\.?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const label = m[3];
    const u = resolveUnit(label);
    if (!u) continue;
    const isAr = AR_RE.test(label);
    if (locale === "en" && isAr) issues.push(`Arabic unit "${label}" in English text`);
    else if (locale === "ar" && !isAr) issues.push(`Latin unit "${label}" in Arabic text`);
    else {
      const preferred = locale === "en" ? PREFERRED_EN : PREFERRED_AR;
      if (!preferred.has(label.replace(/\.$/, ""))) {
        const def = u.def;
        const suggestion = def ? (locale === "en" ? def.en : def.ar) : (COUNT_NOUNS[u.key]?.[locale] ?? "");
        issues.push(`Non-standard unit "${label}"${suggestion ? ` – use "${suggestion}"` : ""}`);
      }
    }
    if (m[2] === "") issues.push(`Missing space between number and unit in "${m[1]}${label}"`);
  }
  return Array.from(new Set(issues));
}

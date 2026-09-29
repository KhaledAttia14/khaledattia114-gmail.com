/** Text helpers: slugs, SKU normalisation, barcodes, similarity. */

export function slugify(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[×*]/g, " x ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export const URL_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "6221236068099.0" -> "6221236068099"; trims spaces; rejects scientific notation. */
export function normalizeSku(v: unknown): { sku: string | null; error?: string; warning?: string } {
  if (v == null) return { sku: null, error: "SKU is empty" };
  let s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : String(v);
  s = s.trim();
  if (!s) return { sku: null, error: "SKU is empty" };
  if (/e\+?\d+$/i.test(s)) return { sku: null, error: `SKU "${s}" is in scientific notation (Excel corruption)` };
  s = s.replace(/\.0+$/, "");
  if (!/^[A-Za-z0-9\-_.]+$/.test(s)) return { sku: null, error: `SKU "${s}" contains invalid characters` };
  let warning: string | undefined;
  if (/^\d{11}$/.test(s)) warning = `SKU "${s}" has 11 digits – a leading zero may have been lost (UPC-A)`;
  return { sku: s, warning };
}

/** Split a Magento SKU list, dropping empties/trailing commas; flags corrupted entries. */
export function parseSkuList(v: unknown): { skus: string[]; errors: string[] } {
  if (v == null || v === "") return { skus: [], errors: [] };
  const s = String(v);
  if (/\de\+\d+/i.test(s)) return { skus: [], errors: [`SKU list "${s.slice(0, 40)}" is corrupted (scientific notation)`] };
  const skus = s.split(/[,;|\s]+/).map((x) => x.trim().replace(/\.0+$/, "")).filter(Boolean);
  return { skus: Array.from(new Set(skus)), errors: [] };
}

/** GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) check digit validation. */
export function isValidGtin(code: string | null | undefined): boolean {
  if (!code || !/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeForCompare(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Dice coefficient on bigrams – 1 = identical. */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, c] of gx) inter += Math.min(c, gy.get(g) ?? 0);
  return (2 * inter) / (x.length - 1 + (y.length - 1));
}

export function metaTitle(title: string | null | undefined, suffix: string): string | null {
  if (!title) return null;
  return `${title.trim()} | ${suffix}`;
}

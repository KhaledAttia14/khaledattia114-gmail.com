/**
 * Arabic / English placement checks.
 * Arabic text in English fields is always wrong. Latin text in Arabic fields is allowed
 * for brand names, model numbers, shade numbers and technical codes.
 */

export const ARABIC_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const ARABIC_RE_G = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g;
export const LATIN_RE = /[A-Za-z]/;

export function hasArabic(s: string | null | undefined): boolean {
  return !!s && ARABIC_RE.test(s);
}

export function hasLatin(s: string | null | undefined): boolean {
  return !!s && LATIN_RE.test(s);
}

/** Tokens that are acceptable in Latin script inside Arabic text. */
export function isTechnicalToken(token: string): boolean {
  const t = token.replace(/^[#(]+|[).,;:]+$/g, "");
  if (!t) return true;
  if (/\d/.test(t)) return true; // model / shade / code: T9, M8504, SPF50, 7132, No.5
  if (/^[A-Z]{1,5}$/.test(t)) return true; // XL, LED, USB, UV, M&G parts
  if (/^[A-Z](?:[&.\-][A-Z])+\.?$/.test(t)) return true; // M&G, P.O, B-12
  return false;
}

export interface LanguageCheck {
  ok: boolean;
  /** offending fragments */
  fragments: string[];
}

/**
 * @param expected language of the field
 * @param allowed extra allowed Latin tokens (brand names, model etc.) – case-insensitive
 */
export function checkLanguage(
  text: string | null | undefined,
  expected: "en" | "ar",
  allowed: string[] = [],
): LanguageCheck {
  if (!text) return { ok: true, fragments: [] };
  if (expected === "en") {
    const frags = text.match(ARABIC_RE_G) ?? [];
    return { ok: frags.length === 0, fragments: Array.from(new Set(frags)) };
  }
  // Arabic field: strip allowed phrases first (multi-word brands such as "Lock and Lock")
  let rest = text;
  for (const a of allowed.filter(Boolean).sort((x, y) => y.length - x.length)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rest = rest.replace(new RegExp(esc, "gi"), " ");
  }
  const tokens = rest.split(/[\s,،\-–/|]+/).filter((t) => LATIN_RE.test(t));
  const bad = tokens.filter((t) => !isTechnicalToken(t));
  if (!ARABIC_RE.test(text) && text.trim().length > 0) {
    return { ok: false, fragments: [text.trim()] };
  }
  return { ok: bad.length === 0, fragments: Array.from(new Set(bad)) };
}

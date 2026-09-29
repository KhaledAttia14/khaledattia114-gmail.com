import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return date.toLocaleString("en-GB", opts);
}

export function relTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (Date.now() - date.getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = (n: number, u: string) => `${Math.round(n)}${u}`;
  const s = abs < 60 ? "now" : abs < 3600 ? fmt(abs / 60, "m") : abs < 86400 ? fmt(abs / 3600, "h") : fmt(abs / 86400, "d");
  if (s === "now") return s;
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function isOverdue(due: Date | string | null | undefined, done = false): boolean {
  if (!due || done) return false;
  return new Date(due).getTime() < Date.now();
}

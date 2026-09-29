import type { ActionResult } from "@/app/actions/products";
import { cn } from "@/lib/utils";

export function Feedback({ result, className }: { result: ActionResult | null | undefined; className?: string }) {
  if (!result) return null;
  return (
    <div role="status" className={cn("rounded border px-2 py-1.5 text-xs", result.ok && !result.errors?.length ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700", className)}>
      {result.message && <div>{result.message}</div>}
      {result.errors?.length ? (
        <ul className="list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      ) : null}
    </div>
  );
}

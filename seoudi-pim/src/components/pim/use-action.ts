"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/products";

/** Run a server action, keep feedback and refresh server components. */
export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        onOk?.(r);
        router.refresh();
      }
    });
  return { pending, result, setResult, run };
}

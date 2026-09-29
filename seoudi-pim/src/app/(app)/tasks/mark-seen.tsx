"use client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/pim/use-action";
import { markMentionsSeenAction } from "@/app/actions/products";

export function MarkSeen() {
  const { pending, run } = useAction();
  return <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => markMentionsSeenAction())}>Mark all read</Button>;
}

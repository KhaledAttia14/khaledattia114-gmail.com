"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40" />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border bg-card shadow-xl", className)}
        {...props}
      >
        <div className="flex items-start justify-between border-b px-4 py-2.5">
          <div>
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="text-xs text-muted-foreground">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

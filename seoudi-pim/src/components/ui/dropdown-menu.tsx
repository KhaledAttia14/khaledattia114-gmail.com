"use client";
import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={4} className={cn("z-50 max-h-[70vh] min-w-44 overflow-auto rounded-md border bg-card p-1 shadow-lg", className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1 text-[12.5px] outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50", className)} {...props} />;
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn("flex cursor-pointer select-none items-center gap-2 rounded py-1 pl-6 pr-2 text-[12.5px] outline-none relative data-[highlighted]:bg-muted", className)} {...props}>
      <DM.ItemIndicator className="absolute left-1.5"><Check className="size-3.5" /></DM.ItemIndicator>
      {children}
    </DM.CheckboxItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground", className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

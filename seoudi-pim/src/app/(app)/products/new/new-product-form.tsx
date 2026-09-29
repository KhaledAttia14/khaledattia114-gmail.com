"use client";
import { useActionState } from "react";
import { createProductAction } from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Feedback } from "@/components/pim/feedback";

export function NewProductForm({ brands, categories, users }: { brands: { id: string; name: string }[]; categories: { id: string; path: string }[]; users: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createProductAction, undefined);
  return (
    <form action={action} className="grid gap-3 rounded-md border bg-card p-4 md:grid-cols-2">
      <div><Label htmlFor="sku">SKU *</Label><Input id="sku" name="sku" required placeholder="e.g. 6221236068099" /></div>
      <div><Label htmlFor="barcode">Barcode</Label><Input id="barcode" name="barcode" placeholder="defaults to SKU when it is a GTIN" /></div>
      <div className="md:col-span-2"><Label htmlFor="rmsName">RMS name</Label><Input id="rmsName" name="rmsName" dir="auto" /></div>
      <div><Label htmlFor="nameEn">English title</Label><Input id="nameEn" name="nameEn" /></div>
      <div><Label htmlFor="nameAr">Arabic title</Label><Input id="nameAr" name="nameAr" dir="rtl" /></div>
      <div><Label htmlFor="brandId">Brand</Label><NativeSelect id="brandId" name="brandId"><option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></div>
      <div><Label htmlFor="primaryCategoryId">Category</Label><NativeSelect id="primaryCategoryId" name="primaryCategoryId"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.path.replace(/\//g, " › ")}</option>)}</NativeSelect></div>
      <div><Label htmlFor="ownerId">Owner</Label><NativeSelect id="ownerId" name="ownerId"><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</NativeSelect></div>
      <div><Label htmlFor="priority">Priority</Label><NativeSelect id="priority" name="priority" defaultValue="NORMAL">{["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</NativeSelect></div>
      <div><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" name="dueDate" type="date" /></div>
      <div><Label htmlFor="campaign">Campaign</Label><Input id="campaign" name="campaign" /></div>
      <div className="flex items-center gap-2 md:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create product"}</Button><Feedback result={state} /></div>
    </form>
  );
}

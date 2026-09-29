"use client";
import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadImportAction } from "@/app/actions/imports";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { Feedback } from "@/components/pim/feedback";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadImportAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1"><Label htmlFor="kind">Import type</Label>
        <NativeSelect id="kind" name="kind" defaultValue="RMS">
          <option value="RMS">RMS intake</option><option value="CONTENT">Content</option><option value="MAGENTO">Magento sheet (Creation.xlsx layout)</option><option value="CATEGORY">Category assignment</option>
        </NativeSelect>
      </div>
      <div className="space-y-1"><Label htmlFor="file">File (.xlsx / .csv, max 20 MB)</Label>
        <input id="file" name="file" type="file" accept=".xlsx,.csv" required className="block w-full text-xs file:mr-2 file:rounded file:border file:border-input file:bg-card file:px-2 file:py-1" />
      </div>
      <Button type="submit" disabled={pending}><Upload />{pending ? "Reading file…" : "Upload & detect"}</Button>
      <Feedback result={state} />
    </form>
  );
}

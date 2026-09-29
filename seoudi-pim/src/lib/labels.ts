import type { Tone } from "@/components/ui/badge";

export const IMAGE_STATUSES = ["NOT_REQUESTED", "REQUESTED", "IN_PHOTOGRAPHY", "AVAILABLE", "REJECTED", "MISSING", "READY"] as const;
export type ImageStatusT = (typeof IMAGE_STATUSES)[number];
export const IMAGE_LABELS: Record<ImageStatusT, string> = {
  NOT_REQUESTED: "Not requested", REQUESTED: "Requested", IN_PHOTOGRAPHY: "In photography", AVAILABLE: "Available",
  REJECTED: "Rejected", MISSING: "Missing", READY: "Ready",
};
export const IMAGE_TONE: Record<ImageStatusT, Tone> = {
  NOT_REQUESTED: "slate", REQUESTED: "blue", IN_PHOTOGRAPHY: "violet", AVAILABLE: "teal", REJECTED: "red", MISSING: "orange", READY: "green",
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type PriorityT = (typeof PRIORITIES)[number];
export const PRIORITY_TONE: Record<PriorityT, Tone> = { LOW: "slate", NORMAL: "blue", HIGH: "amber", URGENT: "red" };

export const QC_LABELS: Record<string, string> = { PASS: "Pass", WARNING: "Warning", ERROR: "Error", NEEDS_REVIEW: "Needs review" };

export const FIELD_LABELS: Record<string, string> = {
  sku: "SKU", barcode: "Barcode", rmsName: "RMS name", rmsBrand: "RMS brand", rmsCategory: "RMS category",
  brandId: "Brand", brand: "Brand", productLine: "Product line", productType: "Product type",
  nameEn: "English title", nameAr: "Arabic title", descriptionEn: "English description", descriptionAr: "Arabic description",
  shortDescriptionEn: "Short description (EN)", shortDescriptionAr: "Short description (AR)",
  volumeWeightEn: "Size / pack (EN)", volumeWeightAr: "Size / pack (AR)", weightKg: "Weight (kg)", dimensions: "Dimensions",
  model: "Model", color: "Color", flavor: "Flavor", variant: "Variant", origin: "Origin",
  primaryCategoryId: "Primary category", attributeSetId: "Attribute set", storeViewCode: "Store view", magentoProductType: "Magento product type",
  attributeSetCode: "Attribute set code", visibility: "Visibility", productOnline: "Online", metaTitleEn: "Meta title (EN)",
  metaTitleAr: "Meta title (AR)", metaDescriptionEn: "Meta description (EN)", metaDescriptionAr: "Meta description (AR)", urlKey: "URL key",
  relatedSkus: "Related SKUs", crosssellSkus: "Cross-sell SKUs", upsellSkus: "Up-sell SKUs", additionalAttributes: "Additional attributes",
  magentoId: "Magento ID", priority: "Priority", campaign: "Campaign", dueDate: "Due date", ownerId: "Owner", qcReviewerId: "QC reviewer",
  notes: "Notes", imageStatus: "Image status", status: "Status", "image:main": "Main image",
};

export function fieldLabel(key: string): string {
  if (key.startsWith("attr:")) return `Attribute: ${key.slice(5)}`;
  return FIELD_LABELS[key] ?? key;
}

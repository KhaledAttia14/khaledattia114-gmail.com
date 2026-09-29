/** Role-based access control. Permission logic depends on roles only – never on people. */

export const ROLES = ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR", "CONTENT_QUALITY", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  ECOMMERCE_SPECIALIST: "E-commerce Specialist",
  CONTENT_CREATOR: "Content Creator",
  CONTENT_QUALITY: "Content Quality",
  VIEWER: "Viewer",
};

export const PERMISSIONS = {
  "product.view": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR", "CONTENT_QUALITY", "VIEWER"],
  "product.create": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "product.editRms": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "product.editContent": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR"],
  "product.editMagento": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "product.assign": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_QUALITY"],
  "product.bulk": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "qc.review": ["ADMIN", "CONTENT_QUALITY"],
  "comment.create": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR", "CONTENT_QUALITY"],
  "comment.resolve": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR", "CONTENT_QUALITY"],
  "images.manage": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_CREATOR"],
  "taxonomy.manage": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "attributes.manage": ["ADMIN"],
  "import.run": ["ADMIN", "ECOMMERCE_SPECIALIST"],
  "export.run": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_QUALITY"],
  "users.manage": ["ADMIN"],
  "settings.manage": ["ADMIN"],
  "audit.view": ["ADMIN", "ECOMMERCE_SPECIALIST", "CONTENT_QUALITY"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Field groups and the permission needed to edit them. */
export const FIELD_PERMISSIONS: Record<string, Permission> = {
  sku: "product.editRms",
  barcode: "product.editRms",
  rmsName: "product.editRms",
  rmsBrand: "product.editRms",
  rmsCategory: "product.editRms",
  storeViewCode: "product.editMagento",
  magentoProductType: "product.editMagento",
  attributeSetCode: "product.editMagento",
  visibility: "product.editMagento",
  productOnline: "product.editMagento",
  magentoId: "product.editMagento",
  relatedSkus: "product.editMagento",
  crosssellSkus: "product.editMagento",
  upsellSkus: "product.editMagento",
  additionalAttributes: "product.editMagento",
  ownerId: "product.assign",
  qcReviewerId: "product.assign",
  priority: "product.assign",
  dueDate: "product.assign",
  campaign: "product.assign",
};

export function canEditField(role: Role, field: string): boolean {
  return can(role, FIELD_PERMISSIONS[field] ?? "product.editContent");
}

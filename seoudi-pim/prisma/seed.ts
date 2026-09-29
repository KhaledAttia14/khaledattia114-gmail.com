/**
 * Demo seed. Products, brands and taxonomy are a sample taken from source-files/Creation.xlsx
 * (see docs/SOURCE_ANALYSIS.md). Users are role-based demo accounts – no employee names.
 * Run with: npm run db:seed   (uses the react-server condition so server modules load outside Next)
 */
import { PrismaClient, type Prisma, type Role, type WorkflowStatus, type ImageStatus, type Priority } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import path from "path";
import { DEFAULT_TRANSITIONS } from "../src/lib/domain/workflow";
import { DEFAULT_COMPLETENESS_RULES } from "../src/lib/domain/completeness";
import { QC_RULES } from "../src/lib/domain/qc";
import { DEFAULT_EXPORT_PROFILES } from "../src/lib/domain/magento";
import { parseSize } from "../src/lib/domain/units";
import { slugify } from "../src/lib/domain/text";

const db = new PrismaClient();

interface SourceProduct {
  sku: string;
  nameEn: string;
  nameAr: string;
  rmsName: string | null;
  brand: string | null;
  volumeWeightEn: string | null;
  volumeWeightAr: string | null;
  weight: number | null;
  category: string | null;
  urlKey: string | null;
  visibility: string | null;
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Seoudi@2026";

const USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@seoudi.local", name: "Admin", role: "ADMIN" },
  { email: "ecom@seoudi.local", name: "E-commerce Specialist", role: "ECOMMERCE_SPECIALIST" },
  { email: "creator1@seoudi.local", name: "Content Creator 1", role: "CONTENT_CREATOR" },
  { email: "creator2@seoudi.local", name: "Content Creator 2", role: "CONTENT_CREATOR" },
  { email: "quality@seoudi.local", name: "Content Quality", role: "CONTENT_QUALITY" },
  { email: "viewer@seoudi.local", name: "Viewer", role: "VIEWER" },
];

const TOP_AR: Record<string, string> = {
  "Baby Care": "العناية بالطفل", Bakery: "المخبوزات", "Beauty and Personal Care": "الجمال والعناية الشخصية", Beverages: "المشروبات",
  "Chilled Food": "الأطعمة المبردة", "Cleaning and Household": "التنظيف والمنزل", "Cold Cuts & Deli": "اللحوم الباردة",
  "Dairy, Eggs & Cheese": "الألبان والبيض والجبن", "Electronics & Appliances": "الإلكترونيات والأجهزة", "Food Cupboard": "البقالة",
  "Frozen Food": "الأطعمة المجمدة", "Fruits & Vegetables": "الفواكه والخضروات", "Healthy & Nutrition": "الصحة والتغذية",
  "Home, Kitchen & Garden": "المنزل والمطبخ والحديقة", "Hot Drinks": "المشروبات الساخنة", "Meat, Poultry & Fishery": "اللحوم والدواجن والأسماك",
  "Pet Supplies": "مستلزمات الحيوانات الأليفة", "Seoudi Products": "منتجات سعودي", "Snacks & Sweets": "الوجبات الخفيفة والحلويات",
  "Summer Essentials": "مستلزمات الصيف", "Top Offers": "أفضل العروض", "Toys & Activities": "الألعاب والأنشطة", "Back To School": "العودة للمدارس",
};

// deterministic pseudo-random
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

const STATUS_PLAN: [WorkflowStatus, number][] = [
  ["NEW_IN_RMS", 14], ["RMS_QA", 8], ["READY_FOR_CONTENT", 14], ["CONTENT_IN_PROGRESS", 18], ["AWAITING_IMAGES", 12],
  ["READY_FOR_QC", 14], ["QC_IN_PROGRESS", 6], ["QC_APPROVED", 8], ["READY_FOR_MAGENTO", 10], ["MAGENTO_LINKED", 6],
  ["LIVE", 22], ["FINAL_REVIEW", 6], ["COMPLETED", 16], ["QC_REJECTED", 7], ["NEEDS_EDIT", 6], ["BLOCKED", 3],
  ["MISSING_DATA", 5], ["MISSING_IMAGES", 5], ["PROCUREMENT_FOLLOW_UP", 3],
];

const ORDER: WorkflowStatus[] = ["NEW_IN_RMS", "RMS_QA", "READY_FOR_CONTENT", "CONTENT_IN_PROGRESS", "AWAITING_IMAGES", "READY_FOR_QC",
  "QC_IN_PROGRESS", "QC_APPROVED", "READY_FOR_MAGENTO", "MAGENTO_LINKED", "LIVE", "FINAL_REVIEW", "COMPLETED"];
const level = (s: WorkflowStatus): number => {
  const i = ORDER.indexOf(s);
  if (i >= 0) return i;
  return { QC_REJECTED: 6, NEEDS_EDIT: 6, BLOCKED: 4, MISSING_DATA: 1, MISSING_IMAGES: 4, PROCUREMENT_FOLLOW_UP: 1 }[s as string] ?? 0;
};

/** Head noun of an English title: "B Natural Hot Pepper Honey - 450 g" -> "Honey". */
function productTypeFrom(nameEn: string, brand: string | null): string | null {
  let core = nameEn.split(" - ")[0].split(",")[0];
  if (brand && core.toLowerCase().startsWith(brand.toLowerCase())) core = core.slice(brand.length);
  core = core.split(/\bwith\b|\bfor\b|\bby\b/i)[0].trim();
  const words = core.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return words.length ? words[words.length - 1].replace(/[^A-Za-z-]/g, "") : null;
}

/** RMS-like abbreviated Arabic description when the source row has none. */
function rmsFrom(nameAr: string): string {
  return nameAr.replace(/\s+-\s+/g, " ").replace(/،/g, "").replace(/(\d)\s+(جم|مل|كجم|لتر|قطعة|قطع)/g, "$1$2").slice(0, 30).trim();
}

function descEn(p: SourceProduct, type: string | null): string {
  return `${p.nameEn.split(" - ")[0]} from ${p.brand ?? "a trusted brand"}. ${type ? `A quality ${type.toLowerCase()} ` : "A quality product "}selected by Seoudi Supermarket${p.volumeWeightEn ? `, supplied as ${p.volumeWeightEn}` : ""}.`;
}
function descAr(p: SourceProduct): string {
  return `${p.nameAr.split(" - ")[0]}. منتج مختار بعناية من سعودي سوبرماركت${p.volumeWeightAr ? `، العبوة ${p.volumeWeightAr}` : ""}.`;
}

async function main() {
  const dataDir = path.join(__dirname, "seed-data");
  const products: SourceProduct[] = JSON.parse(readFileSync(path.join(dataDir, "products.json"), "utf8"));
  const categoryPaths: string[] = JSON.parse(readFileSync(path.join(dataDir, "categories.json"), "utf8"));

  console.log("Clearing existing data…");
  await db.$transaction([
    db.auditLog.deleteMany(), db.mention.deleteMany(), db.comment.deleteMany(), db.qcFlag.deleteMany(), db.qcReview.deleteMany(),
    db.productImage.deleteMany(), db.rmsSnapshot.deleteMany(), db.magentoSnapshot.deleteMany(), db.productAttributeValue.deleteMany(),
    db.productCategory.deleteMany(), db.importRow.deleteMany(), db.importBatch.deleteMany(), db.product.deleteMany(),
    db.categoryAttribute.deleteMany(), db.attributeSetItem.deleteMany(), db.completenessRule.deleteMany(),
  ]);
  await db.category.updateMany({ data: { parentId: null, attributeSetId: null } });
  await db.$transaction([
    db.category.deleteMany(), db.attributeSet.deleteMany(), db.attributeDefinition.deleteMany(), db.brand.deleteMany(),
    db.savedView.deleteMany(), db.session.deleteMany(), db.user.deleteMany(), db.qcRule.deleteMany(),
    db.workflowTransitionRule.deleteMany(), db.exportProfile.deleteMany(), db.setting.deleteMany(),
  ]);

  console.log("Users…");
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: Record<string, { id: string; role: Role }> = {};
  for (const u of USERS) {
    const row = await db.user.create({ data: { ...u, passwordHash: hash } });
    users[u.email] = { id: row.id, role: row.role };
  }
  const creators = [users["creator1@seoudi.local"].id, users["creator2@seoudi.local"].id];
  const ecom = users["ecom@seoudi.local"].id;
  const quality = users["quality@seoudi.local"].id;
  const admin = users["admin@seoudi.local"].id;

  console.log("Configuration (workflow, QC, completeness, exports, settings)…");
  await db.workflowTransitionRule.createMany({
    data: DEFAULT_TRANSITIONS.map((t, i) => ({ ...t, validations: t.validations as string[], sortOrder: i })),
  });
  await db.qcRule.createMany({
    data: QC_RULES.map((r, i) => ({ code: r.code, name: r.name, description: r.description, severity: r.severity, fields: r.fields,
      config: (r.config ?? undefined) as Prisma.InputJsonValue | undefined, sortOrder: i })),
  });
  await db.completenessRule.createMany({ data: DEFAULT_COMPLETENESS_RULES.map((r) => ({ stage: r.stage, fieldKey: r.fieldKey, label: r.label })) });
  await db.exportProfile.createMany({
    data: DEFAULT_EXPORT_PROFILES.map((p) => ({ code: p.code, name: p.name, kind: p.kind, storeViewCode: p.storeViewCode, locale: p.locale,
      columns: p.columns as unknown as Prisma.InputJsonValue, options: (p.options ?? undefined) as Prisma.InputJsonValue | undefined })),
  });
  await db.setting.createMany({
    data: [
      { key: "storeViews", value: ["default", "ar_EG"] },
      { key: "visibilityOptions", value: ["Not Visible Individually", "Catalog", "Search", "Catalog, Search"] },
      { key: "metaSuffixEn", value: "Seoudi Supermarket" },
      { key: "metaSuffixAr", value: "سعودي سوبرماركت" },
      { key: "defaultVisibility", value: "Catalog, Search" },
      { key: "campaigns", value: ["Back to School", "Leaflet W40", "Summer Essentials", "Ramadan Prep"] },
    ],
  });

  console.log("Attributes & attribute sets…");
  const attrDefs: Prisma.AttributeDefinitionCreateInput[] = [
    { code: "storage_type", label: "Storage type", labelAr: "طريقة الحفظ", type: "DROPDOWN", group: "Food", magentoCode: "storage_type",
      options: [{ value: "AMBIENT", label: "Ambient" }, { value: "CHILLED", label: "Chilled" }, { value: "FROZEN", label: "Frozen" }] },
    { code: "is_organic", label: "Organic", labelAr: "عضوي", type: "BOOLEAN", group: "Food" },
    { code: "sugar_free", label: "Sugar free", labelAr: "خالي من السكر", type: "BOOLEAN", group: "Food" },
    { code: "dietary_tags", label: "Dietary tags", labelAr: "وسوم غذائية", type: "MULTISELECT", group: "Food",
      options: ["Vegan", "Vegetarian", "Gluten Free", "Lactose Free", "Keto", "High Protein"].map((v) => ({ value: v, label: v })) },
    { code: "material", label: "Material", labelAr: "الخامة", type: "DROPDOWN", group: "Home", magentoCode: "material",
      options: ["Plastic", "Stainless Steel", "Glass", "Ceramic", "Cotton", "Wood", "Aluminum", "Silicone"].map((v) => ({ value: v, label: v })) },
    { code: "capacity_l", label: "Capacity (L)", labelAr: "السعة (لتر)", type: "NUMBER", unit: "L", group: "Home", validation: { min: 0, max: 500 },
      helpText: "Container capacity – never used as physical weight" },
    { code: "dishwasher_safe", label: "Dishwasher safe", type: "BOOLEAN", group: "Home" },
    { code: "shade_number", label: "Shade number", labelAr: "رقم الدرجة", type: "TEXT", group: "Beauty", validation: { maxLength: 20 } },
    { code: "skin_type", label: "Skin type", labelAr: "نوع البشرة", type: "MULTISELECT", group: "Beauty",
      options: ["All", "Dry", "Oily", "Combination", "Sensitive"].map((v) => ({ value: v, label: v })) },
    { code: "hair_type", label: "Hair type", labelAr: "نوع الشعر", type: "DROPDOWN", group: "Beauty",
      options: ["All", "Dry", "Oily", "Curly", "Damaged", "Colored"].map((v) => ({ value: v, label: v })) },
    { code: "wattage", label: "Power (W)", labelAr: "القدرة (واط)", type: "NUMBER", unit: "W", group: "Electronics", validation: { min: 0, max: 5000 } },
    { code: "warranty_months", label: "Warranty (months)", type: "NUMBER", group: "Electronics", validation: { min: 0, max: 120 } },
    { code: "age_group", label: "Age group", labelAr: "الفئة العمرية", type: "DROPDOWN", group: "Kids",
      options: ["0-3", "3-6", "6-12", "12+"].map((v) => ({ value: v, label: v })) },
    { code: "launch_date", label: "Launch date", type: "DATE", group: "Operations" },
  ];
  const attrs: Record<string, string> = {};
  for (const [i, a] of attrDefs.entries()) attrs[a.code] = (await db.attributeDefinition.create({ data: { ...a, sortOrder: i } })).id;

  const sets = [
    { code: "FOOD", name: "Food & Beverage", items: [["storage_type", true], ["is_organic", false], ["sugar_free", false], ["dietary_tags", false]] },
    { code: "HOME", name: "Home & Kitchen", items: [["material", true], ["capacity_l", false], ["dishwasher_safe", false]] },
    { code: "BEAUTY", name: "Beauty & Personal Care", items: [["skin_type", false], ["hair_type", false], ["shade_number", false]] },
    { code: "ELECTRONICS", name: "Electronics & Appliances", items: [["wattage", true], ["warranty_months", false]] },
    { code: "GENERAL", name: "General merchandise", items: [["age_group", false], ["launch_date", false]] },
  ] as const;
  const setIds: Record<string, string> = {};
  for (const s of sets) {
    const row = await db.attributeSet.create({ data: { code: s.code, name: s.name, magentoCode: "Default" } });
    setIds[s.code] = row.id;
    await db.attributeSetItem.createMany({ data: s.items.map(([code, required], i) => ({ attributeSetId: row.id, attributeId: attrs[code], required, sortOrder: i })) });
  }
  const setForTop = (top: string): string => {
    if (/Home|Cleaning|Summer/.test(top)) return setIds.HOME;
    if (/Beauty|Baby/.test(top)) return setIds.BEAUTY;
    if (/Electronics/.test(top)) return setIds.ELECTRONICS;
    if (/Toys|School|Top Offers|Pet/.test(top)) return setIds.GENERAL;
    return setIds.FOOD;
  };

  console.log(`Taxonomy (${categoryPaths.length} nodes)…`);
  const catIds: Record<string, string> = {};
  for (const [i, p] of categoryPaths.entries()) {
    const parts = p.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const row = await db.category.create({
      data: {
        name: parts[parts.length - 1], nameAr: parts.length === 1 ? TOP_AR[parts[0]] ?? null : null, path: p, depth: parts.length - 1,
        parentId: parentPath ? catIds[parentPath] : null, sortOrder: i, attributeSetId: parts.length === 1 ? setForTop(parts[0]) : null,
      },
    });
    catIds[p] = row.id;
  }
  if (catIds["Electronics & Appliances"]) {
    await db.categoryAttribute.create({ data: { categoryId: catIds["Electronics & Appliances"], attributeId: attrs.wattage, required: true } });
  }
  if (catIds["Beauty and Personal Care/Hair Care"]) {
    await db.categoryAttribute.create({ data: { categoryId: catIds["Beauty and Personal Care/Hair Care"], attributeId: attrs.hair_type, required: true } });
  }
  if (catIds["Dairy, Eggs & Cheese"]) {
    await db.completenessRule.create({ data: { stage: "CONTENT", fieldKey: "origin", label: "Country of origin (dairy)", categoryId: catIds["Dairy, Eggs & Cheese"] } });
  }

  console.log("Brands…");
  const brandIds: Record<string, string> = {};
  for (const b of Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[]))) {
    brandIds[b] = (await db.brand.create({ data: { name: b } })).id;
  }

  console.log(`Products (${products.length})…`);
  const plan: WorkflowStatus[] = [];
  for (const [s, n] of STATUS_PLAN) for (let i = 0; i < n; i++) plan.push(s);
  const campaigns = ["Back to School", "Leaflet W40", "Summer Essentials", null, null, null];
  const priorities: Priority[] = ["LOW", "NORMAL", "NORMAL", "NORMAL", "HIGH", "URGENT"];
  const today = new Date();
  const days = (n: number) => new Date(today.getTime() + n * 86400_000);

  for (const [idx, src] of products.entries()) {
    const status = plan[idx % plan.length];
    const lv = level(status);
    const hasContent = lv >= 3;
    const fullContent = lv >= 4 || ["QC_REJECTED", "NEEDS_EDIT"].includes(status);
    const hasImages = lv >= 5 && status !== "MISSING_IMAGES";
    const magentoReady = lv >= 8;
    const type = productTypeFrom(src.nameEn, src.brand);
    const size = parseSize(src.volumeWeightEn || src.volumeWeightAr);
    const topCat = src.category?.split("/")[0];
    const ownerId = lv <= 1 ? ecom : pick(creators);
    const created = days(-Math.floor(rnd() * 40) - 3);
    const imageStatus: ImageStatus = hasImages ? "READY"
      : status === "MISSING_IMAGES" ? "MISSING"
      : status === "AWAITING_IMAGES" ? pick(["REQUESTED", "IN_PHOTOGRAPHY", "AVAILABLE"] as ImageStatus[])
      : lv >= 3 ? "REQUESTED" : "NOT_REQUESTED";
    const rmsName = src.rmsName ?? rmsFrom(src.nameAr);
    // weights: keep the workbook value (which sometimes converted volume -> weight; QC will flag those)
    const product = await db.product.create({
      data: {
        sku: src.sku,
        barcode: /^\d{8,14}$/.test(src.sku) ? src.sku : null,
        rmsName,
        rmsBrand: src.brand?.toUpperCase() ?? null,
        rmsCategory: topCat ?? null,
        brandId: src.brand && lv >= 2 ? brandIds[src.brand] : null,
        productType: hasContent ? type : null,
        nameEn: hasContent ? src.nameEn : null,
        nameAr: fullContent ? src.nameAr : null,
        descriptionEn: fullContent && rnd() > 0.1 ? descEn(src, type) : null,
        descriptionAr: fullContent && rnd() > 0.15 ? descAr(src) : null,
        volumeWeightEn: hasContent ? src.volumeWeightEn : null,
        volumeWeightAr: fullContent ? src.volumeWeightAr : null,
        sizeKind: size.ok ? size.kind : null,
        sizeValue: size.ok ? size.value : null,
        sizeUnit: size.ok ? size.unit : null,
        packCount: size.ok && size.isPack ? size.packCount : null,
        packExpression: size.ok && size.isPack ? size.expression : null,
        weightKg: fullContent ? src.weight : null,
        primaryCategoryId: src.category && lv >= 2 ? catIds[src.category] ?? null : null,
        attributeSetId: topCat ? setForTop(topCat) : null,
        visibility: src.visibility === "Search" ? "Search" : "Catalog, Search",
        metaTitleEn: magentoReady ? `${src.nameEn} | Seoudi Supermarket` : null,
        metaTitleAr: magentoReady ? `${src.nameAr} | سعودي سوبرماركت` : null,
        metaDescriptionEn: lv >= 10 && rnd() > 0.4 ? `Shop ${src.nameEn} online at Seoudi Supermarket with fast delivery.` : null,
        metaDescriptionAr: lv >= 10 && rnd() > 0.5 ? `اشتري ${src.nameAr} أونلاين من سعودي سوبرماركت مع توصيل سريع.` : null,
        urlKey: magentoReady ? src.urlKey ?? slugify(src.nameEn) : null,
        productOnline: lv >= 10,
        magentoId: lv >= 9 ? 100000 + idx : null,
        magentoLinkedAt: lv >= 9 ? days(-5) : null,
        liveAt: lv >= 10 ? days(-3) : null,
        completedAt: status === "COMPLETED" ? days(-1) : null,
        status,
        previousStatus: status === "BLOCKED" ? "CONTENT_IN_PROGRESS" : null,
        statusChangedAt: days(-Math.floor(rnd() * 6)),
        imageStatus,
        priority: pick(priorities),
        campaign: pick(campaigns),
        dueDate: lv < 10 ? days(Math.floor(rnd() * 14) - 5) : null,
        ownerId,
        qcReviewerId: lv >= 6 ? quality : null,
        createdAt: created,
        categories: src.category && lv >= 2 && topCat === "Top Offers" && catIds["Top Offers"]
          ? { create: [{ categoryId: catIds["Top Offers"] }] } : undefined,
      },
    });

    if (imageStatus !== "NOT_REQUESTED") {
      await db.productImage.create({
        data: {
          productId: product.id, role: "MAIN", status: imageStatus,
          url: ["READY", "AVAILABLE"].includes(imageStatus) ? `/api/placeholder/${src.sku}` : null,
          altEn: hasContent ? src.nameEn : null, altAr: fullContent ? src.nameAr : null,
        },
      });
      if (hasImages && rnd() > 0.5) {
        await db.productImage.create({ data: { productId: product.id, role: "ADDITIONAL", status: "READY", url: `/api/placeholder/${src.sku}?v=2`, sortOrder: 1 } });
      }
    }

    // attribute values for some products
    if (fullContent && topCat && setForTop(topCat) === setIds.FOOD) {
      await db.productAttributeValue.create({ data: { productId: product.id, attributeId: attrs.storage_type, valueText: /Frozen/.test(topCat) ? "FROZEN" : /Dairy|Chilled|Cold/.test(topCat) ? "CHILLED" : "AMBIENT" } });
    }
    if (fullContent && topCat && setForTop(topCat) === setIds.HOME && rnd() > 0.3) {
      const mat = /Glass/i.test(src.nameEn) ? "Glass" : /Steel/i.test(src.nameEn) ? "Stainless Steel" : /Towel|Cotton/i.test(src.nameEn) ? "Cotton" : "Plastic";
      await db.productAttributeValue.create({ data: { productId: product.id, attributeId: attrs.material, valueText: mat } });
      const cap = parseSize(src.nameEn.match(/(\d+(?:\.\d+)?)\s*(Liters?|ml)\b/i)?.[0] ?? "");
      if (cap.ok && cap.kind === "VOLUME" && cap.baseTotal) {
        await db.productAttributeValue.create({ data: { productId: product.id, attributeId: attrs.capacity_l, valueNumber: cap.baseTotal } });
      }
    }

    // RMS snapshot
    const rmsData = { sku: src.sku, barcode: product.barcode, rmsName, rmsBrand: product.rmsBrand, rmsCategory: product.rmsCategory };
    await db.rmsSnapshot.create({ data: { productId: product.id, data: rmsData, hash: JSON.stringify(rmsData).length.toString(16) } });

    // Magento snapshots for linked/live items (some drift to demonstrate comparison)
    if (lv >= 9) {
      const drift = rnd() < 0.2;
      await db.magentoSnapshot.create({
        data: { productId: product.id, storeViewCode: "default", source: "import", data: {
          nameEn: drift ? src.nameEn.replace(" - ", " ") : src.nameEn, volumeWeightEn: src.volumeWeightEn, weightKg: src.weight,
          urlKey: product.urlKey, visibility: product.visibility, productOnline: lv >= 10, metaTitleEn: product.metaTitleEn, brand: src.brand,
          categories: src.category ? [src.category] : [],
        } },
      });
      await db.magentoSnapshot.create({
        data: { productId: product.id, storeViewCode: "ar_EG", source: "import", data: {
          nameAr: src.nameAr, volumeWeightAr: src.volumeWeightAr, metaTitleAr: rnd() < 0.15 ? product.metaTitleEn : product.metaTitleAr,
        } },
      });
    }

    // audit history
    const history: Prisma.AuditLogCreateManyInput[] = [
      { entityType: "Product", entityId: product.id, productId: product.id, actorId: ecom, action: "CREATE", source: "IMPORT", reason: "RMS intake", createdAt: created },
    ];
    let prev: WorkflowStatus = "NEW_IN_RMS";
    const pathTo = ORDER.slice(1, Math.min(level(status), 12) + 1);
    for (const [i, s] of pathTo.entries()) {
      if (s === status && !ORDER.includes(status)) break;
      history.push({ entityType: "Product", entityId: product.id, productId: product.id, actorId: i < 2 ? ecom : i < 5 ? ownerId : i < 8 ? quality : ecom,
        action: "STATUS_CHANGE", field: "status", oldValue: prev, newValue: s, source: "WORKFLOW", createdAt: new Date(created.getTime() + (i + 1) * 3600_000 * 9) });
      prev = s;
    }
    if (!ORDER.includes(status)) {
      history.push({ entityType: "Product", entityId: product.id, productId: product.id, actorId: status.startsWith("QC") || status === "NEEDS_EDIT" ? quality : ecom,
        action: "STATUS_CHANGE", field: "status", oldValue: prev, newValue: status, source: "WORKFLOW", reason: "See comments", createdAt: days(-1) });
    }
    if (hasContent) {
      history.push({ entityType: "Product", entityId: product.id, productId: product.id, actorId: ownerId, action: "UPDATE", field: "nameEn",
        oldValue: null, newValue: src.nameEn, source: "UI", createdAt: new Date(created.getTime() + 86400_000) });
    }
    await db.auditLog.createMany({ data: history });

    // QC feedback for rejected / needs edit items
    if (status === "QC_REJECTED" || status === "NEEDS_EDIT") {
      const field = pick(["nameAr", "nameEn", "volumeWeightAr", "descriptionEn"]);
      const msg = { nameAr: "Arabic title does not match the English meaning – please revise", nameEn: "Title should follow Brand + Type + Variant - Size",
        volumeWeightAr: "Arabic size unit should be جم / مل", descriptionEn: "Description is generic – add product-specific details" }[field]!;
      await db.qcReview.create({ data: { productId: product.id, reviewerId: quality, decision: status === "QC_REJECTED" ? "REJECTED" : "NEEDS_EDIT",
        outcome: "ERROR", score: 60, notes: msg, checklist: { title_en: field !== "nameEn", title_ar: field !== "nameAr", size: field !== "volumeWeightAr" } } });
      await db.qcFlag.create({ data: { productId: product.id, fieldKey: field, message: msg, severity: "ERROR", createdById: quality } });
      const c = await db.comment.create({ data: { productId: product.id, fieldKey: field, body: `@Content Creator ${msg}`, authorId: quality } });
      await db.mention.create({ data: { commentId: c.id, userId: ownerId } });
    }
    if (status === "BLOCKED") {
      await db.comment.create({ data: { productId: product.id, body: "Blocked: supplier to confirm final pack size before content continues.", authorId: ecom } });
    }
    if (status === "PROCUREMENT_FOLLOW_UP") {
      await db.comment.create({ data: { productId: product.id, fieldKey: "rmsName", body: "RMS description is truncated – procurement asked for the full supplier name.", authorId: ecom } });
    }
    if (rnd() < 0.08) {
      const c = await db.comment.create({ data: { productId: product.id, body: "Please double-check the category – could also fit under Top Offers.", authorId: admin, resolved: rnd() < 0.5, resolvedById: admin } });
      await db.mention.create({ data: { commentId: c.id, userId: ecom } });
    }
  }

  console.log("Saved views…");
  const views: [string, string][] = [
    ["New products", "status=NEW_IN_RMS,RMS_QA"],
    ["My products", "owner=me"],
    ["Missing Arabic", "missing=nameAr"],
    ["Missing English", "missing=nameEn"],
    ["Missing category", "missing=primaryCategoryId"],
    ["Missing images", "images=NOT_REQUESTED,REQUESTED,IN_PHOTOGRAPHY,MISSING,REJECTED"],
    ["Ready for QC", "status=READY_FOR_QC"],
    ["QC rejected", "status=QC_REJECTED,NEEDS_EDIT"],
    ["QC approved", "status=QC_APPROVED"],
    ["Ready for Magento", "status=READY_FOR_MAGENTO"],
    ["Live", "status=LIVE"],
    ["Final review", "status=FINAL_REVIEW"],
    ["Blocked", "status=BLOCKED,MISSING_DATA,PROCUREMENT_FOLLOW_UP"],
    ["QC errors", "qc=ERROR"],
    ["Overdue", "overdue=1"],
  ];
  await db.savedView.createMany({ data: views.map(([name, query], i) => ({ name, query, isSystem: true, shared: true, sortOrder: i })) });

  console.log("Seed data created.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

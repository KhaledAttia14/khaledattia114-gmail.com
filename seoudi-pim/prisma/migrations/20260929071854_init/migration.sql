-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ECOMMERCE_SPECIALIST', 'CONTENT_CREATOR', 'CONTENT_QUALITY', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('NEW_IN_RMS', 'RMS_QA', 'READY_FOR_CONTENT', 'CONTENT_IN_PROGRESS', 'AWAITING_IMAGES', 'READY_FOR_QC', 'QC_IN_PROGRESS', 'QC_APPROVED', 'READY_FOR_MAGENTO', 'MAGENTO_LINKED', 'LIVE', 'FINAL_REVIEW', 'COMPLETED', 'QC_REJECTED', 'NEEDS_EDIT', 'BLOCKED', 'MISSING_DATA', 'MISSING_IMAGES', 'PROCUREMENT_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'IN_PHOTOGRAPHY', 'AVAILABLE', 'REJECTED', 'MISSING', 'READY');

-- CreateEnum
CREATE TYPE "QcOutcome" AS ENUM ('PASS', 'WARNING', 'ERROR', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('TEXT', 'NUMBER', 'DROPDOWN', 'MULTISELECT', 'BOOLEAN', 'DATE');

-- CreateEnum
CREATE TYPE "SizeKind" AS ENUM ('WEIGHT', 'VOLUME', 'COUNT', 'LENGTH', 'AREA', 'POWER', 'OTHER');

-- CreateEnum
CREATE TYPE "ImageRole" AS ENUM ('MAIN', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('UI', 'IMPORT', 'SYSTEM', 'WORKFLOW', 'QC', 'BULK', 'EXPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "magentoId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attributeSetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "type" "AttributeType" NOT NULL,
    "options" JSONB,
    "unit" TEXT,
    "localized" BOOLEAN NOT NULL DEFAULT false,
    "group" TEXT NOT NULL DEFAULT 'Specifications',
    "magentoCode" TEXT,
    "helpText" TEXT,
    "validation" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeSet" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "magentoCode" TEXT NOT NULL DEFAULT 'Default',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeSetItem" (
    "id" TEXT NOT NULL,
    "attributeSetId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttribute" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "rmsName" TEXT,
    "rmsBrand" TEXT,
    "rmsCategory" TEXT,
    "brandId" TEXT,
    "productLine" TEXT,
    "productType" TEXT,
    "nameEn" TEXT,
    "nameAr" TEXT,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "shortDescriptionEn" TEXT,
    "shortDescriptionAr" TEXT,
    "volumeWeightEn" TEXT,
    "volumeWeightAr" TEXT,
    "sizeKind" "SizeKind",
    "sizeValue" DOUBLE PRECISION,
    "sizeUnit" TEXT,
    "packCount" INTEGER,
    "packExpression" TEXT,
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "model" TEXT,
    "color" TEXT,
    "flavor" TEXT,
    "variant" TEXT,
    "origin" TEXT,
    "primaryCategoryId" TEXT,
    "attributeSetId" TEXT,
    "storeViewCode" TEXT NOT NULL DEFAULT 'default',
    "magentoProductType" TEXT NOT NULL DEFAULT 'simple',
    "attributeSetCode" TEXT NOT NULL DEFAULT 'Default',
    "visibility" TEXT NOT NULL DEFAULT 'Catalog, Search',
    "productOnline" BOOLEAN NOT NULL DEFAULT false,
    "metaTitleEn" TEXT,
    "metaTitleAr" TEXT,
    "metaDescriptionEn" TEXT,
    "metaDescriptionAr" TEXT,
    "urlKey" TEXT,
    "relatedSkus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "crosssellSkus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "upsellSkus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "additionalAttributes" TEXT,
    "magentoId" INTEGER,
    "magentoLinkedAt" TIMESTAMP(3),
    "status" "WorkflowStatus" NOT NULL DEFAULT 'NEW_IN_RMS',
    "previousStatus" "WorkflowStatus",
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageStatus" "ImageStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "qcOutcome" "QcOutcome",
    "qcScore" INTEGER,
    "qcCheckedAt" TIMESTAMP(3),
    "completeness" INTEGER NOT NULL DEFAULT 0,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "campaign" TEXT,
    "dueDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "qcReviewerId" TEXT,
    "notes" TEXT,
    "liveAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'all',
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT,
    "role" "ImageRole" NOT NULL DEFAULT 'ADDITIONAL',
    "status" "ImageStatus" NOT NULL DEFAULT 'REQUESTED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altEn" TEXT,
    "altAr" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RmsSnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "data" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagentoSnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeViewCode" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'import',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagentoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldKey" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "outcome" "QcOutcome" NOT NULL,
    "score" INTEGER,
    "checklist" JSONB,
    "ruleResults" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcFlag" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "QcOutcome" NOT NULL DEFAULT 'ERROR',
    "suspected" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "severity" "QcOutcome" NOT NULL DEFAULT 'WARNING',
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletenessRule" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT,
    "attributeSetId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompletenessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransitionRule" (
    "id" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allowedRoles" "Role"[],
    "validations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasonRequired" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkflowTransitionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "productId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "source" "AuditSource" NOT NULL DEFAULT 'UI',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "headers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mapping" JSONB,
    "sheetName" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT,
    "raw" JSONB NOT NULL,
    "action" TEXT,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diff" JSONB,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportProfile" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storeViewCode" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "columns" JSONB NOT NULL,
    "options" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "query" TEXT NOT NULL,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_path_key" ON "Category"("path");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_code_key" ON "AttributeDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeSet_code_key" ON "AttributeSet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeSetItem_attributeSetId_attributeId_key" ON "AttributeSetItem"("attributeSetId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAttribute_categoryId_attributeId_key" ON "CategoryAttribute"("categoryId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_ownerId_idx" ON "Product"("ownerId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_primaryCategoryId_idx" ON "Product"("primaryCategoryId");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_urlKey_idx" ON "Product"("urlKey");

-- CreateIndex
CREATE INDEX "Product_dueDate_idx" ON "Product"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeId_locale_key" ON "ProductAttributeValue"("productId", "attributeId", "locale");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "RmsSnapshot_productId_createdAt_idx" ON "RmsSnapshot"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "MagentoSnapshot_productId_storeViewCode_createdAt_idx" ON "MagentoSnapshot"("productId", "storeViewCode", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_productId_idx" ON "Comment"("productId");

-- CreateIndex
CREATE INDEX "Mention_userId_seen_idx" ON "Mention"("userId", "seen");

-- CreateIndex
CREATE INDEX "QcReview_productId_idx" ON "QcReview"("productId");

-- CreateIndex
CREATE INDEX "QcFlag_productId_resolved_idx" ON "QcFlag"("productId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "QcRule_code_key" ON "QcRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CompletenessRule_stage_fieldKey_categoryId_attributeSetId_key" ON "CompletenessRule"("stage", "fieldKey", "categoryId", "attributeSetId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransitionRule_fromStatus_toStatus_key" ON "WorkflowTransitionRule"("fromStatus", "toStatus");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_productId_createdAt_idx" ON "AuditLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_rowNumber_idx" ON "ImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExportProfile_code_key" ON "ExportProfile"("code");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_attributeSetId_fkey" FOREIGN KEY ("attributeSetId") REFERENCES "AttributeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeSetItem" ADD CONSTRAINT "AttributeSetItem_attributeSetId_fkey" FOREIGN KEY ("attributeSetId") REFERENCES "AttributeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeSetItem" ADD CONSTRAINT "AttributeSetItem_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_attributeSetId_fkey" FOREIGN KEY ("attributeSetId") REFERENCES "AttributeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_qcReviewerId_fkey" FOREIGN KEY ("qcReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RmsSnapshot" ADD CONSTRAINT "RmsSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagentoSnapshot" ADD CONSTRAINT "MagentoSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcReview" ADD CONSTRAINT "QcReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcReview" ADD CONSTRAINT "QcReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcFlag" ADD CONSTRAINT "QcFlag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcFlag" ADD CONSTRAINT "QcFlag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

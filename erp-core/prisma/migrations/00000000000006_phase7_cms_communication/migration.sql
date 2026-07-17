-- Amal ERP Core - Phase 7: CMS & Communication Center (FRS-009/010)
-- Content lifecycle with immutable revisions; bulk messaging over the central
-- notification engine. Archive-only (Art. 4.4); binaries via StoredFile ids (Art. 3.5).

CREATE TYPE "ContentType" AS ENUM ('PAGE', 'NEWS', 'ARTICLE');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
CREATE TYPE "BannerPlacement" AS ENUM ('WEBSITE', 'APP', 'CAMPAIGN', 'EVENT');
CREATE TYPE "AudienceType" AS ENUM ('ALL_USERS', 'ROLE', 'DONORS', 'VOLUNTEERS', 'SUBSCRIBERS');
CREATE TYPE "CommCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "content_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "content_categories_slug_key" ON "content_categories"("slug");

CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "featuredImageFileId" TEXT,
    "categoryId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "showInApp" BOOLEAN NOT NULL DEFAULT false,
    "showInWebsite" BOOLEAN NOT NULL DEFAULT true,
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ogImageFileId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "content_items_type_slug_key" ON "content_items"("type", "slug");
CREATE INDEX "content_items_type_status_idx" ON "content_items"("type", "status");
CREATE INDEX "content_items_status_publishAt_idx" ON "content_items"("status", "publishAt");
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "content_revisions" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "content_revisions_contentId_version_key" ON "content_revisions"("contentId", "version");
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageFileId" TEXT NOT NULL,
    "linkUrl" TEXT,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'WEBSITE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "banners_placement_active_idx" ON "banners"("placement", "active");

CREATE TABLE "popups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageFileId" TEXT,
    "linkUrl" TEXT,
    "showInApp" BOOLEAN NOT NULL DEFAULT true,
    "showInWebsite" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "popups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "menus_key_key" ON "menus"("key");

CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "url" TEXT,
    "contentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "menu_items_menuId_order_idx" ON "menu_items"("menuId", "order");
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "featured_campaigns" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "featured_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "featured_campaigns_campaignId_key" ON "featured_campaigns"("campaignId");
CREATE INDEX "featured_campaigns_visible_order_idx" ON "featured_campaigns"("visible", "order");

CREATE TABLE "communication_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "audienceType" "AudienceType" NOT NULL,
    "audienceFilter" JSONB,
    "status" "CommCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "communication_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "communication_campaigns_status_idx" ON "communication_campaigns"("status");

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AudienceType" NOT NULL DEFAULT 'ALL_USERS',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "announcements_active_idx" ON "announcements"("active");

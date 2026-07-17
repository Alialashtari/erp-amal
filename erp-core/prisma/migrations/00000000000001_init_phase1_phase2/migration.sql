-- Amal ERP Core - initial migration (Phase 1 + Phase 2)
-- Covers: identity, authorization, audit, configuration, crm, storage, notification.
-- Note: if `prisma migrate dev` reports drift against the schema, regenerate this
-- migration with `npx prisma migrate dev --name init` on a machine with engine access;
-- the schema.prisma file is the source of truth.

-- Enums
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED', 'ARCHIVED');
CREATE TYPE "VerificationType" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'MFA_OTP');
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'MERGED');
CREATE TYPE "SourceSystem" AS ENUM ('ERP', 'MOBILE', 'WEBSITE', 'BOXES', 'MANUAL', 'GATEWAY');
CREATE TYPE "PersonRoleType" AS ENUM ('DONOR', 'SUBSCRIBER', 'BENEFICIARY', 'PATIENT', 'VOLUNTEER', 'EMPLOYEE', 'COLLECTOR', 'BOX_OWNER', 'PARTNER', 'SUPPLIER');
CREATE TYPE "ContactType" AS ENUM ('PHONE', 'SECONDARY_PHONE', 'EMAIL', 'WHATSAPP', 'TELEGRAM');
CREATE TYPE "RelationshipType" AS ENUM ('SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GUARDIAN', 'SPONSOR', 'FAMILY', 'OTHER');
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- identity
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "personId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT,
    "name" TEXT,
    "fcmToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verification_codes_userId_type_idx" ON "verification_codes"("userId", "type");

-- authorization
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "scope_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scope_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scope_rules_userId_idx" ON "scope_rules"("userId");

-- audit (append-only)
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_module_action_idx" ON "audit_logs"("module", "action");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- configuration
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- crm
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "personNumber" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "shortName" TEXT,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "maritalStatus" TEXT,
    "nationality" TEXT,
    "nationalId" TEXT,
    "occupation" TEXT,
    "notes" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "mergedIntoId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "persons_personNumber_key" ON "persons"("personNumber");
CREATE UNIQUE INDEX "persons_nationalId_key" ON "persons"("nationalId");
CREATE INDEX "persons_fullName_idx" ON "persons"("fullName");
CREATE INDEX "persons_status_idx" ON "persons"("status");

CREATE TABLE "person_roles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleType" "PersonRoleType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "person_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "person_roles_personId_roleType_key" ON "person_roles"("personId", "roleType");

CREATE TABLE "contact_infos" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_infos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contact_infos_value_idx" ON "contact_infos"("value");
CREATE INDEX "contact_infos_personId_idx" ON "contact_infos"("personId");

CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Iraq',
    "governorate" TEXT,
    "city" TEXT,
    "area" TEXT,
    "addressLine" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "addresses_personId_idx" ON "addresses"("personId");
CREATE INDEX "addresses_governorate_idx" ON "addresses"("governorate");

CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

CREATE TABLE "person_tags" (
    "personId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "person_tags_pkey" PRIMARY KEY ("personId", "tagId")
);

CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "relatedPersonId" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "relationships_personId_relatedPersonId_type_key" ON "relationships"("personId", "relatedPersonId", "type");

CREATE TABLE "person_identity_links" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sourceSystem" "SourceSystem" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "person_identity_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "person_identity_links_sourceSystem_externalUserId_key" ON "person_identity_links"("sourceSystem", "externalUserId");
CREATE INDEX "person_identity_links_personId_idx" ON "person_identity_links"("personId");

CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "timeline_events_personId_occurredAt_idx" ON "timeline_events"("personId", "occurredAt");

CREATE TABLE "merge_records" (
    "id" TEXT NOT NULL,
    "primaryPersonId" TEXT NOT NULL,
    "mergedPersonId" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    CONSTRAINT "merge_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "merge_records_primaryPersonId_idx" ON "merge_records"("primaryPersonId");
CREATE INDEX "merge_records_mergedPersonId_idx" ON "merge_records"("mergedPersonId");

-- storage
CREATE TABLE "storage_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "module" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_folders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storage_folders_parentId_name_key" ON "storage_folders"("parentId", "name");

CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "module" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stored_files_objectKey_key" ON "stored_files"("objectKey");
CREATE UNIQUE INDEX "stored_files_previousVersionId_key" ON "stored_files"("previousVersionId");
CREATE INDEX "stored_files_module_idx" ON "stored_files"("module");

CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "attachedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attachments_entityType_entityId_idx" ON "attachments"("entityType", "entityId");
CREATE INDEX "attachments_fileId_idx" ON "attachments"("fileId");

-- notification
CREATE TABLE "notification_templates" (
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "notification_records" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientUserId" TEXT,
    "recipientPersonId" TEXT,
    "recipientAddress" TEXT,
    "templateKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_records_recipientUserId_status_idx" ON "notification_records"("recipientUserId", "status");
CREATE INDEX "notification_records_status_idx" ON "notification_records"("status");

CREATE TABLE "delivery_logs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "delivery_logs_notificationId_idx" ON "delivery_logs"("notificationId");

-- Foreign keys
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persons" ADD CONSTRAINT "persons_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_infos" ADD CONSTRAINT "contact_infos_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_tags" ADD CONSTRAINT "person_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_relatedPersonId_fkey" FOREIGN KEY ("relatedPersonId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_identity_links" ADD CONSTRAINT "person_identity_links_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storage_folders" ADD CONSTRAINT "storage_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "storage_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "storage_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Amal ERP Core - Phase 6: Workflow Engine (ADR-015), Medical (FRS-006),
-- Projects & Programs (FRS-007), Volunteers (FRS-008 volunteer scope).

CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "WorkflowActionType" AS ENUM ('APPROVE', 'REJECT', 'RETURN', 'COMMENT', 'CANCEL');
CREATE TYPE "MedicalCaseType" AS ENUM ('SURGERY', 'TREATMENT', 'MEDICATION', 'EQUIPMENT', 'TESTS', 'PHYSIOTHERAPY', 'OTHER');
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "MedicalCaseStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'AWAITING_DOCUMENTS', 'APPROVED', 'FUNDING', 'IN_TREATMENT', 'COMPLETED', 'REJECTED', 'CLOSED');
CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "ActivityType" AS ENUM ('GENERAL', 'LECTURE', 'WORKSHOP', 'TRIP', 'COMPETITION', 'EVENT', 'COURSE', 'CAMP', 'MEETING');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ParticipantRole" AS ENUM ('PARTICIPANT', 'VOLUNTEER', 'ORGANIZER', 'TRAINER', 'GUEST');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'WITHDRAWN');
CREATE TYPE "VolunteerStatus" AS ENUM ('APPLICANT', 'REVIEW', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "HoursStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- workflow
CREATE TABLE "workflow_definitions" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "workflow_step_defs" (
    "id" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "slaHours" INTEGER,
    "escalationPermission" TEXT,
    CONSTRAINT "workflow_step_defs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_step_defs_definitionKey_sequence_key" ON "workflow_step_defs"("definitionKey", "sequence");

CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStepSequence" INTEGER NOT NULL DEFAULT 1,
    "startedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_instances_definitionKey_entityType_entityId_key" ON "workflow_instances"("definitionKey", "entityType", "entityId");
CREATE INDEX "workflow_instances_status_currentStepSequence_idx" ON "workflow_instances"("status", "currentStepSequence");

CREATE TABLE "workflow_actions" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepSequence" INTEGER NOT NULL,
    "action" "WorkflowActionType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workflow_actions_instanceId_idx" ON "workflow_actions"("instanceId");

-- medical
CREATE TABLE "medical_cases" (
    "id" TEXT NOT NULL,
    "caseNumber" SERIAL NOT NULL,
    "patientPersonId" TEXT NOT NULL,
    "type" "MedicalCaseType" NOT NULL,
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MedicalCaseStatus" NOT NULL DEFAULT 'NEW',
    "diagnosis" TEXT,
    "hospital" TEXT,
    "doctorName" TEXT,
    "requiredAmountIqd" DECIMAL(18,2),
    "campaignId" TEXT,
    "assignedOfficerId" TEXT,
    "workflowInstanceId" TEXT,
    "rejectionReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "sourceSystem" "SourceSystem" NOT NULL DEFAULT 'ERP',
    "externalId" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medical_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medical_cases_caseNumber_key" ON "medical_cases"("caseNumber");
CREATE UNIQUE INDEX "medical_cases_workflowInstanceId_key" ON "medical_cases"("workflowInstanceId");
CREATE UNIQUE INDEX "medical_cases_idempotencyKey_key" ON "medical_cases"("idempotencyKey");
CREATE UNIQUE INDEX "medical_cases_sourceSystem_externalId_key" ON "medical_cases"("sourceSystem", "externalId");
CREATE INDEX "medical_cases_patientPersonId_idx" ON "medical_cases"("patientPersonId");
CREATE INDEX "medical_cases_status_priority_idx" ON "medical_cases"("status", "priority");

CREATE TABLE "medical_treatments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "treatmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costIqd" DECIMAL(18,2),
    "transactionId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "medical_treatments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medical_treatments_transactionId_key" ON "medical_treatments"("transactionId");
CREATE INDEX "medical_treatments_caseId_idx" ON "medical_treatments"("caseId");

-- projects
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "managerId" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "projectNumber" SERIAL NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "category" TEXT,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "managerId" TEXT,
    "budgetIqd" DECIMAL(18,2),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "projects_projectNumber_key" ON "projects"("projectNumber");
CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE INDEX "projects_programId_idx" ON "projects"("programId");

CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL DEFAULT 'GENERAL',
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activities_projectId_idx" ON "activities"("projectId");

CREATE TABLE "project_tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedToPersonId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_tasks_projectId_status_idx" ON "project_tasks"("projectId", "status");
CREATE INDEX "project_tasks_assignedToPersonId_idx" ON "project_tasks"("assignedToPersonId");

CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredBy" TEXT,
    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "participants_projectId_personId_key" ON "participants"("projectId", "personId");
CREATE INDEX "participants_personId_idx" ON "participants"("personId");

CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_records_activityId_personId_key" ON "attendance_records"("activityId", "personId");

CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "certificateNumber" SERIAL NOT NULL,
    "personId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "verificationCode" TEXT NOT NULL,
    "pdfFileId" TEXT,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");
CREATE UNIQUE INDEX "certificates_verificationCode_key" ON "certificates"("verificationCode");
CREATE INDEX "certificates_personId_idx" ON "certificates"("personId");

-- volunteers
CREATE TABLE "volunteer_profiles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "VolunteerStatus" NOT NULL DEFAULT 'APPLICANT',
    "skills" TEXT[],
    "interests" TEXT,
    "availability" TEXT,
    "emergencyContact" TEXT,
    "joinDate" TIMESTAMP(3),
    "workflowInstanceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "volunteer_profiles_personId_key" ON "volunteer_profiles"("personId");
CREATE UNIQUE INDEX "volunteer_profiles_workflowInstanceId_key" ON "volunteer_profiles"("workflowInstanceId");
CREATE INDEX "volunteer_profiles_status_idx" ON "volunteer_profiles"("status");

CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "department" TEXT,
    "leaderPersonId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

CREATE TABLE "team_members" (
    "teamId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("teamId", "volunteerId")
);

CREATE TABLE "volunteer_hours" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "projectId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "description" TEXT,
    "status" "HoursStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "volunteer_hours_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "volunteer_hours_volunteerId_status_idx" ON "volunteer_hours"("volunteerId", "status");

CREATE TABLE "volunteer_evaluations" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "period" TEXT,
    "scores" JSONB NOT NULL,
    "comments" TEXT,
    "evaluatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "volunteer_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "volunteer_evaluations_volunteerId_idx" ON "volunteer_evaluations"("volunteerId");

-- foreign keys
ALTER TABLE "workflow_step_defs" ADD CONSTRAINT "workflow_step_defs_definitionKey_fkey" FOREIGN KEY ("definitionKey") REFERENCES "workflow_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definitionKey_fkey" FOREIGN KEY ("definitionKey") REFERENCES "workflow_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medical_treatments" ADD CONSTRAINT "medical_treatments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "medical_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activities" ADD CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participants" ADD CONSTRAINT "participants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_hours" ADD CONSTRAINT "volunteer_hours_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_evaluations" ADD CONSTRAINT "volunteer_evaluations_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

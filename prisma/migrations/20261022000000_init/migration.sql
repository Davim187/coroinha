-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COORDINATOR', 'SECRETARY');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CoroinhaStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ScaleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LiturgicalRole" AS ENUM ('CRUCIFERARIO', 'LIBRIFERO', 'CREDENCIA', 'OBJETOS', 'CEROFERARIO_1', 'CEROFERARIO_2', 'TURIFERARIO', 'NAVETEIRO');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'JUSTIFIED');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RaffleBlockStatus" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "FundraisingStatus" AS ENUM ('ONGOING', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'HELD', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" TEXT[],
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coroinha" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "phone" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "joinedAt" DATE NOT NULL,
    "notes" TEXT,
    "status" "CoroinhaStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coroinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Celebration" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Celebration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scale" (
    "id" TEXT NOT NULL,
    "celebrationId" TEXT NOT NULL,
    "status" "ScaleStatus" NOT NULL DEFAULT 'DRAFT',
    "duplicatedFromId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleRoleSetting" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "role" "LiturgicalRole" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScaleRoleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScaleAssignment" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "role" "LiturgicalRole" NOT NULL,
    "coroinhaId" TEXT NOT NULL,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScaleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prize" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalNumbers" INTEGER NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "drawAt" DATE,
    "goalAmount" DECIMAL(12,2),
    "notes" TEXT,
    "status" "RaffleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleBlock" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "coroinhaId" TEXT,
    "participantName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "soldQuantity" INTEGER NOT NULL DEFAULT 0,
    "unsoldQuantity" INTEGER NOT NULL DEFAULT 0,
    "unsoldReturned" BOOLEAN NOT NULL DEFAULT false,
    "amountReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "RaffleBlockStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleBlockEvent" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleBlockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE,
    "goalAmount" DECIMAL(12,2),
    "notes" TEXT,
    "status" "FundraisingStatus" NOT NULL DEFAULT 'ONGOING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "coroinhaId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundraisingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "coroinhaId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRevision" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "location" TEXT,
    "organizerId" TEXT NOT NULL,
    "notes" TEXT,
    "decisions" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "parishName" TEXT NOT NULL DEFAULT 'Pastoral de Coroinhas',
    "celebrationDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "balanceWindowDays" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Coroinha_fullName_idx" ON "Coroinha"("fullName");

-- CreateIndex
CREATE INDEX "Coroinha_status_archivedAt_idx" ON "Coroinha"("status", "archivedAt");

-- CreateIndex
CREATE INDEX "Celebration_date_idx" ON "Celebration"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Scale_celebrationId_key" ON "Scale"("celebrationId");

-- CreateIndex
CREATE INDEX "Scale_status_idx" ON "Scale"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleRoleSetting_scaleId_role_key" ON "ScaleRoleSetting"("scaleId", "role");

-- CreateIndex
CREATE INDEX "ScaleAssignment_coroinhaId_idx" ON "ScaleAssignment"("coroinhaId");

-- CreateIndex
CREATE UNIQUE INDEX "ScaleAssignment_scaleId_role_key" ON "ScaleAssignment"("scaleId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_assignmentId_key" ON "Attendance"("assignmentId");

-- CreateIndex
CREATE INDEX "RaffleCampaign_status_idx" ON "RaffleCampaign"("status");

-- CreateIndex
CREATE INDEX "RaffleBlock_campaignId_idx" ON "RaffleBlock"("campaignId");

-- CreateIndex
CREATE INDEX "RaffleBlock_coroinhaId_idx" ON "RaffleBlock"("coroinhaId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleBlock_campaignId_label_key" ON "RaffleBlock"("campaignId", "label");

-- CreateIndex
CREATE INDEX "RaffleBlockEvent_blockId_idx" ON "RaffleBlockEvent"("blockId");

-- CreateIndex
CREATE INDEX "FundraisingCampaign_status_idx" ON "FundraisingCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FundraisingParticipant_campaignId_coroinhaId_key" ON "FundraisingParticipant"("campaignId", "coroinhaId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_campaignId_date_idx" ON "FinancialTransaction"("campaignId", "date");

-- CreateIndex
CREATE INDEX "FinancialRevision_transactionId_idx" ON "FinancialRevision"("transactionId");

-- CreateIndex
CREATE INDEX "Meeting_date_status_idx" ON "Meeting"("date", "status");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_name_key" ON "MeetingParticipant"("meetingId", "name");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scale" ADD CONSTRAINT "Scale_celebrationId_fkey" FOREIGN KEY ("celebrationId") REFERENCES "Celebration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleRoleSetting" ADD CONSTRAINT "ScaleRoleSetting_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "Scale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAssignment" ADD CONSTRAINT "ScaleAssignment_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "Scale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScaleAssignment" ADD CONSTRAINT "ScaleAssignment_coroinhaId_fkey" FOREIGN KEY ("coroinhaId") REFERENCES "Coroinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScaleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBlock" ADD CONSTRAINT "RaffleBlock_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "RaffleCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBlock" ADD CONSTRAINT "RaffleBlock_coroinhaId_fkey" FOREIGN KEY ("coroinhaId") REFERENCES "Coroinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBlockEvent" ADD CONSTRAINT "RaffleBlockEvent_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "RaffleBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBlockEvent" ADD CONSTRAINT "RaffleBlockEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingParticipant" ADD CONSTRAINT "FundraisingParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingParticipant" ADD CONSTRAINT "FundraisingParticipant_coroinhaId_fkey" FOREIGN KEY ("coroinhaId") REFERENCES "Coroinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraisingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_coroinhaId_fkey" FOREIGN KEY ("coroinhaId") REFERENCES "Coroinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRevision" ADD CONSTRAINT "FinancialRevision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRevision" ADD CONSTRAINT "FinancialRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RaffleBlock" ADD CONSTRAINT "RaffleBlock_quantities_check" CHECK (
  "quantity" > 0
  AND "soldQuantity" >= 0
  AND "unsoldQuantity" >= 0
  AND "soldQuantity" + "unsoldQuantity" <= "quantity"
  AND "amountReceived" >= 0
);

ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_amount_check" CHECK ("amount" > 0);
ALTER TABLE "RaffleCampaign" ADD CONSTRAINT "RaffleCampaign_numbers_check" CHECK ("totalNumbers" > 0 AND "unitPrice" > 0);

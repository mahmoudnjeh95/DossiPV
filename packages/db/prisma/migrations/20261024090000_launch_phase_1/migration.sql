-- Launch phase 1: disabled users, password reset links, admin audit log, impersonation
-- sessions, archived plans, expiry email reminders and the per-project 3D flag.

-- CreateEnum
CREATE TYPE "SubscriptionReminderKind" AS ENUM ('EXPIRES_IN_7_DAYS', 'EXPIRES_IN_1_DAY', 'EXPIRED');

-- AlterTable
ALTER TABLE "company_user" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "with3d" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBySuperAdminId" TEXT;

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_reminder" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "kind" "SubscriptionReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_tokenHash_key" ON "password_reset_token"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_token_companyUserId_idx" ON "password_reset_token"("companyUserId");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_targetCompanyId_createdAt_idx" ON "admin_audit_log"("targetCompanyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_reminder_subscriptionId_periodEnd_kind_key" ON "subscription_reminder"("subscriptionId", "periodEnd", "kind");

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_impersonatedBySuperAdminId_fkey" FOREIGN KEY ("impersonatedBySuperAdminId") REFERENCES "super_admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "super_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_reminder" ADD CONSTRAINT "subscription_reminder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Until now every dossier had the 3D view; from now on it is a Premium feature (Project.with3d).
UPDATE "project" SET "with3d" = ("tier" = 'PREMIUM');

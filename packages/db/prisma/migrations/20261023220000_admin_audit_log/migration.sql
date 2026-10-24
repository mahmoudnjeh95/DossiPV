-- CreateTable: every super-admin change (plan, subscription, payment, account).
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_targetCompanyId_createdAt_idx" ON "admin_audit_log"("targetCompanyId", "createdAt");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "super_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

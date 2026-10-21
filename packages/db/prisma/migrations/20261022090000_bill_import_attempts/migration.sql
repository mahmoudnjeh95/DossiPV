-- CreateTable
CREATE TABLE "bill_import_attempt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_import_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_import_attempt_companyId_createdAt_idx" ON "bill_import_attempt"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "bill_import_attempt" ADD CONSTRAINT "bill_import_attempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

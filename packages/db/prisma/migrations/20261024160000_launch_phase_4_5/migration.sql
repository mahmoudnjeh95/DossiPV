-- Launch phases 4 and 5: highlighted-product statistics, online payments (checkouts) and numbered invoices.

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'OPTION_3D');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'FLOUCI';
ALTER TYPE "PaymentMethod" ADD VALUE 'IZI';
ALTER TYPE "PaymentMethod" ADD VALUE 'D17';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "invoiceFooter" TEXT,
ADD COLUMN     "sellerAddress" TEXT,
ADD COLUMN     "sellerEmail" TEXT,
ADD COLUMN     "sellerLegalName" TEXT,
ADD COLUMN     "sellerPhone" TEXT,
ADD COLUMN     "sellerTaxId" TEXT,
ADD COLUMN     "stampDutyTnd" DECIMAL(10,3) NOT NULL DEFAULT 1,
ADD COLUMN     "vatRatePct" DECIMAL(5,2) NOT NULL DEFAULT 19;

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "totalHtTnd" DECIMAL(10,3) NOT NULL,
    "vatRatePct" DECIMAL(5,2) NOT NULL,
    "vatTnd" DECIMAL(10,3) NOT NULL,
    "stampTnd" DECIMAL(10,3) NOT NULL,
    "totalTtcTnd" DECIMAL(10,3) NOT NULL,
    "pdfFileId" TEXT,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "payment_intent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "planId" TEXT,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amountTnd" DECIMAL(10,2) NOT NULL,
    "provider" "PaymentMethod" NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "payment_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_daily_stat" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shownCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_product_daily_stat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_number_key" ON "invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_paymentId_key" ON "invoice"("paymentId");

-- CreateIndex
CREATE INDEX "invoice_companyId_issuedAt_idx" ON "invoice"("companyId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_year_sequence_key" ON "invoice"("year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intent_paymentId_key" ON "payment_intent"("paymentId");

-- CreateIndex
CREATE INDEX "payment_intent_companyId_createdAt_idx" ON "payment_intent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_intent_providerReference_idx" ON "payment_intent"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_daily_stat_supplierProductId_date_key" ON "supplier_product_daily_stat"("supplierProductId", "date");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_daily_stat" ADD CONSTRAINT "supplier_product_daily_stat_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "supplier_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Payments become P2P (Flouci, izi, D17 transfers confirmed by the admin) and invoicing is dropped:
-- the invoice tables, the seller/VAT/stamp settings; P2P receiving details and a declared-at date added.

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_companyId_fkey";

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_pdfFileId_fkey";

-- AlterTable
ALTER TABLE "payment_intent" ADD COLUMN     "declaredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" DROP COLUMN "invoiceFooter",
DROP COLUMN "sellerAddress",
DROP COLUMN "sellerEmail",
DROP COLUMN "sellerLegalName",
DROP COLUMN "sellerPhone",
DROP COLUMN "sellerTaxId",
DROP COLUMN "stampDutyTnd",
DROP COLUMN "vatRatePct",
ADD COLUMN     "p2pAccountHolder" TEXT,
ADD COLUMN     "p2pD17Number" TEXT,
ADD COLUMN     "p2pFlouciNumber" TEXT,
ADD COLUMN     "p2pInstructions" TEXT,
ADD COLUMN     "p2pIziNumber" TEXT;

-- DropTable
DROP TABLE "invoice";

-- DropTable
DROP TABLE "invoice_counter";


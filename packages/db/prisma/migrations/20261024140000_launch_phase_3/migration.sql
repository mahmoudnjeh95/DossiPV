-- Launch phase 3: suppliers (fournisseurs), the products they carry, invitations of installers,
-- sponsorship, supplier packs and the 3D option.

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('INSTALLER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('INSTALLER', 'SUPPLIER');

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "kind" "CompanyKind" NOT NULL DEFAULT 'INSTALLER',
ADD COLUMN     "sponsorCompanyId" TEXT;

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "audience" "PlanAudience" NOT NULL DEFAULT 'INSTALLER',
ADD COLUMN     "dossiersPerInstallerPerMonth" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "includesHighlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxSponsoredInstallers" INTEGER;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "option3dUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "option3dPriceTnd" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product" (
    "id" TEXT NOT NULL,
    "supplierCompanyId" TEXT NOT NULL,
    "kind" "EquipmentKind" NOT NULL,
    "pvModuleId" TEXT,
    "inverterId" TEXT,
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invitation" (
    "id" TEXT NOT NULL,
    "supplierCompanyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_supplierCompanyId_pvModuleId_key" ON "supplier_product"("supplierCompanyId", "pvModuleId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_supplierCompanyId_inverterId_key" ON "supplier_product"("supplierCompanyId", "inverterId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invitation_tokenHash_key" ON "supplier_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "supplier_invitation_supplierCompanyId_idx" ON "supplier_invitation"("supplierCompanyId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_sponsorCompanyId_fkey" FOREIGN KEY ("sponsorCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_supplierCompanyId_fkey" FOREIGN KEY ("supplierCompanyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_pvModuleId_fkey" FOREIGN KEY ("pvModuleId") REFERENCES "pv_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product" ADD CONSTRAINT "supplier_product_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "inverter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invitation" ADD CONSTRAINT "supplier_invitation_supplierCompanyId_fkey" FOREIGN KEY ("supplierCompanyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The company publishing SolarixPro, shown on the legal pages (super admin settings).
ALTER TABLE "platform_settings" ADD COLUMN "legalName" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalForm" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalRneId" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalTaxId" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalAddress" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalPublisher" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalInpdpDeclaration" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "legalHost" TEXT;

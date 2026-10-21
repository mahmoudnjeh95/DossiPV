-- Shared-catalog review: imported items start as DRAFT and are hidden from installers until published.
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TABLE "pv_module" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "inverter" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "spd" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "dc_switch" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "dc_fuse" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "ac_breaker" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "ac_isolator" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "cable" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;
ALTER TABLE "accessory" ADD COLUMN "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "datasheetSourceUrl" TEXT, ADD COLUMN "importNotes" TEXT;

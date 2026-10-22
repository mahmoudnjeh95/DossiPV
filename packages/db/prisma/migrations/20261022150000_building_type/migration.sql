-- CreateEnum
CREATE TYPE "BuildingType" AS ENUM ('HOUSE', 'APARTMENT_BUILDING');

-- AlterTable
ALTER TABLE "project_site" ADD COLUMN "buildingType" "BuildingType";

-- AlterTable
ALTER TABLE "project_earthing" ADD COLUMN "useBuildingEarth" BOOLEAN NOT NULL DEFAULT false;

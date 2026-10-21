-- CreateEnum
CREATE TYPE "ProjectFlowStep" AS ENUM ('PROPOSALS', 'LOCATIONS', 'READY');

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "flowStep" "ProjectFlowStep";

-- AlterTable
ALTER TABLE "project_site" ADD COLUMN     "floors" INTEGER;

-- CreateTable
CREATE TABLE "project_bill_import" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "reading" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "annualConsumptionKWh" DOUBLE PRECISION,
    "averagePriceTNDPerKWh" DOUBLE PRECISION,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_bill_import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvgis_yield_cache" (
    "id" TEXT NOT NULL,
    "latRounded" DOUBLE PRECISION NOT NULL,
    "lonRounded" DOUBLE PRECISION NOT NULL,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "azimuthDeg" DOUBLE PRECISION NOT NULL,
    "specificYieldKWhPerKWp" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvgis_yield_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_bill_import_projectId_key" ON "project_bill_import"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "pvgis_yield_cache_latRounded_lonRounded_tiltDeg_azimuthDeg_key" ON "pvgis_yield_cache"("latRounded", "lonRounded", "tiltDeg", "azimuthDeg");

-- AddForeignKey
ALTER TABLE "project_bill_import" ADD CONSTRAINT "project_bill_import_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_bill_import" ADD CONSTRAINT "project_bill_import_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

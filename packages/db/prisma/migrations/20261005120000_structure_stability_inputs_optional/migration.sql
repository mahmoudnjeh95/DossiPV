-- AlterTable: wind-stability inputs are optional (Tunisian dossiers need only material + wind speed)
ALTER TABLE "project_structure" ALTER COLUMN "frameCount" DROP NOT NULL,
ALTER COLUMN "structureWeightN" DROP NOT NULL,
ALTER COLUMN "heightHM" DROP NOT NULL,
ALTER COLUMN "depthDM" DROP NOT NULL;

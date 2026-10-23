-- AlterTable: the step a running generation is on, for the installer's progress bar.
ALTER TABLE "dossier_job" ADD COLUMN     "progressStep" TEXT,
ADD COLUMN     "progressAt" TIMESTAMP(3);

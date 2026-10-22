-- AlterTable: French warnings of a finished job (e.g. an unreadable annex left out), as a string[].
ALTER TABLE "dossier_job" ADD COLUMN     "warnings" JSONB NOT NULL DEFAULT '[]';

-- AlterTable: the distributor's ANME acceptance letter for the module (annex N°11).
ALTER TABLE "project_annexes" ADD COLUMN     "moduleAcceptanceFileId" TEXT;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_moduleAcceptanceFileId_fkey" FOREIGN KEY ("moduleAcceptanceFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

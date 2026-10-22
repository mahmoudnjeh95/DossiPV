-- AlterTable: the syndic's (or co-owners') authorization for a flat (annex N°1).
ALTER TABLE "project_annexes" ADD COLUMN     "syndicAuthorizationFileId" TEXT;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_syndicAuthorizationFileId_fkey" FOREIGN KEY ("syndicAuthorizationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

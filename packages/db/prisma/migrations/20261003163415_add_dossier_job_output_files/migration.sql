-- AlterTable
ALTER TABLE "dossier_job" ADD COLUMN     "annexesPdfFileId" TEXT,
ADD COLUMN     "docxFileId" TEXT,
ADD COLUMN     "pdfFileId" TEXT;

-- AddForeignKey
ALTER TABLE "dossier_job" ADD CONSTRAINT "dossier_job_docxFileId_fkey" FOREIGN KEY ("docxFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_job" ADD CONSTRAINT "dossier_job_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_job" ADD CONSTRAINT "dossier_job_annexesPdfFileId_fkey" FOREIGN KEY ("annexesPdfFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

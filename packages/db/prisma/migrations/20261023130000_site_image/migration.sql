-- AlterTable: the installer's own satellite photo of the site and where it lies on the map.
ALTER TABLE "project_site" ADD COLUMN     "siteImageBounds" JSONB,
ADD COLUMN     "siteImageFileId" TEXT;

-- AddForeignKey
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_siteImageFileId_fkey" FOREIGN KEY ("siteImageFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

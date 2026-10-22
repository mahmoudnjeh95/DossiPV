-- CreateEnum: the official lists the catalog is imported from.
CREATE TYPE "CatalogSourceKind" AS ENUM ('STEG_INVERTER_LIST', 'ANME_PANEL_LIST');

-- CreateTable: one stored copy of each list (annex N°10 / N°11 list pages are cut from it).
CREATE TABLE "catalog_source_document" (
    "id" TEXT NOT NULL,
    "kind" "CatalogSourceKind" NOT NULL,
    "fileId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_source_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_source_document_kind_key" ON "catalog_source_document"("kind");

-- AddForeignKey
ALTER TABLE "catalog_source_document" ADD CONSTRAINT "catalog_source_document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

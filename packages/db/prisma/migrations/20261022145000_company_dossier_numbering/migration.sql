-- AlterTable: the installer's own dossier numbering (prefix + running counter, e.g. "434 - 303").
-- dossierCounter is the last number used; 0 means the next first generation takes number 1.
ALTER TABLE "company" ADD COLUMN "dossierPrefix" TEXT,
ADD COLUMN "dossierCounter" INTEGER NOT NULL DEFAULT 0;

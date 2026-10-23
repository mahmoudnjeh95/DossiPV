-- AlterTable: the installer's photo is no longer aligned on the map; the points are placed again on it.
ALTER TABLE "project_site" DROP COLUMN "siteImageBounds",
ADD COLUMN     "siteImagePoints" JSONB;

-- An installer can archive a project: it leaves the default project list.
ALTER TABLE "project" ADD COLUMN "archivedAt" TIMESTAMP(3);

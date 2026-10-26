-- A new company starts with the whole shared catalog in its library and a hint to sort it.
ALTER TABLE "company" ADD COLUMN "libraryHintPending" BOOLEAN NOT NULL DEFAULT false;

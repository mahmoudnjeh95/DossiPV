-- The Claude model the admin picked for the dossier text (null = the built-in default).
ALTER TABLE "platform_settings" ADD COLUMN "claudeModel" TEXT;

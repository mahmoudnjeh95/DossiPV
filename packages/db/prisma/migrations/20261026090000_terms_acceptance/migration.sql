-- When each user accepted the CGU and the privacy policy, and which version.
ALTER TABLE "company_user" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "company_user" ADD COLUMN "termsVersion" TEXT;

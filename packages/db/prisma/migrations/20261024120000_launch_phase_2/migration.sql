-- Launch phase 2: self sign-up (email verification, company profile completion, sign-up inbox)
-- and the free trial plan.

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "profileComplete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signupAt" TIMESTAMP(3),
ADD COLUMN     "signupContactName" TEXT,
ADD COLUMN     "signupContactedAt" TIMESTAMP(3),
ADD COLUMN     "signupGovernorate" TEXT,
ADD COLUMN     "signupNote" TEXT;

-- AlterTable
ALTER TABLE "company_user" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_tokenHash_key" ON "email_verification_token"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_token_companyUserId_idx" ON "email_verification_token"("companyUserId");

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Everyone who exists today has been vouched for by the admin: their email counts as verified.
UPDATE "company_user" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- The free trial offered after a self sign-up: Standard features, 3 dossiers over the whole
-- period (30 days, set when the subscription is created). The admin can edit or archive it.
INSERT INTO "plan" ("id", "name", "monthlyDossierLimit", "priceTnd", "tier", "isTrial")
SELECT gen_random_uuid()::text, 'Essai gratuit', 3, 0, 'STANDARD', true
WHERE NOT EXISTS (SELECT 1 FROM "plan" WHERE "isTrial" = true);

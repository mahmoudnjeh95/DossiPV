-- The screenshot a payer sends with a P2P payment, kept one month in the database.

-- AlterTable
ALTER TABLE "payment_intent" ADD COLUMN     "proofExpiresAt" TIMESTAMP(3),
ADD COLUMN     "proofImage" BYTEA,
ADD COLUMN     "proofMime" TEXT;


-- The chat between a payer and the admin on a P2P payment.

-- CreateEnum
CREATE TYPE "PaymentMessageAuthor" AS ENUM ('COMPANY', 'ADMIN');

-- CreateTable
CREATE TABLE "payment_message" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "author" "PaymentMessageAuthor" NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readByCompanyAt" TIMESTAMP(3),
    "readByAdminAt" TIMESTAMP(3),

    CONSTRAINT "payment_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_message_intentId_createdAt_idx" ON "payment_message"("intentId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_message" ADD CONSTRAINT "payment_message_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "payment_intent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


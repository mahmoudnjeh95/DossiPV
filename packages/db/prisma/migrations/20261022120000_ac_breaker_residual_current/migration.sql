-- AlterTable: the 30 mA protection is a property of the AC breaker (disjoncteur différentiel).
-- Both columns stay null for a plain breaker (no differential function).
ALTER TABLE "ac_breaker" ADD COLUMN "residualCurrentMA" INTEGER,
ADD COLUMN "rcdType" TEXT;

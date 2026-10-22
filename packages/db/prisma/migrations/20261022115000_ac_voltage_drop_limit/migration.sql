-- AlterTable: the existing max voltage-drop columns now mean the DC limit (default 3 %);
-- the AC limit (UTE C15-712-1) is 1 % and is set on existing rows by the column default.
ALTER TABLE "company" ADD COLUMN "defaultMaxAcVoltageDropPct" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "project_cabling_config" ADD COLUMN "maxAcVoltageDropPct" DOUBLE PRECISION NOT NULL DEFAULT 1;

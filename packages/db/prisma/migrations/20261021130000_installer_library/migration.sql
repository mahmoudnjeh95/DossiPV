-- CreateEnum
CREATE TYPE "EquipmentKind" AS ENUM ('PV_MODULE', 'INVERTER', 'SPD', 'DC_SWITCH', 'DC_FUSE', 'AC_BREAKER', 'AC_ISOLATOR', 'CABLE', 'ACCESSORY');

-- CreateTable
CREATE TABLE "library_item" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "EquipmentKind" NOT NULL,
    "pvModuleId" TEXT,
    "inverterId" TEXT,
    "spdId" TEXT,
    "dcSwitchId" TEXT,
    "dcFuseId" TEXT,
    "acBreakerId" TEXT,
    "acIsolatorId" TEXT,
    "cableId" TEXT,
    "accessoryId" TEXT,
    "purchasePriceTnd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_pvModuleId_key" ON "library_item"("companyId", "pvModuleId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_inverterId_key" ON "library_item"("companyId", "inverterId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_spdId_key" ON "library_item"("companyId", "spdId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_dcSwitchId_key" ON "library_item"("companyId", "dcSwitchId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_dcFuseId_key" ON "library_item"("companyId", "dcFuseId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_acBreakerId_key" ON "library_item"("companyId", "acBreakerId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_acIsolatorId_key" ON "library_item"("companyId", "acIsolatorId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_cableId_key" ON "library_item"("companyId", "cableId");

-- CreateIndex
CREATE UNIQUE INDEX "library_item_companyId_accessoryId_key" ON "library_item"("companyId", "accessoryId");

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_pvModuleId_fkey" FOREIGN KEY ("pvModuleId") REFERENCES "pv_module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "inverter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_spdId_fkey" FOREIGN KEY ("spdId") REFERENCES "spd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_dcSwitchId_fkey" FOREIGN KEY ("dcSwitchId") REFERENCES "dc_switch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_dcFuseId_fkey" FOREIGN KEY ("dcFuseId") REFERENCES "dc_fuse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_acBreakerId_fkey" FOREIGN KEY ("acBreakerId") REFERENCES "ac_breaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_acIsolatorId_fkey" FOREIGN KEY ("acIsolatorId") REFERENCES "ac_isolator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one equipment FK is set, and it is the one matching "kind".
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_one_fk_matches_kind" CHECK (
  num_nonnulls("pvModuleId", "inverterId", "spdId", "dcSwitchId", "dcFuseId", "acBreakerId", "acIsolatorId", "cableId", "accessoryId") = 1
  AND CASE "kind"
    WHEN 'PV_MODULE' THEN "pvModuleId" IS NOT NULL
    WHEN 'INVERTER' THEN "inverterId" IS NOT NULL
    WHEN 'SPD' THEN "spdId" IS NOT NULL
    WHEN 'DC_SWITCH' THEN "dcSwitchId" IS NOT NULL
    WHEN 'DC_FUSE' THEN "dcFuseId" IS NOT NULL
    WHEN 'AC_BREAKER' THEN "acBreakerId" IS NOT NULL
    WHEN 'AC_ISOLATOR' THEN "acIsolatorId" IS NOT NULL
    WHEN 'CABLE' THEN "cableId" IS NOT NULL
    WHEN 'ACCESSORY' THEN "accessoryId" IS NOT NULL
  END
);

-- Backfill: each company keeps the equipment it owns plus the shared equipment its projects already use.

INSERT INTO "library_item" ("id", "companyId", "kind", "pvModuleId")
SELECT gen_random_uuid()::text, s."companyId", 'PV_MODULE', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "pv_module" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."moduleId" AS "itemId" FROM "project_array_config" r JOIN "project" p ON p."id" = r."projectId" WHERE r."moduleId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "inverterId")
SELECT gen_random_uuid()::text, s."companyId", 'INVERTER', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "inverter" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."inverterId" AS "itemId" FROM "project_array_inverter" r JOIN "project_array_config" ac ON ac."id" = r."arrayConfigId" JOIN "project" p ON p."id" = ac."projectId" WHERE r."inverterId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "spdId")
SELECT gen_random_uuid()::text, s."companyId", 'SPD', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "spd" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."dcSpdId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."dcSpdId" IS NOT NULL
  UNION
  SELECT p."companyId", r."acSpdId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."acSpdId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "dcSwitchId")
SELECT gen_random_uuid()::text, s."companyId", 'DC_SWITCH', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "dc_switch" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."dcSwitchId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."dcSwitchId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "dcFuseId")
SELECT gen_random_uuid()::text, s."companyId", 'DC_FUSE', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "dc_fuse" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."dcFuseId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."dcFuseId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "acBreakerId")
SELECT gen_random_uuid()::text, s."companyId", 'AC_BREAKER', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "ac_breaker" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."acBreakerId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."acBreakerId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "acIsolatorId")
SELECT gen_random_uuid()::text, s."companyId", 'AC_ISOLATOR', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "ac_isolator" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."acIsolatorId" AS "itemId" FROM "project_protections" r JOIN "project" p ON p."id" = r."projectId" WHERE r."acIsolatorId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "cableId")
SELECT gen_random_uuid()::text, s."companyId", 'CABLE', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "cable" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."cableId" AS "itemId" FROM "project_cable_run" r JOIN "project" p ON p."id" = r."projectId" WHERE r."cableId" IS NOT NULL
  UNION
  SELECT p."companyId", r."earthCableId" AS "itemId" FROM "project_earthing" r JOIN "project" p ON p."id" = r."projectId" WHERE r."earthCableId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

INSERT INTO "library_item" ("id", "companyId", "kind", "accessoryId")
SELECT gen_random_uuid()::text, s."companyId", 'ACCESSORY', s."itemId"
FROM (
  SELECT "ownerCompanyId" AS "companyId", "id" AS "itemId" FROM "accessory" WHERE "ownerCompanyId" IS NOT NULL
  UNION
  SELECT p."companyId", r."distributionBlockId" AS "itemId" FROM "project_earthing" r JOIN "project" p ON p."id" = r."projectId" WHERE r."distributionBlockId" IS NOT NULL
  UNION
  SELECT p."companyId", r."connectorId" AS "itemId" FROM "project_cabling_config" r JOIN "project" p ON p."id" = r."projectId" WHERE r."connectorId" IS NOT NULL
  UNION
  SELECT p."companyId", r."cableTrayId" AS "itemId" FROM "project_cabling_config" r JOIN "project" p ON p."id" = r."projectId" WHERE r."cableTrayId" IS NOT NULL
) s
ON CONFLICT DO NOTHING;

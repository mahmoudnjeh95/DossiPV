-- CreateEnum
CREATE TYPE "ProjectTier" AS ENUM ('STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CompanyUserRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MANUAL', 'KONNECT');

-- CreateEnum
CREATE TYPE "SpdSide" AS ENUM ('DC', 'AC');

-- CreateEnum
CREATE TYPE "CableUsage" AS ENUM ('DC_SOLAR', 'AC', 'EARTH');

-- CreateEnum
CREATE TYPE "AccessoryKind" AS ENUM ('MC4_CONNECTOR', 'DISTRIBUTION_BLOCK', 'CABLE_TRAY', 'DC_ENCLOSURE', 'AC_ENCLOSURE', 'EARTH_ROD', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'GENERATED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CircuitType" AS ENUM ('DC', 'AC');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "file" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slogan" TEXT,
    "logoFileId" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "taxId" TEXT,
    "commercialRegister" TEXT,
    "legalRepFullName" TEXT NOT NULL,
    "legalRepRole" TEXT NOT NULL DEFAULT 'Gérant',
    "anmeCode" TEXT NOT NULL,
    "anmeReference" TEXT,
    "anmeCategory" TEXT NOT NULL,
    "anmeValidFrom" TIMESTAMP(3) NOT NULL,
    "anmeValidTo" TIMESTAMP(3) NOT NULL,
    "anmeCertificateFileId" TEXT,
    "defaultTMinC" DOUBLE PRECISION NOT NULL DEFAULT -10,
    "defaultTMaxC" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "defaultMaxVoltageDropPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "defaultEarthResistanceTargetOhm" DOUBLE PRECISION,
    "defaultDesignWindSpeedKmh" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "defaultCosPhi" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "CompanyUserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyDossierLimit" INTEGER NOT NULL,
    "priceTnd" DECIMAL(10,2) NOT NULL,
    "tier" "ProjectTier" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amountTnd" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "gatewayReference" TEXT,
    "note" TEXT,
    "recordedByAdmin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pv_module" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "pmaxW" DOUBLE PRECISION NOT NULL,
    "vmpV" DOUBLE PRECISION NOT NULL,
    "impA" DOUBLE PRECISION NOT NULL,
    "vocV" DOUBLE PRECISION NOT NULL,
    "iscA" DOUBLE PRECISION NOT NULL,
    "tempCoeffVocPct" DOUBLE PRECISION NOT NULL,
    "tempCoeffIscPct" DOUBLE PRECISION NOT NULL,
    "tempCoeffPmaxPct" DOUBLE PRECISION NOT NULL,
    "tempCoeffVmpPct" DOUBLE PRECISION,
    "irmA" DOUBLE PRECISION NOT NULL,
    "maxSystemVoltageV" DOUBLE PRECISION NOT NULL,
    "bifacial" BOOLEAN NOT NULL DEFAULT false,
    "bifacialGainPct" DOUBLE PRECISION,
    "lengthMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pv_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inverter" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "phases" INTEGER NOT NULL,
    "pacW" DOUBLE PRECISION NOT NULL,
    "sacVA" DOUBLE PRECISION NOT NULL,
    "vdcMaxV" DOUBLE PRECISION NOT NULL,
    "mpptMinV" DOUBLE PRECISION NOT NULL,
    "mpptMaxV" DOUBLE PRECISION NOT NULL,
    "startUpV" DOUBLE PRECISION NOT NULL,
    "mpptCount" INTEGER NOT NULL,
    "inputsPerMppt" INTEGER NOT NULL,
    "idcMaxPerMpptA" DOUBLE PRECISION NOT NULL,
    "iscMaxPerMpptA" DOUBLE PRECISION NOT NULL,
    "vacNomV" DOUBLE PRECISION NOT NULL,
    "vacRangeV" TEXT,
    "iacMaxA" DOUBLE PRECISION NOT NULL,
    "integratedDcSwitch" BOOLEAN NOT NULL DEFAULT false,
    "stegApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inverter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spd" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "side" "SpdSide" NOT NULL,
    "type" INTEGER NOT NULL,
    "poles" INTEGER NOT NULL,
    "ucV" DOUBLE PRECISION NOT NULL,
    "upKV" DOUBLE PRECISION NOT NULL,
    "inKA" DOUBLE PRECISION NOT NULL,
    "imaxKA" DOUBLE PRECISION NOT NULL,
    "iscpvKA" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dc_switch" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "ratedVoltageV" DOUBLE PRECISION NOT NULL,
    "ratedCurrentA" DOUBLE PRECISION NOT NULL,
    "poles" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dc_switch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dc_fuse" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "ratedVoltageV" DOUBLE PRECISION NOT NULL,
    "ratedCurrentA" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dc_fuse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_breaker" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "ratedCurrentA" DOUBLE PRECISION NOT NULL,
    "curve" TEXT,
    "breakingCapacityKA" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ac_breaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_isolator" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "ratedCurrentA" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ac_isolator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "usage" "CableUsage" NOT NULL,
    "conductor" TEXT NOT NULL,
    "insulation" TEXT NOT NULL,
    "standard" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_section" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "sectionMm2" DOUBLE PRECISION NOT NULL,
    "izA" DOUBLE PRECISION NOT NULL,
    "izReferenceMethod" TEXT NOT NULL,

    CONSTRAINT "cable_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory" (
    "id" TEXT NOT NULL,
    "ownerCompanyId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasheetFileId" TEXT,
    "homologationReference" TEXT,
    "homologationValidTo" TIMESTAMP(3),
    "homologationFileId" TEXT,
    "kind" "AccessoryKind" NOT NULL,
    "spec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tier" "ProjectTier" NOT NULL DEFAULT 'STANDARD',
    "dossierNumber" TEXT,
    "dossierDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_client" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "civility" TEXT,
    "fullName" TEXT NOT NULL,
    "clientKind" TEXT NOT NULL,
    "stegReference" TEXT,
    "cin" TEXT,
    "commercialRegister" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "governorate" TEXT,
    "annualConsumptionKWh" DOUBLE PRECISION,
    "subscribedPowerKVA" DOUBLE PRECISION,

    CONSTRAINT "project_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_site" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gpsLat" DOUBLE PRECISION NOT NULL,
    "gpsLon" DOUBLE PRECISION NOT NULL,
    "gridType" TEXT NOT NULL,
    "phases" INTEGER NOT NULL,
    "mountingType" TEXT NOT NULL,
    "roofMaterial" TEXT,
    "buildingHeightM" DOUBLE PRECISION,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "azimuthDeg" DOUBLE PRECISION,
    "shading" TEXT,
    "shadingNotes" TEXT,
    "lightningRod" BOOLEAN NOT NULL DEFAULT false,
    "generator" BOOLEAN NOT NULL DEFAULT false,
    "installationPointLat" DOUBLE PRECISION,
    "installationPointLon" DOUBLE PRECISION,
    "technicalRoomPointLat" DOUBLE PRECISION,
    "technicalRoomPointLon" DOUBLE PRECISION,
    "meterPointLat" DOUBLE PRECISION,
    "meterPointLon" DOUBLE PRECISION,
    "earthPitPointLat" DOUBLE PRECISION,
    "earthPitPointLon" DOUBLE PRECISION,
    "equipmentLocation" TEXT,

    CONSTRAINT "project_site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_array_config" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "tMinC" DOUBLE PRECISION NOT NULL DEFAULT -10,
    "tMaxC" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "rowsDescription" TEXT,

    CONSTRAINT "project_array_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_array_inverter" (
    "id" TEXT NOT NULL,
    "arrayConfigId" TEXT NOT NULL,
    "inverterId" TEXT NOT NULL,
    "phaseConnection" TEXT,

    CONSTRAINT "project_array_inverter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_array_mppt" (
    "id" TEXT NOT NULL,
    "arrayInverterId" TEXT NOT NULL,
    "stringsInParallel" INTEGER NOT NULL,
    "modulesPerString" INTEGER NOT NULL,

    CONSTRAINT "project_array_mppt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_protections" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dcSpdId" TEXT NOT NULL,
    "dcSwitchId" TEXT NOT NULL,
    "dcFuseId" TEXT,
    "acBreakerId" TEXT NOT NULL,
    "acSpdId" TEXT NOT NULL,
    "acIsolatorId" TEXT,
    "mainBreakerRatedCurrentA" DOUBLE PRECISION,
    "mainBreakerSensitivityMA" INTEGER,
    "spdToEquipmentDistanceM" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "equipmentImpulseWithstandKV" DOUBLE PRECISION NOT NULL DEFAULT 4,

    CONSTRAINT "project_protections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cable_run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "circuitType" "CircuitType" NOT NULL,
    "label" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "sectionMm2" DOUBLE PRECISION NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL,
    "installMethod" TEXT NOT NULL,
    "ambientContext" TEXT NOT NULL,
    "groupedCircuits" INTEGER NOT NULL DEFAULT 1,
    "layers" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "project_cable_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cabling_config" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cosPhi" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "lambdaOhmPerM" DOUBLE PRECISION NOT NULL,
    "maxVoltageDropPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "connectorId" TEXT,
    "cableTrayId" TEXT,

    CONSTRAINT "project_cabling_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_structure" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "frameDescription" TEXT,
    "frameCount" INTEGER NOT NULL,
    "railsDescription" TEXT,
    "fixingDescription" TEXT,
    "ballastPerFrame" INTEGER,
    "ballastMassKg" DOUBLE PRECISION,
    "ballastType" TEXT,
    "structureWeightN" DOUBLE PRECISION NOT NULL,
    "heightHM" DOUBLE PRECISION NOT NULL,
    "depthDM" DOUBLE PRECISION NOT NULL,
    "windSpeedKmh" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "liftCoeffNPerM2" DOUBLE PRECISION,
    "dragCoeffNPerM2" DOUBLE PRECISION,
    "tieDownCables" TEXT,
    "structureAttestationFileId" TEXT,

    CONSTRAINT "project_structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_earthing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mainEarthSectionMm2" DOUBLE PRECISION NOT NULL,
    "frameEarthSectionMm2" DOUBLE PRECISION NOT NULL,
    "earthToPitSectionMm2" DOUBLE PRECISION NOT NULL,
    "rodCount" INTEGER NOT NULL,
    "rodLengthM" DOUBLE PRECISION NOT NULL,
    "rodSpacingCm" DOUBLE PRECISION,
    "pitSizeCm" TEXT,
    "targetResistanceOhm" DOUBLE PRECISION NOT NULL,
    "earthCableId" TEXT NOT NULL,
    "distributionBlockId" TEXT,

    CONSTRAINT "project_earthing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_simulation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pvsystReportFileId" TEXT,
    "annualProductionKWh" DOUBLE PRECISION,
    "specificYieldKWhPerKWp" DOUBLE PRECISION,
    "performanceRatioPct" DOUBLE PRECISION,
    "systemLossesPct" DOUBLE PRECISION,

    CONSTRAINT "project_simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_imagery" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "situationImageFileId" TEXT,
    "implantationImageFileId" TEXT,
    "southArrowDeg" DOUBLE PRECISION,
    "geometry" JSONB NOT NULL,
    "imageryProvider" TEXT,

    CONSTRAINT "project_imagery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_off_grid" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dailyLoadKWh" DOUBLE PRECISION NOT NULL,
    "autonomyDays" DOUBLE PRECISION NOT NULL,
    "batteryChemistry" TEXT NOT NULL,
    "batteryVoltageV" INTEGER NOT NULL,
    "maxDepthOfDischargePct" DOUBLE PRECISION NOT NULL,
    "batteryModel" TEXT,
    "chargeControllerModel" TEXT,

    CONSTRAINT "project_off_grid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_annexes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cinFileId" TEXT,
    "commercialRegisterFileId" TEXT,
    "stegContractFileId" TEXT,
    "lastPaidBillFileId" TEXT,

    CONSTRAINT "project_annexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_annex_extra_file" (
    "id" TEXT NOT NULL,
    "annexesId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "project_annex_extra_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "failedStep" TEXT,
    "failureReason" TEXT,
    "inputSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "dossier_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_check_result" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "dossier_check_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claude_usage_log" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claude_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_user_email_key" ON "company_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokenHash_key" ON "session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_email_key" ON "super_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_companyId_key" ON "subscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "project_client_projectId_key" ON "project_client"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_site_projectId_key" ON "project_site"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_array_config_projectId_key" ON "project_array_config"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_protections_projectId_key" ON "project_protections"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_cabling_config_projectId_key" ON "project_cabling_config"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_structure_projectId_key" ON "project_structure"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_earthing_projectId_key" ON "project_earthing"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_simulation_projectId_key" ON "project_simulation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_imagery_projectId_key" ON "project_imagery"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_off_grid_projectId_key" ON "project_off_grid"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_annexes_projectId_key" ON "project_annexes"("projectId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_anmeCertificateFileId_fkey" FOREIGN KEY ("anmeCertificateFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user" ADD CONSTRAINT "company_user_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pv_module" ADD CONSTRAINT "pv_module_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pv_module" ADD CONSTRAINT "pv_module_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pv_module" ADD CONSTRAINT "pv_module_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter" ADD CONSTRAINT "inverter_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter" ADD CONSTRAINT "inverter_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter" ADD CONSTRAINT "inverter_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spd" ADD CONSTRAINT "spd_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spd" ADD CONSTRAINT "spd_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spd" ADD CONSTRAINT "spd_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_switch" ADD CONSTRAINT "dc_switch_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_switch" ADD CONSTRAINT "dc_switch_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_switch" ADD CONSTRAINT "dc_switch_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_fuse" ADD CONSTRAINT "dc_fuse_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_fuse" ADD CONSTRAINT "dc_fuse_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_fuse" ADD CONSTRAINT "dc_fuse_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_breaker" ADD CONSTRAINT "ac_breaker_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_breaker" ADD CONSTRAINT "ac_breaker_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_breaker" ADD CONSTRAINT "ac_breaker_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_isolator" ADD CONSTRAINT "ac_isolator_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_isolator" ADD CONSTRAINT "ac_isolator_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_isolator" ADD CONSTRAINT "ac_isolator_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_section" ADD CONSTRAINT "cable_section_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory" ADD CONSTRAINT "accessory_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory" ADD CONSTRAINT "accessory_datasheetFileId_fkey" FOREIGN KEY ("datasheetFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory" ADD CONSTRAINT "accessory_homologationFileId_fkey" FOREIGN KEY ("homologationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_client" ADD CONSTRAINT "project_client_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_array_config" ADD CONSTRAINT "project_array_config_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_array_config" ADD CONSTRAINT "project_array_config_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "pv_module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_array_inverter" ADD CONSTRAINT "project_array_inverter_arrayConfigId_fkey" FOREIGN KEY ("arrayConfigId") REFERENCES "project_array_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_array_inverter" ADD CONSTRAINT "project_array_inverter_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "inverter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_array_mppt" ADD CONSTRAINT "project_array_mppt_arrayInverterId_fkey" FOREIGN KEY ("arrayInverterId") REFERENCES "project_array_inverter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_dcSpdId_fkey" FOREIGN KEY ("dcSpdId") REFERENCES "spd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_dcSwitchId_fkey" FOREIGN KEY ("dcSwitchId") REFERENCES "dc_switch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_dcFuseId_fkey" FOREIGN KEY ("dcFuseId") REFERENCES "dc_fuse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_acBreakerId_fkey" FOREIGN KEY ("acBreakerId") REFERENCES "ac_breaker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_acSpdId_fkey" FOREIGN KEY ("acSpdId") REFERENCES "spd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_protections" ADD CONSTRAINT "project_protections_acIsolatorId_fkey" FOREIGN KEY ("acIsolatorId") REFERENCES "ac_isolator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cable_run" ADD CONSTRAINT "project_cable_run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cable_run" ADD CONSTRAINT "project_cable_run_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cabling_config" ADD CONSTRAINT "project_cabling_config_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cabling_config" ADD CONSTRAINT "project_cabling_config_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "accessory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cabling_config" ADD CONSTRAINT "project_cabling_config_cableTrayId_fkey" FOREIGN KEY ("cableTrayId") REFERENCES "accessory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_structure" ADD CONSTRAINT "project_structure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_structure" ADD CONSTRAINT "project_structure_structureAttestationFileId_fkey" FOREIGN KEY ("structureAttestationFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_earthing" ADD CONSTRAINT "project_earthing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_earthing" ADD CONSTRAINT "project_earthing_earthCableId_fkey" FOREIGN KEY ("earthCableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_earthing" ADD CONSTRAINT "project_earthing_distributionBlockId_fkey" FOREIGN KEY ("distributionBlockId") REFERENCES "accessory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_simulation" ADD CONSTRAINT "project_simulation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_simulation" ADD CONSTRAINT "project_simulation_pvsystReportFileId_fkey" FOREIGN KEY ("pvsystReportFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_imagery" ADD CONSTRAINT "project_imagery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_imagery" ADD CONSTRAINT "project_imagery_situationImageFileId_fkey" FOREIGN KEY ("situationImageFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_imagery" ADD CONSTRAINT "project_imagery_implantationImageFileId_fkey" FOREIGN KEY ("implantationImageFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_off_grid" ADD CONSTRAINT "project_off_grid_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_cinFileId_fkey" FOREIGN KEY ("cinFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_commercialRegisterFileId_fkey" FOREIGN KEY ("commercialRegisterFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_stegContractFileId_fkey" FOREIGN KEY ("stegContractFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annexes" ADD CONSTRAINT "project_annexes_lastPaidBillFileId_fkey" FOREIGN KEY ("lastPaidBillFileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annex_extra_file" ADD CONSTRAINT "project_annex_extra_file_annexesId_fkey" FOREIGN KEY ("annexesId") REFERENCES "project_annexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_annex_extra_file" ADD CONSTRAINT "project_annex_extra_file_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_job" ADD CONSTRAINT "dossier_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_check_result" ADD CONSTRAINT "dossier_check_result_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "dossier_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_usage_log" ADD CONSTRAINT "claude_usage_log_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "dossier_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

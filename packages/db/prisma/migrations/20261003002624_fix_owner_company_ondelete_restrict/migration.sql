-- DropForeignKey
ALTER TABLE "ac_breaker" DROP CONSTRAINT "ac_breaker_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "ac_isolator" DROP CONSTRAINT "ac_isolator_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "accessory" DROP CONSTRAINT "accessory_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "cable" DROP CONSTRAINT "cable_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "dc_fuse" DROP CONSTRAINT "dc_fuse_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "dc_switch" DROP CONSTRAINT "dc_switch_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "inverter" DROP CONSTRAINT "inverter_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "pv_module" DROP CONSTRAINT "pv_module_ownerCompanyId_fkey";

-- DropForeignKey
ALTER TABLE "spd" DROP CONSTRAINT "spd_ownerCompanyId_fkey";

-- AddForeignKey
ALTER TABLE "pv_module" ADD CONSTRAINT "pv_module_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inverter" ADD CONSTRAINT "inverter_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spd" ADD CONSTRAINT "spd_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_switch" ADD CONSTRAINT "dc_switch_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dc_fuse" ADD CONSTRAINT "dc_fuse_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_breaker" ADD CONSTRAINT "ac_breaker_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_isolator" ADD CONSTRAINT "ac_isolator_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory" ADD CONSTRAINT "accessory_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

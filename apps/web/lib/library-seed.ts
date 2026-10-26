import { db } from '@dossipv/db';
import type { EquipmentKind } from '@dossipv/db';

interface SharedCatalog {
  findMany(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string }[]>;
}

/** The LibraryItem foreign key and the catalog table behind each equipment type. */
const CATALOGS: Record<EquipmentKind, { fk: string; catalog: () => SharedCatalog }> = {
  PV_MODULE: { fk: 'pvModuleId', catalog: () => db.pvModule },
  INVERTER: { fk: 'inverterId', catalog: () => db.inverter },
  SPD: { fk: 'spdId', catalog: () => db.spd },
  DC_SWITCH: { fk: 'dcSwitchId', catalog: () => db.dcSwitch },
  DC_FUSE: { fk: 'dcFuseId', catalog: () => db.dcFuse },
  AC_BREAKER: { fk: 'acBreakerId', catalog: () => db.acBreaker },
  AC_ISOLATOR: { fk: 'acIsolatorId', catalog: () => db.acIsolator },
  CABLE: { fk: 'cableId', catalog: () => db.cable },
  ACCESSORY: { fk: 'accessoryId', catalog: () => db.accessory },
};

export const ALL_EQUIPMENT_KINDS = Object.keys(CATALOGS) as EquipmentKind[];

/**
 * Adds to the company's library every shared, published, sourced item of these types it does not
 * have yet (the same items « Tout ajouter » and the catalogue offer).
 */
export async function addSharedCatalogToLibrary(companyId: string, kinds: readonly EquipmentKind[]): Promise<void> {
  for (const kind of kinds) {
    const { fk, catalog } = CATALOGS[kind];
    const missing = await catalog().findMany({
      where: {
        ownerCompanyId: null,
        catalogStatus: 'PUBLISHED',
        datasheetSourceUrl: { not: null },
        libraryItems: { none: { companyId } },
      },
      select: { id: true },
    });
    if (missing.length > 0) {
      await db.libraryItem.createMany({
        data: missing.map((item) => ({ companyId, kind, [fk]: item.id })) as never,
        skipDuplicates: true,
      });
    }
  }
}

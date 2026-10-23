import { db } from '@dossipv/db';
import type { EquipmentKind } from '@dossipv/db';
import { AcBreakerFields } from '../../../components/equipment/ac-breaker-fields';
import { AcIsolatorFields } from '../../../components/equipment/ac-isolator-fields';
import { AccessoryFields } from '../../../components/equipment/accessory-fields';
import { CableFields } from '../../../components/equipment/cable-fields';
import { DcFuseFields } from '../../../components/equipment/dc-fuse-fields';
import { DcSwitchFields } from '../../../components/equipment/dc-switch-fields';
import { InverterFields } from '../../../components/equipment/inverter-fields';
import { PvModuleFields } from '../../../components/equipment/pv-module-fields';
import { SpdFields } from '../../../components/equipment/spd-fields';
import type { AttachedDocuments } from './own-equipment-form';

/** The empty fields of a new item of `kind`. */
export function newEquipmentFields(kind: EquipmentKind): React.JSX.Element {
  switch (kind) {
    case 'PV_MODULE':
      return <PvModuleFields />;
    case 'INVERTER':
      return <InverterFields />;
    case 'SPD':
      return <SpdFields />;
    case 'DC_SWITCH':
      return <DcSwitchFields />;
    case 'DC_FUSE':
      return <DcFuseFields />;
    case 'AC_BREAKER':
      return <AcBreakerFields />;
    case 'AC_ISOLATOR':
      return <AcIsolatorFields />;
    case 'CABLE':
      return <CableFields />;
    case 'ACCESSORY':
      return <AccessoryFields />;
  }
}

export interface OwnEquipmentForEdit {
  name: string;
  fields: React.JSX.Element;
  attached: AttachedDocuments;
}

interface Item {
  brand: string;
  model: string;
  datasheetFileId: string | null;
  homologationFileId: string | null;
}

function forEdit(item: Item, fields: React.JSX.Element): OwnEquipmentForEdit {
  return {
    name: `${item.brand} ${item.model}`,
    fields,
    attached: { datasheet: item.datasheetFileId !== null, homologation: item.homologationFileId !== null },
  };
}

/** One of the company's own items with its filled-in fields; null when it is not the company's. */
export async function loadOwnEquipment(kind: EquipmentKind, id: string, companyId: string): Promise<OwnEquipmentForEdit | null> {
  const where = { id, ownerCompanyId: companyId };
  switch (kind) {
    case 'PV_MODULE': {
      const item = await db.pvModule.findFirst({ where });
      return item && forEdit(item, <PvModuleFields item={item} />);
    }
    case 'INVERTER': {
      const item = await db.inverter.findFirst({ where });
      return item && forEdit(item, <InverterFields item={item} />);
    }
    case 'SPD': {
      const item = await db.spd.findFirst({ where });
      return item && forEdit(item, <SpdFields item={item} />);
    }
    case 'DC_SWITCH': {
      const item = await db.dcSwitch.findFirst({ where });
      return item && forEdit(item, <DcSwitchFields item={item} />);
    }
    case 'DC_FUSE': {
      const item = await db.dcFuse.findFirst({ where });
      return item && forEdit(item, <DcFuseFields item={item} />);
    }
    case 'AC_BREAKER': {
      const item = await db.acBreaker.findFirst({ where });
      return item && forEdit(item, <AcBreakerFields item={item} />);
    }
    case 'AC_ISOLATOR': {
      const item = await db.acIsolator.findFirst({ where });
      return item && forEdit(item, <AcIsolatorFields item={item} />);
    }
    case 'CABLE': {
      const item = await db.cable.findFirst({ where, include: { sections: { orderBy: { sectionMm2: 'asc' } } } });
      return item && forEdit(item, <CableFields item={item} />);
    }
    case 'ACCESSORY': {
      const item = await db.accessory.findFirst({ where });
      return item && forEdit(item, <AccessoryFields item={item} />);
    }
  }
}

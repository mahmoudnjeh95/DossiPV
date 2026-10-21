import type { DatasheetFamily } from './datasheet-registry';
import type { AnmePanelListing, StegInverterListing } from './types';
import { validateInverter, validatePvModule, type InverterRecord, type PvModuleRecord } from './validate-records';

export type CatalogPvModuleEntry = PvModuleRecord & {
  brand: string; homologationReference: string; homologationValidTo: string; datasheetSourceUrl: string;
  errors: string[]; warnings: string[];
};

export type CatalogInverterEntry = InverterRecord & {
  brand: string; stegApproved: true; homologationValidTo: string; datasheetSourceUrl: string;
  errors: string[]; warnings: string[];
};

export function buildModuleEntry(record: PvModuleRecord, family: DatasheetFamily, listing: AnmePanelListing): CatalogPvModuleEntry {
  return {
    ...record,
    brand: family.brand,
    homologationReference: `${listing.certificationBody} ${listing.certificateReference}`,
    homologationValidTo: listing.validUntil,
    datasheetSourceUrl: family.url,
    ...validatePvModule(record),
  };
}

export function buildInverterEntry(record: InverterRecord, family: DatasheetFamily, listing: StegInverterListing): CatalogInverterEntry {
  return {
    ...record,
    brand: family.brand,
    stegApproved: true,
    homologationValidTo: listing.acceptedUntil,
    datasheetSourceUrl: family.url,
    ...validateInverter(record, listing),
  };
}

export function sortEntries<T extends { brand: string; model: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
}

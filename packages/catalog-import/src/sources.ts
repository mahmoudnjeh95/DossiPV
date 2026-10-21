import { fileURLToPath } from 'url';

export const DATA_DIR = fileURLToPath(new URL('../../../data/catalog/', import.meta.url));

export const SOURCE_LISTS = {
  stegInverters: 'https://www.steg.com.tn/system/files/pdf/Liste_des_onduleurs_acceptes_par_la_STEG.pdf',
  anmePanels: 'https://www.anme.tn/sites/default/files/2026-07/liste-des-panneaux-acceptes-par-anme-en-date-de-24072026-1.pdf',
} as const;

export function filterValid<T extends { acceptedUntil?: string; validUntil?: string }>(items: T[], asOf: string): T[] {
  return items.filter((item) => (item.acceptedUntil ?? item.validUntil ?? '') >= asOf);
}

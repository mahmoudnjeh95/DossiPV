/**
 * The installer as the dossier presents it (cover, preamble, signatures, plan title blocks).
 * Built once per job from the live Company row.
 */
export interface InstallerIdentity {
  name: string;
  address: string;
  phone: string;
  email: string;
  anmeCode: string;
  anmeCategory: string;
  /** ISO date (`YYYY-MM-DD` or a full ISO timestamp). */
  anmeValidTo: string;
  taxId: string | null;
  legalRepFullName: string;
  legalRepRole: string;
  commercialRegister: string | null;
}

/** The Company columns the identity is read from. */
export interface InstallerCompanyRow {
  name: string;
  address: string;
  phone: string;
  email: string;
  anmeCode: string;
  anmeCategory: string;
  anmeValidTo: Date;
  taxId: string | null;
  legalRepFullName: string;
  legalRepRole: string;
  commercialRegister: string | null;
}

/** Stored ANME categories, as printed (`BT_MT` reads « BT + MT », like the settings page). */
const ANME_CATEGORY_LABELS: Record<string, string> = { BT: 'BT', MT: 'MT', BT_MT: 'BT + MT' };

export function anmeCategoryLabel(category: string): string {
  return ANME_CATEGORY_LABELS[category] ?? category;
}

export function installerIdentityFromCompany(company: InstallerCompanyRow): InstallerIdentity {
  const blankToNull = (value: string | null): string | null => (value && value.trim() !== '' ? value.trim() : null);
  return {
    name: company.name,
    address: company.address,
    phone: company.phone,
    email: company.email,
    anmeCode: company.anmeCode,
    anmeCategory: company.anmeCategory,
    anmeValidTo: company.anmeValidTo.toISOString(),
    taxId: blankToNull(company.taxId),
    legalRepFullName: company.legalRepFullName,
    legalRepRole: company.legalRepRole,
    commercialRegister: blankToNull(company.commercialRegister),
  };
}

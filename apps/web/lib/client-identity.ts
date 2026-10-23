import { checkBillReading, type BillRequiredField, type StegBillReading } from '@dossipv/bill-reader';

/** Stored as the client name when the bill does not carry one; the installer is asked for the real name. */
export const CLIENT_NAME_PLACEHOLDER = 'Client à compléter';

export interface ClientIdentityNeeds {
  name: boolean;
  missingBillFields: BillRequiredField[];
}

/** What the installer still has to provide about the contract holder (the CIN is never required). */
export function clientIdentityNeeds(input: {
  fullName: string;
  reading: StegBillReading | null;
}): ClientIdentityNeeds {
  const name = input.fullName.trim() === '' || input.fullName.trim() === CLIENT_NAME_PLACEHOLDER;
  return {
    name,
    missingBillFields: input.reading ? checkBillReading(input.reading).missingFields : [],
  };
}

export interface StegBillLine {
  label: string;
  oldIndex: number | null;
  newIndex: number | null;
  quantityKWh: number | null;
  unitPrice: number | null;
  amountHT: number | null;
  vatPct: number | null;
}

export interface StegBillReading {
  clientName: string | null;
  civility: 'M' | 'Mme' | 'Mlle' | 'societe' | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  stegDistrict: string | null;
  governorate: string | null;
  governorateInferred: boolean;
  stegReference: string | null;
  meterNumber: string | null;
  /** ISO dates (YYYY-MM-DD). */
  periodStart: string | null;
  periodEnd: string | null;
  monthsBilled: number | null;
  subscribedPowerKVA: number | null;
  tariffLabel: string | null;
  lines: StegBillLine[];
  totalElectricityKWh: number | null;
  electricityAmountTND: number | null;
  amountDueTND: number | null;
  readingNotes: string[];
}

export type BillRequiredField =
  | 'clientName'
  | 'stegReference'
  | 'subscribedPowerKVA'
  | 'totalElectricityKWh'
  | 'monthsBilled';

export interface BillCheckResult {
  warnings: string[];
  missingFields: BillRequiredField[];
  derived: {
    monthsBilled: number | null;
    annualConsumptionKWh: number | null;
    averagePriceTNDPerKWh: number | null;
  };
}

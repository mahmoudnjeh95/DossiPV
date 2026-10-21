import type { StegBillReading } from '../../src/types';

export const testBill: StegBillReading = {
  clientName: 'MR TEST CLIENT',
  civility: 'M',
  address: '1 RUE DE TEST',
  postalCode: '2080',
  city: 'ARIANA',
  stegDistrict: 'ARIANA',
  governorate: 'Ariana',
  governorateInferred: true,
  stegReference: '00000 000 0',
  meterNumber: '0000000',
  periodStart: '2023-02-13',
  periodEnd: '2023-06-12',
  monthsBilled: 4,
  subscribedPowerKVA: 13,
  tariffLabel: 'BT Monophasé',
  lines: [
    { label: 'POINTE', oldIndex: 851, newIndex: 851, quantityKWh: 0, unitPrice: null, amountHT: null, vatPct: null },
    { label: 'JOUR', oldIndex: 26457, newIndex: 28691, quantityKWh: 2234, unitPrice: 0.14, amountHT: 312.76, vatPct: 13 },
    { label: 'HR-CREUSES', oldIndex: 43346, newIndex: 48144, quantityKWh: 4798, unitPrice: 0.116, amountHT: 556.568, vatPct: 13 },
  ],
  totalElectricityKWh: 7032,
  electricityAmountTND: null,
  amountDueTND: null,
  readingNotes: [],
};

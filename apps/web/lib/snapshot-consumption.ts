import { checkBillReading, type StegBillReading } from '@dossipv/bill-reader';

export interface SnapshotConsumption {
  annualConsumptionKWh: number;
  source: 'BILL' | 'MANUAL';
  billedKWh: number | null;
  monthsBilled: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

function isReading(value: unknown): value is StegBillReading {
  return typeof value === 'object' && value !== null && Array.isArray((value as { lines?: unknown }).lines);
}

/**
 * The consumption the dossier states. It comes from the bill when the client's yearly figure is
 * the one the bill import derived; any other value was typed by the installer. Null when the
 * client has no yearly consumption at all.
 */
export function buildSnapshotConsumption(
  client: { annualConsumptionKWh: number | null } | null,
  billImport: { annualConsumptionKWh: number | null; reading: unknown } | null,
): SnapshotConsumption | null {
  const annual = client?.annualConsumptionKWh ?? null;
  if (annual === null) return null;

  const fromBill =
    billImport !== null && billImport.annualConsumptionKWh !== null && billImport.annualConsumptionKWh === annual;
  if (!fromBill || !isReading(billImport.reading)) {
    return { annualConsumptionKWh: annual, source: 'MANUAL', billedKWh: null, monthsBilled: null, periodStart: null, periodEnd: null };
  }

  const reading = billImport.reading;
  return {
    annualConsumptionKWh: annual,
    source: 'BILL',
    billedKWh: reading.totalElectricityKWh ?? null,
    monthsBilled: reading.monthsBilled ?? checkBillReading(reading).derived.monthsBilled,
    periodStart: reading.periodStart ?? null,
    periodEnd: reading.periodEnd ?? null,
  };
}

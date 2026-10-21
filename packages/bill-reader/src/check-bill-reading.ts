import { SINGLE_PHASE_POWER_LADDER_KVA } from './ladder';
import type { BillCheckResult, BillRequiredField, StegBillReading } from './types';

const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;

function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / MS_PER_DAY;
}

export function checkBillReading(reading: StegBillReading): BillCheckResult {
  const warnings: string[] = [];
  const { totalElectricityKWh: total, subscribedPowerKVA: kva } = reading;

  const days = daysBetween(reading.periodStart, reading.periodEnd);
  const monthsFromDates = days === null ? null : Math.round(days / DAYS_PER_MONTH);
  const months = reading.monthsBilled ?? monthsFromDates;

  const quantities = reading.lines.filter((l) => l.quantityKWh !== null);
  if (total !== null && quantities.length > 0) {
    const sum = quantities.reduce((acc, l) => acc + (l.quantityKWh ?? 0), 0);
    if (Math.abs(sum - total) > 1) {
      warnings.push(
        `La somme des consommations par poste (${sum} kWh) ne correspond pas au total lu (${total} kWh).`,
      );
    }
  }

  for (const line of reading.lines) {
    if (line.oldIndex === null || line.newIndex === null || line.quantityKWh === null) continue;
    const diff = line.newIndex - line.oldIndex;
    if (Math.abs(diff - line.quantityKWh) > 0.5) {
      warnings.push(
        `Poste « ${line.label} » : l'écart d'index (${diff}) ne correspond pas à la quantité (${line.quantityKWh} kWh).`,
      );
    }
  }

  if (
    reading.monthsBilled !== null &&
    monthsFromDates !== null &&
    Math.abs(reading.monthsBilled - monthsFromDates) > 1
  ) {
    warnings.push(
      `Nombre de mois facturés (${reading.monthsBilled}) incohérent avec la période du ${reading.periodStart} au ${reading.periodEnd}.`,
    );
  }

  if (kva !== null && !(SINGLE_PHASE_POWER_LADDER_KVA as readonly number[]).includes(kva)) {
    warnings.push(
      `Puissance souscrite de ${kva} kVA inhabituelle pour un abonné monophasé — vérifier sur le compteur.`,
    );
  }

  const missingFields: BillRequiredField[] = [];
  if (!reading.clientName?.trim()) missingFields.push('clientName');
  if (!reading.stegReference?.trim()) missingFields.push('stegReference');
  if (kva === null) missingFields.push('subscribedPowerKVA');
  if (total === null) missingFields.push('totalElectricityKWh');
  if (months === null) missingFields.push('monthsBilled');

  const annualConsumptionKWh =
    total !== null && months !== null && months > 0 ? Math.round((total * 12) / months) : null;

  let averagePriceTNDPerKWh: number | null = null;
  if (total !== null && total > 0) {
    const amount = reading.lines
      .filter((l) => (l.quantityKWh ?? 0) > 0)
      .reduce((acc, l) => acc + (l.amountHT ?? 0), 0);
    if (amount > 0) averagePriceTNDPerKWh = Math.round((amount / total) * 10_000) / 10_000;
  }

  return {
    warnings,
    missingFields,
    derived: { monthsBilled: months, annualConsumptionKWh, averagePriceTNDPerKWh },
  };
}

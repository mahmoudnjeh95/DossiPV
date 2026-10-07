export interface StegInverterListing {
  /** Manufacturer exactly as printed (multi-line names joined with a space). */
  manufacturer: string;
  /** Commercial brand used as `Inverter.brand`. */
  brand: string;
  model: string;
  acPowerW: number;
  /** ISO date (YYYY-MM-DD). */
  acceptedUntil: string;
}

export interface AnmePanelListing {
  manufacturer: string;
  brand: string;
  country: string;
  model: string;
  certificationBody: string;
  certificateReference: string;
  /** ISO date (YYYY-MM-DD). */
  validUntil: string;
}

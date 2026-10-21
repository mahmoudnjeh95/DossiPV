export function describePvModule(m: {
  pmaxW: number; vmpV: number; impA: number; vocV: number; iscA: number; tempCoeffVocPct: number; tempCoeffIscPct: number;
  tempCoeffPmaxPct: number; irmA: number; maxSystemVoltageV: number; lengthMm: number; widthMm: number; weightKg: number;
}): string[] {
  return [
    `${m.pmaxW} Wc · Vmp ${m.vmpV} V · Imp ${m.impA} A · Voc ${m.vocV} V · Isc ${m.iscA} A`,
    `Coef. Voc ${m.tempCoeffVocPct} · Isc ${m.tempCoeffIscPct} · Pmax ${m.tempCoeffPmaxPct} %/°C · fusible ${m.irmA} A · ${m.maxSystemVoltageV} V`,
    `${m.lengthMm} × ${m.widthMm} mm · ${m.weightKg} kg`,
  ];
}

export function describeInverter(i: {
  phases: number; pacW: number; sacVA: number; vdcMaxV: number; mpptMinV: number; mpptMaxV: number; startUpV: number;
  mpptCount: number; inputsPerMppt: number; idcMaxPerMpptA: number; iscMaxPerMpptA: number; vacNomV: number; iacMaxA: number;
}): string[] {
  return [
    `${i.phases === 3 ? 'Triphasé' : 'Monophasé'} · ${i.pacW} W / ${i.sacVA} VA · ${i.vacNomV} V · Iac max ${i.iacMaxA} A`,
    `DC max ${i.vdcMaxV} V · MPPT ${i.mpptMinV}–${i.mpptMaxV} V · démarrage ${i.startUpV} V`,
    `${i.mpptCount} MPPT × ${i.inputsPerMppt} entrée(s) · Idc ${i.idcMaxPerMpptA} A · Isc ${i.iscMaxPerMpptA} A par MPPT`,
  ];
}

export interface DossierTemplateData {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  clientFullName: string;
  clientAddress: string;
  clientStegReference: string;
  introduction: string;
  solution: string;
  cabling: string;
  earthing: string;
  structure: string;
  conclusion: string;
  moduleBrandModel: string;
  inverterBrandModel: string;
  pDcW: string;
  moduleCount: string;
  // Flat fields, not nested objects — docxtemplater 3.71.0 (the installed version) does not
  // resolve dotted-path tags like {moduleSpecs.pmaxW} against nested render data (confirmed
  // empirically before writing this plan); every new tag must be a flat top-level key, same
  // as the existing pDcW/moduleCount fields.
  moduleSpecPmaxW: string;
  moduleSpecVmpV: string;
  moduleSpecImpA: string;
  moduleSpecVocV: string;
  moduleSpecIscA: string;
  inverterSpecPacW: string;
  inverterSpecVdcMaxV: string;
  inverterSpecMpptMinV: string;
  inverterSpecMpptMaxV: string;
  stringSizingNsMin: string;
  stringSizingNsMax: string;
  stringSizingNsOptMax: string;
  stringSizingNpMax: string;
  stringSizingNpOpt: string;
  voltageDropDuDcV: string;
  voltageDropDuDcPct: string;
  voltageDropDuAcV: string;
  voltageDropDuAcPct: string;
  stabilityWeightN: string;
  stabilityLhs: string;
  stabilityRhs: string;
  inverters: {
    inverterLabel: string;
    mppts: { mpptLabel: string; stringsInParallel: number; modulesPerString: number }[];
  }[];
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
  dcFuseRequired: boolean;
  acIsolatorRequired: boolean;
}

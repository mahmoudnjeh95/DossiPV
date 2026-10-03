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
  inverters: {
    inverterLabel: string;
    mppts: { mpptLabel: string; stringsInParallel: number; modulesPerString: number }[];
  }[];
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
  dcFuseRequired: boolean;
  acIsolatorRequired: boolean;
}

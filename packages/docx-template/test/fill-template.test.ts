import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { fillDossierTemplate } from '../src/fill-template';
import type { DossierTemplateData } from '../src/types';

const templatePath = join(import.meta.dirname, '..', 'template', 'dossier-template.docx');
const templateBuffer = readFileSync(templatePath);

function extractText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')!.asText();
  return xml
    .replace(/<[^>]+>/g, '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const baseData: DossierTemplateData = {
  companyName: 'SolarPro Tunisie',
  companyAddress: '12 Rue de la République, Tunis',
  companyPhone: '+216 71 000 000',
  companyEmail: 'contact@solarpro.tn',
  clientFullName: 'Ahmed Ben Ali',
  clientAddress: '45 Avenue Habib Bourguiba, Sousse',
  clientStegReference: 'STEG-2026-001',
  introduction: "Ce dossier présente l'installation photovoltaïque réalisée à l'adresse ci-dessus.",
  solution: 'La solution retenue utilise des modules à haute performance et un onduleur certifié.',
  cabling: 'Le câblage respecte la norme NF C 15-100.',
  earthing: 'La mise à la terre est assurée par un piquet de terre conforme.',
  structure: 'La structure est dimensionnée pour une vitesse de vent de 120 km/h.',
  conclusion: "L'installation est conforme aux exigences réglementaires en vigueur.",
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  pDcW: '3 100',
  moduleCount: '5',
  moduleSpecPmaxW: '620',
  moduleSpecVmpV: '41,2',
  moduleSpecImpA: '15,05',
  moduleSpecVocV: '49,3',
  moduleSpecIscA: '15,85',
  inverterSpecPacW: '4000',
  inverterSpecVdcMaxV: '1000',
  inverterSpecMpptMinV: '80',
  inverterSpecMpptMaxV: '550',
  stringSizingNsMin: '10',
  stringSizingNsMax: '14',
  stringSizingNsOptMax: '13',
  stringSizingNpMax: '2',
  stringSizingNpOpt: '2',
  voltageDropDuDcV: '2,3',
  voltageDropDuDcPct: '0,74',
  voltageDropDuAcV: '1,1',
  voltageDropDuAcPct: '0,48',
  stabilityWeightN: '1200',
  stabilityLhs: '1500',
  stabilityRhs: '1200',
  inverters: [
    {
      inverterLabel: 'Onduleur 1',
      mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  cableRuns: [{ label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13' }],
  dcFuseRequired: false,
  acIsolatorRequired: false,
};

describe('fillDossierTemplate', () => {
  it('fills the template with the given data and produces a valid, re-openable .docx', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);

    expect(result.length).toBeGreaterThan(0);

    const zip = new PizZip(result);
    expect(() => new Docxtemplater(zip)).not.toThrow();
  });

  it('substitutes plain-value tags, including French accented characters', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);
    const text = extractText(result);

    expect(text).toContain('SolarPro Tunisie');
    expect(text).toContain('Ahmed Ben Ali');
    expect(text).toContain(baseData.introduction);
  });

  it('renders every inverter and every MPPT in a multi-inverter, multi-MPPT project', () => {
    const multiData: DossierTemplateData = {
      ...baseData,
      inverters: [
        {
          inverterLabel: 'Onduleur 1',
          mppts: [
            { mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 },
            { mpptLabel: 'MPPT 2', stringsInParallel: 2, modulesPerString: 4 },
          ],
        },
        { inverterLabel: 'Onduleur 2', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 6 }] },
      ],
    };

    const result = fillDossierTemplate(templateBuffer, multiData);
    const text = extractText(result);

    expect(text).toContain('Onduleur 1');
    expect(text).toContain('Onduleur 2');
    expect(text).toContain('MPPT 2');
  });

  it('renders the DC fuse section when dcFuseRequired is true, omits it when false', () => {
    const withFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: true }));
    const withoutFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: false }));

    expect(withFuse).toContain('fusible DC est requis');
    expect(withoutFuse).not.toContain('fusible DC est requis');
  });

  it('renders the AC isolator section when acIsolatorRequired is true, omits it when false', () => {
    const withIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: true }));
    const withoutIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: false }));

    expect(withIsolator).toContain('sectionneur AC est requis');
    expect(withoutIsolator).not.toContain('sectionneur AC est requis');
  });

  it('fills the module and inverter spec tables and the calculation-result tables', () => {
    // Flat field names (moduleSpecPmaxW, not nested moduleSpecs.pmaxW) — this installed
    // docxtemplater version does not resolve dotted-path tags; see Task 3's note.
    const data: DossierTemplateData = {
      ...baseData, // this file's existing complete fixture object — extend it, don't rebuild it
      moduleSpecPmaxW: '620',
      moduleSpecVmpV: '46,5',
      moduleSpecImpA: '13,33',
      moduleSpecVocV: '55,9',
      moduleSpecIscA: '13,92',
      inverterSpecPacW: '3000',
      inverterSpecVdcMaxV: '550',
      inverterSpecMpptMinV: '90',
      inverterSpecMpptMaxV: '550',
      stringSizingNsMin: '3',
      stringSizingNsMax: '9',
      stringSizingNsOptMax: '8',
      stringSizingNpMax: '2',
      stringSizingNpOpt: '1',
      voltageDropDuDcV: '2,1',
      voltageDropDuDcPct: '1,11',
      voltageDropDuAcV: '3,4',
      voltageDropDuAcPct: '1,47',
      stabilityWeightN: '2450',
      stabilityLhs: '1200',
      stabilityRhs: '900',
    };

    const filledBuffer = fillDossierTemplate(templateBuffer, data);

    const zip = new PizZip(filledBuffer);
    const documentXml = zip.file('word/document.xml')!.asText();
    expect(documentXml).toContain('620');
    expect(documentXml).toContain('46,5');
    expect(documentXml).toContain('1,11');
  });
});

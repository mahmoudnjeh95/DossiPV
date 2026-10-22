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

/** The text of every paragraph styled `style` (e.g. the docx `Title`), in document order. */
function paragraphsWithStyle(buffer: Buffer, style: string): string[] {
  const xml = new PizZip(buffer).file('word/document.xml')!.asText();
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
    .filter((p) => p.includes(`<w:pStyle w:val="${style}"/>`))
    .map((p) => p.replace(/<[^>]+>/g, '').replace(/&apos;/g, "'"));
}

const baseData: DossierTemplateData = {
  isDraft: false,
  draftMissingText: '',
  siteBuildingLine: 'Bâtiment : maison individuelle, toiture au niveau R+1',
  earthingDetails: [{ label: 'Schéma de liaison à la terre', value: 'TT' }],
  companyName: 'SolarPro Tunisie',
  companyAddress: '12 Rue de la République, Tunis',
  companyPhone: '+216 71 000 000',
  companyEmail: 'contact@solarpro.tn',
  clientFullName: 'Ahmed Ben Ali',
  clientAddress: '45 Avenue Habib Bourguiba, Sousse',
  clientStegReference: 'STEG-2026-001',
  dossierNumber: '434 - 303',
  dossierDateText: '25/11/2026',
  installerAnmeLine: "Installateur agréé ANME n° ANME-TEST-01 (catégorie BT), agrément valable jusqu'au 31/12/2027",
  installerTaxIdLine: 'Matricule fiscal : 1234567/A/M/000',
  installerLegalRepLine: 'Représentant légal : MR TEST GERANT, Gérant',
  clientCinLine: 'CIN : 01234567',
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
  stabilityComputed: true,
  stabilityWeightN: '1200',
  stabilityLhs: '1500',
  stabilityRhs: '1200',
  sectionNumberPreambule: 'I.',
  sectionNumberPresentation: 'II.',
  sectionNumberDimensionnement: 'III.',
  sectionNumberSolution: 'IV.',
  sectionNumberCablage: 'V.',
  sectionNumberTerre: 'VI.',
  sectionNumberStructure: 'VII.',
  sectionNumberFusible: '',
  sectionNumberSectionneur: '',
  sectionNumberConclusion: 'VIII.',
  sizingBranchement: 'Monophasé BT',
  sizingSubscribedPower: '6 kVA',
  sizingConsumption: "4 800 kWh/an (valeur saisie par l'installateur)",
  sizingInstalledKWp: '3,10',
  sizingInverterPac: '3,00',
  sizingDcAcRatio: '1,03',
  sizingRule: 'Règle de test.',
  productionAnnual: '5 400',
  productionSpecificYield: '1 742',
  productionPr: '81,6 %',
  productionCoverage: '113 %',
  productionMethod: 'Méthode de test.',
  productionMonths: [
    { monthLabel: 'Janvier', globInc: '90,1', eGrid: '250', pr: '80,0' },
    { monthLabel: 'Février', globInc: '110,2', eGrid: '300', pr: '81,0' },
  ],
  productionTotalGlobInc: '200,3',
  productionTotalEGrid: '550',
  inverters: [
    {
      inverterLabel: 'Onduleur 1',
      inverterBrandModel: 'Sofar 1-4KTL2-G3',
      pacW: '4000',
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
          inverterBrandModel: 'Sofar 1-4KTL2-G3',
          pacW: '3000',
          mppts: [
            { mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 },
            { mpptLabel: 'MPPT 2', stringsInParallel: 2, modulesPerString: 4 },
          ],
        },
        { inverterLabel: 'Onduleur 2', inverterBrandModel: 'Sofar 1-4KTL2-G3', pacW: '3000', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 6 }] },
      ],
    };

    const result = fillDossierTemplate(templateBuffer, multiData);
    const text = extractText(result);

    expect(text).toContain('Onduleur 1');
    expect(text).toContain('Onduleur 2');
    expect(text).toContain('MPPT 2');
  });

  it('shows each inverter\'s OWN brand/model and power in a mixed-model array, not the first inverter repeated (I7)', () => {
    const mixedData: DossierTemplateData = {
      ...baseData,
      inverterBrandModel: 'Sofar 1-4KTL2-G3',
      inverters: [
        { inverterLabel: 'Onduleur 1', inverterBrandModel: 'Sofar 1-4KTL2-G3', pacW: '3000', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 5 }] },
        { inverterLabel: 'Onduleur 2', inverterBrandModel: 'Huawei SUN2000-5KTL', pacW: '5000', mppts: [{ mpptLabel: 'MPPT 1', stringsInParallel: 1, modulesPerString: 8 }] },
      ],
    };

    const result = fillDossierTemplate(templateBuffer, mixedData);
    const text = extractText(result);

    expect(text).toContain('Sofar 1-4KTL2-G3');
    expect(text).toContain('Huawei SUN2000-5KTL');
    expect(text).toContain('3000');
    expect(text).toContain('5000');
  });

  it('renders the DC fuse section when dcFuseRequired is true, omits it when false', () => {
    const withFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: true }));
    const withoutFuse = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: false }));

    expect(withFuse).toContain('fusible DC est requis');
    expect(withoutFuse).not.toContain('fusible DC est requis');
  });

  it('prints the section numbers the caller computes, never a hardcoded literal (I4) — VI is directly followed by the given Conclusion number when VII/VIII are both absent', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: false, acIsolatorRequired: false, sectionNumberStructure: 'VI.', sectionNumberConclusion: 'VII.' }));

    expect(text).toContain('VI. Structure et lestage');
    expect(text).toContain('VII. Conclusion');
    // The literal "IX" this fix removed must never appear when both conditional sections are absent.
    expect(text).not.toContain('IX. Conclusion');
  });

  it('prints VII and VIII with the numbers the caller computes when both conditional sections are present', () => {
    const text = extractText(
      fillDossierTemplate(templateBuffer, {
        ...baseData,
        dcFuseRequired: true,
        acIsolatorRequired: true,
        sectionNumberFusible: 'VII.',
        sectionNumberSectionneur: 'VIII.',
        sectionNumberConclusion: 'IX.',
      }),
    );

    expect(text).toContain('VII. Protection DC — fusible');
    expect(text).toContain('VIII. Protection AC — sectionneur');
    expect(text).toContain('IX. Conclusion');
  });

  it('renders the AC isolator section when acIsolatorRequired is true, omits it when false', () => {
    const withIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: true }));
    const withoutIsolator = extractText(fillDossierTemplate(templateBuffer, { ...baseData, acIsolatorRequired: false }));

    expect(withIsolator).toContain('sectionneur AC est requis');
    expect(withoutIsolator).not.toContain('sectionneur AC est requis');
  });

  it('renders the stability table only when stabilityComputed is true', () => {
    const withStability = extractText(fillDossierTemplate(templateBuffer, { ...baseData, stabilityComputed: true }));
    const withoutStability = extractText(
      fillDossierTemplate(templateBuffer, {
        ...baseData,
        stabilityComputed: false,
        stabilityWeightN: '',
        stabilityLhs: '',
        stabilityRhs: '',
      }),
    );

    expect(withStability).toContain('Poids total (N)');
    expect(withoutStability).not.toContain('Poids total (N)');
    expect(withoutStability).not.toContain('Stabilité — membre gauche');
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

  it('renders the dimensioning and production section with its monthly rows', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, baseData));

    expect(text).toContain('III. Dimensionnement et productible');
    expect(text).toContain('Production annuelle estimée');
    expect(text).toContain('Janvier');
    expect(text).toContain('Février');
    expect(text).toContain('Total');
    expect(text).toContain('550');
    expect(text).not.toContain('undefined');
  });

  it('titles the dossier with its subject and number, no longer with the company name', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);
    const titles = paragraphsWithStyle(result, 'Title');

    expect(titles).toEqual(["Dossier technique de raccordement d'une installation photovoltaïque au réseau BT de la STEG"]);
    expect(extractText(result)).toContain('Dossier n° 434 - 303 du 25/11/2026');
  });

  it('prints the draft notice under the title only for a draft', () => {
    const draft = extractText(
      fillDossierTemplate(templateBuffer, {
        ...baseData,
        isDraft: true,
        draftMissingText: 'Copie de la CIN du titulaire ; Autorisation du syndic ou des copropriétaires',
      }),
    );
    const title = "Dossier technique de raccordement d'une installation photovoltaïque au réseau BT de la STEG";
    const notice =
      'BROUILLON – NON RECEVABLE. Pièces manquantes : Copie de la CIN du titulaire ; Autorisation du syndic ou des copropriétaires';
    expect(draft).toContain(`${title}${notice}Dossier n° 434 - 303`);

    const complete = extractText(fillDossierTemplate(templateBuffer, baseData));
    expect(complete).not.toContain('BROUILLON');
    expect(complete).not.toContain('Pièces manquantes');
  });

  it('prints the installer block and the client CIN line in the preamble', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, baseData));

    expect(text).toContain("Installateur agréé ANME n° ANME-TEST-01 (catégorie BT), agrément valable jusqu'au 31/12/2027");
    expect(text).toContain('Matricule fiscal : 1234567/A/M/000');
    expect(text).toContain('Représentant légal : MR TEST GERANT, Gérant');
    expect(text).toContain('CIN : 01234567');
    expect(text.indexOf('CIN : 01234567')).toBeLessThan(text.indexOf('Présentation du projet'));
  });

  describe('reference document style (Task 17)', () => {
    const filled = fillDossierTemplate(templateBuffer, baseData);
    const zip = new PizZip(filled);
    const documentXml = zip.file('word/document.xml')!.asText();
    const stylesXml = zip.file('word/styles.xml')!.asText();
    const tables = documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    const rowsOf = (table: string): string[] => table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
    const cellsOf = (row: string): string[] => row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    const textOf = (xml: string): string => xml.replace(/<[^>]+>/g, '');
    const tableContaining = (needle: string): string => tables.find((t) => textOf(t).includes(needle))!;

    it('shades a header row in amber FFC000 and a label cell in FBE4D5', () => {
      const cableTable = tableContaining('Mode de pose');
      const headerCells = cellsOf(rowsOf(cableTable)[0]!);
      expect(headerCells.length).toBeGreaterThan(0);
      for (const headerCell of headerCells) {
        expect(headerCell).toMatch(/<w:shd [^>]*w:fill="FFC000"/);
        expect(headerCell).toContain('<w:b/>');
      }

      const moduleTable = tableContaining('Puissance crête (Wc)');
      const [labelCell, valueCell] = cellsOf(rowsOf(moduleTable)[0]!);
      expect(textOf(labelCell!)).toBe('Puissance crête (Wc)');
      expect(labelCell).toMatch(/<w:shd [^>]*w:fill="FBE4D5"/);
      expect(valueCell).not.toContain('<w:shd');
    });

    it('draws every table border single, size 4', () => {
      const moduleTable = tableContaining('Puissance crête (Wc)');
      for (const side of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']) {
        expect(moduleTable).toMatch(new RegExp(`<w:${side} w:val="single" w:color="[0-9A-Fa-f]{6}" w:sz="4"/>|<w:${side} w:val="single" w:sz="4"[^>]*/>`));
      }
    });

    it('sets Times New Roman 11 pt as the default run font', () => {
      const rPrDefault = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(stylesXml)?.[0] ?? '';
      expect(rPrDefault).toMatch(/<w:rFonts [^>]*w:ascii="Times New Roman"/);
      expect(rPrDefault).toMatch(/<w:rFonts [^>]*w:hAnsi="Times New Roman"/);
      expect(rPrDefault).toContain('<w:sz w:val="22"/>');
    });

    it('prints the module values in blue 1F4E9A', () => {
      const moduleTable = tableContaining('Puissance crête (Wc)');
      const valueCell = cellsOf(rowsOf(moduleTable)[0]!)[1]!;
      const run = /<w:r>(?:(?!<\/w:r>)[\s\S])*?620(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/.exec(valueCell)?.[0] ?? '';
      expect(run).toContain('<w:color w:val="1F4E9A"/>');
    });

    it('styles the headings bold and black (13 pt, then 11 pt underlined), with no blue theme colour anywhere', () => {
      const style = (id: string): string => new RegExp(`<w:style [^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(stylesXml)?.[0] ?? '';
      const heading1 = style('Heading1');
      expect(heading1).toContain('<w:b/>');
      expect(heading1).toContain('<w:color w:val="000000"/>');
      expect(heading1).toContain('<w:sz w:val="26"/>');
      const heading2 = style('Heading2');
      expect(heading2).toContain('<w:b/>');
      expect(heading2).toMatch(/<w:u w:val="single"\/>/);
      expect(heading2).toContain('<w:color w:val="000000"/>');
      expect(heading2).toContain('<w:sz w:val="22"/>');
      for (const blue of ['2E74B5', '1F4D78', '0563C1']) expect(stylesXml).not.toContain(blue);
      expect(stylesXml).not.toContain('w:themeColor');
      expect(documentXml).not.toContain('w:themeColor');
    });

    it('keeps the section numbers as the roman numerals of the Heading 1 titles', () => {
      expect(paragraphsWithStyle(filled, 'Heading1')).toContain('I. Préambule');
    });
  });

  it('ends with the two-column signature table after the conclusion', () => {
    const result = fillDossierTemplate(templateBuffer, baseData);
    const xml = new PizZip(result).file('word/document.xml')!.asText();
    const text = extractText(result);
    const signatureTable = xml.slice(xml.lastIndexOf('<w:tbl>'));

    expect(text.indexOf("Établi par l'installateur")).toBeGreaterThan(text.indexOf(baseData.conclusion));
    for (const expected of ["Établi par l'installateur", 'Représentant légal : MR TEST GERANT, Gérant', 'Signature et cachet :', 'Lu et approuvé — le titulaire du contrat', 'Ahmed Ben Ali', 'Signature :']) {
      expect(signatureTable.replace(/<[^>]+>/g, '').replace(/&apos;/g, "'")).toContain(expected);
    }
    expect(signatureTable.match(/<w:tc>/g)).toHaveLength(2);
    expect(signatureTable.match(/Date :/g)).toHaveLength(2);
  });
});

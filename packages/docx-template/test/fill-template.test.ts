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
  structureRows: [
    { label: 'Matériau', value: 'ALUMINIUM' },
    { label: 'Lestage', value: '2 × 25 kg par cadre' },
  ],
  stabilityNotes: [
    { title: 'Stabilité au vent', formula: '(P − Cp × S) × D > 2 × Ct × S × H', application: '(1 200 − 10 × 2) × 1 > 2 × 5 × 2 × 1', result: '1 180 > 20', conclusion: 'condition vérifiée' },
  ],
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
  conclusionText: "L'installation est conforme aux exigences réglementaires en vigueur.",
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  pDcW: '3 100',
  moduleCount: '5',
  documentationRows: [
    { designation: "N°1 — Dossier administratif", annex: '1' },
    { designation: 'N°3 — Attestation de conformité de la structure', annex: '—' },
  ],
  equipmentRows: [
    { designation: 'Modules photovoltaïques', quantity: '5', brand: 'LONGi', reference: 'LR7-72HGD-620M', annex: '11' },
    { designation: 'Interrupteur-sectionneur AC', quantity: '—', brand: '—', reference: '—', annex: '—' },
  ],
  moduleSpecRows: [
    { label: 'Puissance crête (Wc)', value: '620' },
    { label: 'Coefficient de température Voc (β)', value: '-0,26 %/°C' },
  ],
  inverterSpecTables: [{ inverterLabel: 'Onduleur 1', rows: [{ label: 'Plage MPPT', value: '80 – 550 V' }] }],
  deviceRatingRows: [{ device: 'Parafoudre DC', ratings: 'Type 2 · Ucpv 1 000 V' }],
  complianceRows: [
    { id: 'C01', label: 'Tension Voc à Tmin inférieure à la tension DC maximale de l’onduleur', result: 'Conforme' },
    { id: 'C21', label: 'Onduleur présent dans la liste STEG', result: 'Avertissement' },
  ],
  temperatureAssumptions: 'Tmin = -10 °C, Tmax = 85 °C (hypothèses de calcul)',
  stringSizingNotes: [
    {
      title: 'Tension de circuit ouvert du module à Tmin : Voc(Tmin)',
      formula: 'Voc(Tmin) = Voc × [1 + βVoc/100 × (Tmin - 25)]\nVoc : tension de circuit ouvert du module aux STC',
      application: 'Voc(Tmin) = 55,9 × [1 + (-0,25)/100 × (-10 - 25)] = 60,79 V',
      result: 'Voc(Tmin) = 60,79 V',
      conclusion: null,
    },
    {
      title: 'Ns retenu',
      formula: 'Ns min ≤ Ns ≤ min(Ns max ; Ns optimal max)',
      application: '3 ≤ 5 ≤ min(9 ; 10) = 9',
      result: 'Ns = 5 modules en série par chaîne',
      conclusion: 'Ns retenu = 5 ≤ min(Ns max, Ns optimal max) = 9 et ≥ Ns min = 3 : condition vérifiée.',
    },
  ],
  protectionNotes: [
    {
      title: 'Interrupteur-sectionneur DC',
      formula: 'Ue ≥ Voc(Tmin) de la chaîne = Ns × Voc(Tmin)\nIn ≥ courant de conception du champ = 1,25 × Isc × Np (UTE C15-712-1)',
      application: 'Ns × Voc(Tmin) = 5 × 60,79 = 303,96 V\n1,25 × Isc × Np = 1,25 × 13,92 × 1 = 17,40 A',
      result: 'Ue = 600 V ≥ 303,96 V ; In = 25 A ≥ 17,40 A',
      chosen: 'ZJ BENY BB1H-63 — 600 V, 25 A',
      conclusion: "L'interrupteur-sectionneur DC choisi est conforme.",
    },
  ],
  cableSizingRows: [
    {
      link: 'Liaison DC (Ch PV 1)',
      installMethodText: 'Chemin de câbles perforé (mode de pose 13)',
      sectionMm2: '6',
      iz: '56',
      k1: '1',
      k2: '1',
      k3: '0,82',
      k4: '1',
      izCorrected: '45,92',
      designCurrent: '17,40',
      factorsText: 'Mode de pose : Chemin de câbles perforé (mode de pose 13) → K1 = 1\nGroupement : un seul circuit → K2 = 1',
      application: "Iz' = 56 × 1 × 1 × 0,82 × 1 = 45,92 A",
      result: "Iz' = 45,92 A",
      conclusion: "Iz' = 45,92 A ≥ courant de conception 1,25 × Isc × Np = 17,40 A : condition vérifiée, la section de 6 mm² est retenue.",
    },
  ],
  voltageDropRows: [
    {
      link: 'Liaison AC (Onduleur → TGBT)',
      formula: 'ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × Iac max ; ΔU (%) = 100 × ΔU / Un\nb = 2 en monophasé',
      rho: '0,02314',
      lengthM: '10',
      currentA: '16',
      sectionMm2: '4',
      voltageV: '230',
      dropV: '1,496',
      dropPct: '0,65',
      limitPct: '1',
      application: 'ΔU = 2 × (0,02314 × 10 / 4 × 0,8 + 0,00008 × 10 × 0,6) × 16 = 1,496 V\nΔU (%) = 100 × 1,496 / 230 = 0,65 %',
      result: 'ΔU = 1,496 V, soit 0,65 %',
      conclusion: 'ΔU = 0,65 % ≤ 1 % : la chute de tension est admissible.',
    },
  ],
  voltageDropLimitsText: 'La chute de tension est calculée pour chaque tronçon ; limites : DC 3 %, AC 1 % (UTE C15-712-1).',
  stabilityComputed: true,
  stabilityWeightN: '1200',
  stabilityLhs: '1500',
  stabilityRhs: '1200',
  sectionNumberPreambule: 'I.',
  sectionNumberPresentation: 'II.',
  sectionNumberDimensionnement: 'III.',
  sectionNumberSolution: 'IV.',
  sectionNumberProtections: 'V.',
  sectionNumberCablage: 'VI.',
  sectionNumberTerre: 'VII.',
  sectionNumberStructure: 'VIII.',
  sectionNumberFusible: '',
  sectionNumberSectionneur: '',
  sectionNumberCompliance: 'IX.',
  sectionNumberConclusion: 'X.',
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
  cableRuns: [{ label: 'DC-1', sectionMm2: '6', lengthM: '20', installMethod: 'Chemin de câbles perforé (mode de pose 13)' }],
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

  it('prints the section numbers the caller computes, never a hardcoded literal (I4) — the compliance section is followed by the given Conclusion number when VII/VIII are both absent', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, { ...baseData, dcFuseRequired: false, acIsolatorRequired: false, sectionNumberStructure: 'VI.', sectionNumberCompliance: 'VII.', sectionNumberConclusion: 'VIII.' }));

    expect(text).toContain('VI. Structure et lestage');
    expect(text).toContain('VIII. Conclusion');
    expect(text).toContain('VII. Vérifications réglementaires');
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
        sectionNumberCompliance: 'IX.',
        sectionNumberConclusion: 'X.',
      }),
    );

    expect(text).toContain('VII. Protection DC — fusible');
    expect(text).toContain('VIII. Protection AC — sectionneur');
    expect(text).toContain('X. Conclusion');
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

  it('renders the structure rows and the wind stability note', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, baseData));

    expect(text).toContain('2 × 25 kg par cadre');
    expect(text).toContain('Stabilité au vent');
    expect(text).toContain('condition vérifiée');
    const without = extractText(fillDossierTemplate(templateBuffer, { ...baseData, stabilityNotes: [] }));
    expect(without).not.toContain('Stabilité au vent');
  });

  it('fills the documentation, equipment, characteristics, rating and compliance tables', () => {
    const text = extractText(fillDossierTemplate(templateBuffer, baseData));

    expect(text).toContain('Documentation de la solution');
    expect(text).toContain('Équipements de la solution');
    expect(text).toContain('LR7-72HGD-620M');
    expect(text).toContain('Coefficient de température Voc (β)');
    expect(text).toContain('-0,26 %/°C');
    expect(text).toContain('Onduleur 1');
    expect(text).toContain('Plage MPPT');
    expect(text).toContain('Caractéristiques des équipements DC et AC');
    expect(text).toContain('Ucpv 1 000 V');
    expect(text).toContain('Vérifications réglementaires');
    expect(text).toContain('Avertissement');
    expect(text.indexOf('Vérifications réglementaires')).toBeLessThan(text.indexOf('Conclusion'));
  });

  describe('cable sizing and voltage drop notes (Task 21)', () => {
    const filled = fillDossierTemplate(templateBuffer, baseData);
    const xml = new PizZip(filled).file('word/document.xml')!.asText();
    const lines = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
      .map((p) => p.replace(/<w:br\/>/g, '|').replace(/<[^>]+>/g, '').replace(/&apos;/g, "'"))
      .filter((line) => line !== '');
    const runOf = (needle: string): string => (xml.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g) ?? []).find((run) => run.includes(needle))!;
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    const tableText = (needle: string): string => tables.map((t) => t.replace(/<[^>]+>/g, '')).map((t) => t.replace(/&apos;/g, "'")).find((t) => t.includes(needle))!;

    it('prints the Iz\' formula with the K1–K4 definitions and their NF C 15-100 tables, the table, then each run note', () => {
      const start = lines.indexOf('VI.1 Dimensionnement des câbles');
      expect(start).toBeGreaterThan(lines.indexOf('VI. Câblage'));
      expect(lines.slice(start + 2, start + 10)).toEqual([
        "Iz' = Iz × K1 × K2 × K3 × K4",
        'Avec :',
        "Iz' : courant admissible du câble dans ses conditions de pose (A) ;",
        'Iz : courant admissible de référence du câble choisi, donné par le fabricant pour sa méthode de référence (B, C, E ou F) à 30 °C (A) ;',
        'K1 : facteur de correction lié au mode de pose (NF C 15-100, tableau 52C pour le mode de pose, tableau 52G pour la méthode de référence) ;',
        'K2 : facteur de correction lié au groupement de circuits jointifs (NF C 15-100, tableau 52N) ;',
        "K3 : facteur de correction lié à la température ambiante et à la nature de l'isolant (NF C 15-100, tableau 52K) ;",
        'K4 : facteur de correction lié au nombre de couches de câbles (NF C 15-100, tableau 52O).',
      ]);
      expect(tableText("Iz' (A)")).toContain(['Liaison DC (Ch PV 1)', '6', '56', '1', '1', '0,82', '1', '45,92', '17,40'].join(''));
      const note = lines.lastIndexOf('Liaison DC (Ch PV 1)');
      expect(lines.slice(note, note + 5)).toEqual([
        'Liaison DC (Ch PV 1)',
        'Mode de pose : Chemin de câbles perforé (mode de pose 13) → K1 = 1|Groupement : un seul circuit → K2 = 1',
        "Application numérique : Iz' = 56 × 1 × 1 × 0,82 × 1 = 45,92 A",
        "Résultat : Iz' = 45,92 A",
        "Iz' = 45,92 A ≥ courant de conception 1,25 × Isc × Np = 17,40 A : condition vérifiée, la section de 6 mm² est retenue.",
      ]);
      expect(runOf('45,92 A ≥ courant')).toContain('<w:color w:val="C00000"/>');
      expect(runOf('45,92 A ≥ courant')).toMatch(/<w:u w:val="single"\/>/);
      expect(runOf('Mode de pose : Chemin')).toContain('<w:color w:val="1F4E9A"/>');
    });

    it('prints the voltage drop limits, the per-run table with its own limit, then each run note, before the earthing section', () => {
      const start = lines.indexOf('VI.2 Chute de tension');
      expect(start).toBeGreaterThan(lines.indexOf('VI.1 Dimensionnement des câbles'));
      expect(lines[start + 1]).toBe('La chute de tension est calculée pour chaque tronçon ; limites : DC 3 %, AC 1 % (UTE C15-712-1).');
      expect(tableText('ΔU (%)')).toContain(['Liaison', 'ρ (Ω·mm²/m)', 'L (m)', 'I (A)', 'S (mm²)', 'U (V)', 'ΔU (V)', 'ΔU (%)', 'Limite (%)'].join(''));
      expect(tableText('ΔU (%)')).toContain(['Liaison AC (Onduleur → TGBT)', '0,02314', '10', '16', '4', '230', '1,496', '0,65', '1'].join(''));
      const note = lines.lastIndexOf('Liaison AC (Onduleur → TGBT)');
      expect(lines.slice(note, note + 5)).toEqual([
        'Liaison AC (Onduleur → TGBT)',
        'Formule : ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × Iac max ; ΔU (%) = 100 × ΔU / Un|b = 2 en monophasé',
        'Application numérique : ΔU = 2 × (0,02314 × 10 / 4 × 0,8 + 0,00008 × 10 × 0,6) × 16 = 1,496 V|ΔU (%) = 100 × 1,496 / 230 = 0,65 %',
        'Résultat : ΔU = 1,496 V, soit 0,65 %',
        'ΔU = 0,65 % ≤ 1 % : la chute de tension est admissible.',
      ]);
      expect(lines[note + 5]).toBe('VII. Mise à la terre');
      expect(runOf('la chute de tension est admissible')).toContain('<w:color w:val="C00000"/>');
    });
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

  describe('string sizing calculation notes (Task 19)', () => {
    const filled = fillDossierTemplate(templateBuffer, baseData);
    const xml = new PizZip(filled).file('word/document.xml')!.asText();
    const text = extractText(filled);
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const paragraphText = (p: string): string => p.replace(/<[^>]+>/g, '').replace(/&apos;/g, "'");

    it('prints the temperatures, then each note: bold title, formula, application numérique, result and conclusion', () => {
      const lines = paragraphs.map(paragraphText).filter((line) => line !== '');
      const start = lines.indexOf('IV.4 Dimensionnement du champ PV');
      expect(start).toBeGreaterThan(lines.indexOf('IV.3 Onduleurs et chaînes'));
      expect(lines.slice(start + 3, start + 13)).toEqual([
        'Températures de calcul : Tmin = -10 °C, Tmax = 85 °C (hypothèses de calcul)',
        'Tension de circuit ouvert du module à Tmin : Voc(Tmin)',
        'Formule : Voc(Tmin) = Voc × [1 + βVoc/100 × (Tmin - 25)]Voc : tension de circuit ouvert du module aux STC',
        'Application numérique : Voc(Tmin) = 55,9 × [1 + (-0,25)/100 × (-10 - 25)] = 60,79 V',
        'Résultat : Voc(Tmin) = 60,79 V',
        'Ns retenu',
        'Formule : Ns min ≤ Ns ≤ min(Ns max ; Ns optimal max)',
        'Application numérique : 3 ≤ 5 ≤ min(9 ; 10) = 9',
        'Résultat : Ns = 5 modules en série par chaîne',
        'Ns retenu = 5 ≤ min(Ns max, Ns optimal max) = 9 et ≥ Ns min = 3 : condition vérifiée.',
      ]);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
    });

    it('styles the title bold, the label and the conclusion red underlined, the result blue, and breaks multi-line values', () => {
      const runOf = (needle: string): string => /<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g[Symbol.match](xml)!.find((run) => run.includes(needle))!;
      expect(runOf('Ns retenu</w:t>')).toContain('<w:b/>');
      for (const red of ['Application numérique :', 'condition vérifiée.']) {
        expect(runOf(red)).toContain('<w:color w:val="C00000"/>');
        expect(runOf(red)).toMatch(/<w:u w:val="single"\/>/);
      }
      expect(runOf('Voc(Tmin) = 60,79 V</w:t>')).toContain('<w:color w:val="1F4E9A"/>');
      const formula = paragraphs.find((p) => p.includes('Formule : '))!;
      expect(formula).toContain('<w:br/>');
    });

    it('has no bare Ns/Np results table left (STEG remark 6)', () => {
      const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
      for (const table of tables) expect(table.replace(/<[^>]+>/g, '')).not.toContain('Ns optimal max');
    });
  });

  it('prints the protection sizing notes in their own section, between the solution and the cabling (Task 20)', () => {
    const filled = fillDossierTemplate(templateBuffer, baseData);
    const xml = new PizZip(filled).file('word/document.xml')!.asText();
    const lines = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
      .map((p) => p.replace(/<w:br\/>/g, '|').replace(/<[^>]+>/g, '').replace(/&apos;/g, "'"))
      .filter((line) => line !== '');
    const start = lines.indexOf('V. Dimensionnement des protections');

    expect(paragraphsWithStyle(filled, 'Heading1')).toContain('V. Dimensionnement des protections');
    expect(start).toBeGreaterThan(lines.indexOf('IV.4 Dimensionnement du champ PV'));
    expect(lines.slice(start + 1, start + 8)).toEqual([
      'Interrupteur-sectionneur DC',
      'Exigences : Ue ≥ Voc(Tmin) de la chaîne = Ns × Voc(Tmin)|In ≥ courant de conception du champ = 1,25 × Isc × Np (UTE C15-712-1)',
      'Application numérique : Ns × Voc(Tmin) = 5 × 60,79 = 303,96 V|1,25 × Isc × Np = 1,25 × 13,92 × 1 = 17,40 A',
      'Résultat : Ue = 600 V ≥ 303,96 V ; In = 25 A ≥ 17,40 A',
      'Matériel retenu : ZJ BENY BB1H-63 — 600 V, 25 A',
      "L'interrupteur-sectionneur DC choisi est conforme.",
      'VI. Câblage',
    ]);
    const chosenRun = (xml.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g) ?? []).find((run) => run.includes('ZJ BENY BB1H-63'))!;
    expect(chosenRun).toContain('<w:color w:val="1F4E9A"/>');
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

    expect(text.indexOf("Établi par l'installateur")).toBeGreaterThan(text.indexOf(baseData.conclusionText));
    for (const expected of ["Établi par l'installateur", 'Représentant légal : MR TEST GERANT, Gérant', 'Signature et cachet :', 'Lu et approuvé — le titulaire du contrat', 'Ahmed Ben Ali', 'Signature :']) {
      expect(signatureTable.replace(/<[^>]+>/g, '').replace(/&apos;/g, "'")).toContain(expected);
    }
    expect(signatureTable.match(/<w:tc>/g)).toHaveLength(2);
    expect(signatureTable.match(/Date :/g)).toHaveLength(2);
  });
});

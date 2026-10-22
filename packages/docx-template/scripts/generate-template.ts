import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

function cell(text: string): TableCell {
  return new TableCell({ children: [new Paragraph(text)] });
}

function specTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, tag]) => new TableRow({ children: [cell(label), cell(tag)] })),
  });
}

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: '{companyName}', heading: HeadingLevel.TITLE }),
        new Paragraph('{companyAddress} — {companyPhone} — {companyEmail}'),
        new Paragraph({ text: '{sectionNumberPreambule} Préambule', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Nom : {clientFullName}'),
        new Paragraph('Adresse : {clientAddress}'),
        new Paragraph('Référence STEG : {clientStegReference}'),

        new Paragraph({ text: '{sectionNumberPresentation} Présentation du projet', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{introduction}'),

        new Paragraph({ text: '{sectionNumberDimensionnement} Dimensionnement et productible', heading: HeadingLevel.HEADING_1 }),
        specTable([
          ['Type de branchement', '{sizingBranchement}'],
          ['Puissance souscrite', '{sizingSubscribedPower}'],
          ['Consommation de référence', '{sizingConsumption}'],
          ['Puissance crête installée (kWc)', '{sizingInstalledKWp}'],
          ["Puissance AC de l'onduleur (kW)", '{sizingInverterPac}'],
          ['Rapport DC/AC', '{sizingDcAcRatio}'],
          ['Règle de dimensionnement', '{sizingRule}'],
          ['Production annuelle estimée (kWh/an)', '{productionAnnual}'],
          ['Productible spécifique (kWh/kWc/an)', '{productionSpecificYield}'],
          ['Indice de performance (PR)', '{productionPr}'],
          ['Taux de couverture de la consommation', '{productionCoverage}'],
          ['Méthode', '{productionMethod}'],
        ]),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [cell('Mois'), cell('Irradiation dans le plan (kWh/m²)'), cell('Production (kWh)'), cell('PR (%)')],
            }),
            new TableRow({
              children: [cell('{#productionMonths}{monthLabel}'), cell('{globInc}'), cell('{eGrid}'), cell('{pr}{/productionMonths}')],
            }),
            new TableRow({
              children: [cell('Total'), cell('{productionTotalGlobInc}'), cell('{productionTotalEGrid}'), cell('')],
            }),
          ],
        }),

        new Paragraph({ text: '{sectionNumberSolution} Description de la solution technique', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{solution}'),
        new Paragraph({ text: "III.1 Caractéristiques du module", heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Module : {moduleBrandModel}'),
        specTable([
          ['Puissance crête (Wc)', '{moduleSpecPmaxW}'],
          ['Tension Vmp (V)', '{moduleSpecVmpV}'],
          ['Courant Imp (A)', '{moduleSpecImpA}'],
          ['Tension Voc (V)', '{moduleSpecVocV}'],
          ['Courant Isc (A)', '{moduleSpecIscA}'],
        ]),
        new Paragraph({ text: "III.2 Caractéristiques de l'onduleur", heading: HeadingLevel.HEADING_2 }),
        // A mixed-model array lists every inverter's own brand/model and power here (I7) — the
        // DC-side voltage/MPPT range fields below stay single-value since this slice doesn't
        // carry them per entry, and in practice every inverter on one array shares a compatible
        // DC input range by design (spec §3.3's own single-inverter wording).
        new Paragraph('{#inverters}{inverterLabel} : {inverterBrandModel} — {pacW} W{/inverters}'),
        specTable([
          ['Tension DC max (V)', '{inverterSpecVdcMaxV}'],
          ['Plage MPPT min (V)', '{inverterSpecMpptMinV}'],
          ['Plage MPPT max (V)', '{inverterSpecMpptMaxV}'],
        ]),
        new Paragraph({ text: 'III.3 Dimensionnement du champ PV', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Puissance totale : {pDcW}'),
        new Paragraph('Nombre de modules : {moduleCount}'),
        specTable([
          ['Ns min', '{stringSizingNsMin}'],
          ['Ns max', '{stringSizingNsMax}'],
          ['Ns optimal max', '{stringSizingNsOptMax}'],
          ['Np max', '{stringSizingNpMax}'],
          ['Np optimal', '{stringSizingNpOpt}'],
        ]),

        new Paragraph({ text: 'III.4 Onduleurs et chaînes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{#inverters}'),
        new Paragraph('{inverterLabel} ({inverterBrandModel})'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('MPPT'), cell('Chaînes en parallèle'), cell('Modules par chaîne')] }),
            new TableRow({ children: [cell('{#mppts}{mpptLabel}'), cell('{stringsInParallel}'), cell('{modulesPerString}{/mppts}')] }),
          ],
        }),
        new Paragraph('{/inverters}'),

        new Paragraph({ text: '{sectionNumberCablage} Câblage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{cabling}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('Repère'), cell('Section (mm²)'), cell('Longueur (m)'), cell('Mode de pose')] }),
            new TableRow({
              children: [
                cell('{#cableRuns}{label}'),
                cell('{sectionMm2}'),
                cell('{lengthM}'),
                cell('{installMethod}{/cableRuns}'),
              ],
            }),
          ],
        }),
        new Paragraph({ text: 'IV.1 Chute de tension', heading: HeadingLevel.HEADING_2 }),
        specTable([
          ['Chute de tension DC (V)', '{voltageDropDuDcV}'],
          ['Chute de tension DC (%)', '{voltageDropDuDcPct}'],
          ['Chute de tension AC (V)', '{voltageDropDuAcV}'],
          ['Chute de tension AC (%)', '{voltageDropDuAcPct}'],
        ]),

        new Paragraph({ text: '{sectionNumberTerre} Mise à la terre', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{earthing}'),

        new Paragraph({ text: '{sectionNumberStructure} Structure et lestage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{structure}'),
        new Paragraph('{#stabilityComputed}'),
        specTable([
          ['Poids total (N)', '{stabilityWeightN}'],
          ['Stabilité — membre gauche', '{stabilityLhs}'],
          ['Stabilité — membre droit', '{stabilityRhs}'],
        ]),
        new Paragraph('{/stabilityComputed}'),

        new Paragraph('{#dcFuseRequired}'),
        new Paragraph({ text: '{sectionNumberFusible} Protection DC — fusible', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Un fusible DC est requis pour cette configuration.'),
        new Paragraph('{/dcFuseRequired}'),

        new Paragraph('{#acIsolatorRequired}'),
        new Paragraph({ text: '{sectionNumberSectionneur} Protection AC — sectionneur', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Un sectionneur AC est requis (plusieurs onduleurs).'),
        new Paragraph('{/acIsolatorRequired}'),

        new Paragraph({ text: '{sectionNumberConclusion} Conclusion', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{conclusion}'),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(join(import.meta.dirname, '..', 'template', 'dossier-template.docx'), buffer);
// eslint-disable-next-line no-console -- one-time CLI authoring script, not shipped runtime code
console.log('Template written to template/dossier-template.docx');

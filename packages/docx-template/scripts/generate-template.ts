import { writeFileSync } from 'fs';
import { join } from 'path';
import { AlignmentType, Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType, BorderStyle } from 'docx';
import { DOCUMENT_STYLES, anLabel, conclusionRun, styledTable, valueRun } from './template-styles';

/** A label / value table: salmon labels, the values (template tags) in blue. */
function specTable(rows: [string, string][]): Table {
  return styledTable(
    rows.map(([label, tag]) => [label, [valueRun(tag)]]),
    { header: false, labelColumn: true },
  );
}

/** `label` in black followed by a blue value tag, as one paragraph. */
function labelledValue(label: string, tag: string): Paragraph {
  return new Paragraph({ children: [new TextRun(label), valueRun(tag)] });
}

/**
 * A loop over calculation notes (`{#loop}` … `{/loop}`), each in the reference layout: the bold
 * title, `requirementLabel` + the formula, « Application numérique : » + the numbers, the
 * result in blue, the device fitted (`withChosen`) and, when the note has one, its conclusion in
 * red underlined. A `\n` in a value becomes a line break (fill-template's `linebreaks: true`).
 */
function calculationNotes(loop: string, requirementLabel: string, withChosen = false): Paragraph[] {
  return [
    new Paragraph(`{#${loop}}`),
    new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: '{title}', bold: true })] }),
    new Paragraph({ keepNext: true, children: [new TextRun(requirementLabel), new TextRun('{formula}')] }),
    new Paragraph({ keepNext: true, children: [anLabel(), new TextRun(' {application}')] }),
    new Paragraph({ keepNext: withChosen, children: [new TextRun('Résultat : '), valueRun('{result}')] }),
    ...(withChosen ? [new Paragraph({ children: [new TextRun('Matériel retenu : '), valueRun('{chosen}')] })] : []),
    new Paragraph('{#conclusion}'),
    new Paragraph({ children: [conclusionRun('{conclusion}')] }),
    new Paragraph('{/conclusion}'),
    new Paragraph(`{/${loop}}`),
  ];
}

/** One side of the closing signature table: a heading, the signer, then room to sign. */
function signatureCell(lines: string[]): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [...lines.map((line) => new Paragraph(line)), ...Array.from({ length: 4 }, () => new Paragraph(''))],
  });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

const doc = new Document({
  styles: DOCUMENT_STYLES,
  sections: [
    {
      // A4. The top margin (3 cm) leaves room for the running header the worker stamps on every
      // study page (logos and dossier number, stamp-study-pages.ts); the bottom one for its footer.
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, bottom: 1418, left: 1418, right: 1418 } } },
      children: [
        // The company moves to the running page header (Task 17); the title names the subject.
        new Paragraph({ text: "Dossier technique de raccordement d'une installation photovoltaïque au réseau BT de la STEG", heading: HeadingLevel.TITLE }),
        // A draft (STEG pieces missing) says so right under the title; the paragraph is dropped otherwise.
        new Paragraph('{#isDraft}BROUILLON – NON RECEVABLE. Pièces manquantes : {draftMissingText}{/isDraft}'),
        new Paragraph('Dossier n° {dossierNumber} du {dossierDateText}'),
        new Paragraph({ text: '{sectionNumberPreambule} Préambule', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Installateur : {companyName}'),
        new Paragraph('{companyAddress} — {companyPhone} — {companyEmail}'),
        new Paragraph('{installerAnmeLine}'),
        new Paragraph('{installerTaxIdLine}'),
        new Paragraph('{installerLegalRepLine}'),
        new Paragraph('Titulaire du contrat : {clientFullName}'),
        new Paragraph('{clientCinLine}'),
        new Paragraph('Adresse : {clientAddress}'),
        new Paragraph('Référence STEG : {clientStegReference}'),

        new Paragraph({ text: '{sectionNumberPresentation} Présentation du projet', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{introduction}'),
        new Paragraph('{siteBuildingLine}'),

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
        styledTable(
          [
            ['Mois', 'Irradiation dans le plan (kWh/m²)', 'Production (kWh)', 'PR (%)'],
            ['{#productionMonths}{monthLabel}', [valueRun('{globInc}')], [valueRun('{eGrid}')], [valueRun('{pr}{/productionMonths}')]],
            ['Total', [valueRun('{productionTotalGlobInc}')], [valueRun('{productionTotalEGrid}')], ''],
          ],
          { header: true, labelColumn: true },
        ),

        new Paragraph({ text: '{sectionNumberSolution} Description de la solution technique', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{solution}'),
        // Sub-section numbers follow the section's own computed numeral (e.g. `IV.` + `1`).
        new Paragraph({ text: '{sectionNumberSolution}1 Caractéristiques du module', heading: HeadingLevel.HEADING_2 }),
        labelledValue('Module : ', '{moduleBrandModel}'),
        specTable([
          ['Puissance crête (Wc)', '{moduleSpecPmaxW}'],
          ['Tension Vmp (V)', '{moduleSpecVmpV}'],
          ['Courant Imp (A)', '{moduleSpecImpA}'],
          ['Tension Voc (V)', '{moduleSpecVocV}'],
          ['Courant Isc (A)', '{moduleSpecIscA}'],
        ]),
        new Paragraph({ text: "{sectionNumberSolution}2 Caractéristiques de l'onduleur", heading: HeadingLevel.HEADING_2 }),
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
        new Paragraph({ text: '{sectionNumberSolution}3 Onduleurs et chaînes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{#inverters}'),
        new Paragraph('{inverterLabel} ({inverterBrandModel})'),
        styledTable(
          [
            ['MPPT', 'Chaînes en parallèle', 'Modules par chaîne'],
            ['{#mppts}{mpptLabel}', [valueRun('{stringsInParallel}')], [valueRun('{modulesPerString}{/mppts}')]],
          ],
          { header: true, labelColumn: true },
        ),
        new Paragraph('{/inverters}'),

        // The string sizing calculation notes justify the configuration above (Task 19); they
        // replace the bare Ns/Np results table STEG rejected (remark 6).
        new Paragraph({ text: '{sectionNumberSolution}4 Dimensionnement du champ PV', heading: HeadingLevel.HEADING_2 }),
        labelledValue('Puissance totale : ', '{pDcW}'),
        labelledValue('Nombre de modules : ', '{moduleCount}'),
        labelledValue('Températures de calcul : ', '{temperatureAssumptions}'),
        ...calculationNotes('stringSizingNotes', 'Formule : '),

        // Protection sizing notes (Task 20): the requirements of checks C09–C15 and C24.
        new Paragraph({ text: '{sectionNumberProtections} Dimensionnement des protections', heading: HeadingLevel.HEADING_1 }),
        ...calculationNotes('protectionNotes', 'Exigences : ', true),

        new Paragraph({ text: '{sectionNumberCablage} Câblage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{cabling}'),
        styledTable(
          [
            ['Repère', 'Section (mm²)', 'Longueur (m)', 'Mode de pose'],
            ['{#cableRuns}{label}', [valueRun('{sectionMm2}')], [valueRun('{lengthM}')], [valueRun('{installMethod}{/cableRuns}')]],
          ],
          { header: true, labelColumn: true },
        ),

        // Cable sizing note (Task 21): Iz' with each NF C 15-100 factor, then one note per run.
        new Paragraph({ text: '{sectionNumberCablage}1 Dimensionnement des câbles', heading: HeadingLevel.HEADING_2 }),
        new Paragraph(
          "Le courant admissible des câbles est déterminé selon la norme NF C 15-100 (partie 5-52, courants admissibles) et, pour les câbles DC du champ photovoltaïque, selon le guide UTE C15-712-1. Il tient compte des facteurs de correction liés aux conditions de pose :",
        ),
        new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new TextRun({ text: "Iz' = Iz × K1 × K2 × K3 × K4", bold: true })] }),
        new Paragraph({ keepNext: true, children: [new TextRun('Avec :')] }),
        ...[
          "Iz' : courant admissible du câble dans ses conditions de pose (A) ;",
          'Iz : courant admissible de référence du câble choisi, donné par le fabricant pour sa méthode de référence (B, C, E ou F) à 30 °C (A) ;',
          'K1 : facteur de correction lié au mode de pose (NF C 15-100, tableau 52C pour le mode de pose, tableau 52G pour la méthode de référence) ;',
          'K2 : facteur de correction lié au groupement de circuits jointifs (NF C 15-100, tableau 52N) ;',
          "K3 : facteur de correction lié à la température ambiante et à la nature de l'isolant (NF C 15-100, tableau 52K) ;",
          'K4 : facteur de correction lié au nombre de couches de câbles (NF C 15-100, tableau 52O).',
        ].map((line) => new Paragraph({ indent: { left: 360 }, children: [new TextRun(line)] })),
        new Paragraph(
          "Conditions à vérifier : côté DC, Iz' ≥ 1,25 × Isc × Np, courant de conception du champ (UTE C15-712-1) ; côté AC, Ib ≤ In ≤ Iz', avec Ib le courant d'emploi (Iac max de l'onduleur) et In le calibre du disjoncteur (NF C 15-100).",
        ),
        styledTable(
          [
            ['Liaison', 'S (mm²)', 'Iz (A)', 'K1', 'K2', 'K3', 'K4', "Iz' (A)", 'Courant de conception (A)'],
            [
              '{#cableSizingRows}{link}',
              [valueRun('{sectionMm2}')],
              [valueRun('{iz}')],
              [valueRun('{k1}')],
              [valueRun('{k2}')],
              [valueRun('{k3}')],
              [valueRun('{k4}')],
              [valueRun('{izCorrected}')],
              [valueRun('{designCurrent}{/cableSizingRows}')],
            ],
          ],
          { header: true, labelColumn: true },
        ),
        new Paragraph('{#cableSizingRows}'),
        new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: '{link}', bold: true })] }),
        new Paragraph({ keepNext: true, children: [valueRun('{factorsText}')] }),
        new Paragraph({ keepNext: true, children: [anLabel(), new TextRun(' {application}')] }),
        new Paragraph({ keepNext: true, children: [new TextRun('Résultat : '), valueRun('{result}')] }),
        new Paragraph({ children: [conclusionRun('{conclusion}')] }),
        new Paragraph('{/cableSizingRows}'),

        // Voltage drop note (Task 21): replaces the bare drop table; each run against its own limit.
        new Paragraph({ text: '{sectionNumberCablage}2 Chute de tension', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{voltageDropLimitsText}'),
        styledTable(
          [
            ['Liaison', 'ρ (Ω·mm²/m)', 'L (m)', 'I (A)', 'S (mm²)', 'U (V)', 'ΔU (V)', 'ΔU (%)', 'Limite (%)'],
            [
              '{#voltageDropRows}{link}',
              [valueRun('{rho}')],
              [valueRun('{lengthM}')],
              [valueRun('{currentA}')],
              [valueRun('{sectionMm2}')],
              [valueRun('{voltageV}')],
              [valueRun('{dropV}')],
              [valueRun('{dropPct}')],
              [valueRun('{limitPct}{/voltageDropRows}')],
            ],
          ],
          { header: true, labelColumn: true },
        ),
        new Paragraph('{#voltageDropRows}'),
        new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: '{link}', bold: true })] }),
        new Paragraph({ keepNext: true, children: [new TextRun('Formule : '), new TextRun('{formula}')] }),
        new Paragraph({ keepNext: true, children: [anLabel(), new TextRun(' {application}')] }),
        new Paragraph({ keepNext: true, children: [new TextRun('Résultat : '), valueRun('{result}')] }),
        new Paragraph({ children: [conclusionRun('{conclusion}')] }),
        new Paragraph('{/voltageDropRows}'),

        new Paragraph({ text: '{sectionNumberTerre} Mise à la terre', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{earthing}'),
        styledTable(
          [
            ['Désignation', 'Valeur'],
            ['{#earthingDetails}{label}', [valueRun('{value}{/earthingDetails}')]],
          ],
          { header: true, labelColumn: true },
        ),

        new Paragraph({ text: '{sectionNumberStructure} Structure et lestage', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('{structure}'),
        styledTable(
          [
            ['Désignation', 'Valeur'],
            ['{#structureRows}{label}', [valueRun('{value}{/structureRows}')]],
          ],
          { header: true, labelColumn: true },
        ),
        ...calculationNotes('stabilityNotes', 'Formule : '),
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
        new Paragraph('{conclusionText}'),

        new Paragraph(''),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
          rows: [
            new TableRow({
              children: [
                signatureCell(["Établi par l'installateur", '{installerLegalRepLine}', 'Date :', 'Signature et cachet :']),
                signatureCell(['Lu et approuvé — le titulaire du contrat', '{clientFullName}', 'Date :', 'Signature :']),
              ],
            }),
          ],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(join(import.meta.dirname, '..', 'template', 'dossier-template.docx'), buffer);
// eslint-disable-next-line no-console -- one-time CLI authoring script, not shipped runtime code
console.log('Template written to template/dossier-template.docx');

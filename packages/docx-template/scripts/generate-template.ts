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

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: '{companyName}', heading: HeadingLevel.TITLE }),
        new Paragraph('{companyAddress} — {companyPhone} — {companyEmail}'),
        new Paragraph({ text: 'Dossier technique BT', heading: HeadingLevel.HEADING_1 }),

        new Paragraph({ text: 'Client', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Nom : {clientFullName}'),
        new Paragraph('Adresse : {clientAddress}'),
        new Paragraph('Référence STEG : {clientStegReference}'),

        new Paragraph({ text: 'Introduction', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{introduction}'),

        new Paragraph({ text: 'Description de la solution', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{solution}'),
        new Paragraph('Module : {moduleBrandModel}'),
        new Paragraph('Onduleur : {inverterBrandModel}'),
        new Paragraph('Puissance DC : {pDcW} W'),
        new Paragraph('Nombre de modules : {moduleCount}'),

        new Paragraph({ text: 'Onduleurs et chaînes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{#inverters}'),
        new Paragraph('{inverterLabel}'),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [cell('MPPT'), cell('Chaînes en parallèle'), cell('Modules par chaîne')] }),
            new TableRow({ children: [cell('{#mppts}{mpptLabel}'), cell('{stringsInParallel}'), cell('{modulesPerString}{/mppts}')] }),
          ],
        }),
        new Paragraph('{/inverters}'),

        new Paragraph({ text: 'Câblage', heading: HeadingLevel.HEADING_2 }),
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

        new Paragraph({ text: 'Mise à la terre', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{earthing}'),

        new Paragraph({ text: 'Structure', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{structure}'),

        new Paragraph('{#dcFuseRequired}'),
        new Paragraph({ text: 'Protection DC — fusible', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Un fusible DC est requis pour cette configuration.'),
        new Paragraph('{/dcFuseRequired}'),

        new Paragraph('{#acIsolatorRequired}'),
        new Paragraph({ text: 'Protection AC — sectionneur', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Un sectionneur AC est requis (plusieurs onduleurs).'),
        new Paragraph('{/acIsolatorRequired}'),

        new Paragraph({ text: 'Conclusion', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('{conclusion}'),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(join(import.meta.dirname, '..', 'template', 'dossier-template.docx'), buffer);
console.log('Template written to template/dossier-template.docx');

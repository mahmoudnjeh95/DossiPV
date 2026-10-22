import { Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType, BorderStyle, type IShadingAttributesProperties, type IStylesOptions } from 'docx';

/**
 * The reference dossier's document style, shared by every template section (Task 17 on):
 * one font family (Times New Roman), black bold headings, amber table headers, salmon label
 * cells, computed values in blue and the numerical-application / conclusion lines in red.
 */

export const FONT_FAMILY = 'Times New Roman';
export const VALUE_BLUE = '1F4E9A';
export const ANNOTATION_RED = 'C00000';
export const HEADER_AMBER = 'FFC000';
export const LABEL_SALMON = 'FBE4D5';
const BLACK = '000000';

/** A computed value (usually a docxtemplater tag), in the reference blue. */
export function valueRun(tag: string): TextRun {
  return new TextRun({ text: tag, color: VALUE_BLUE });
}

/** « Application numérique : », red and underlined, before a formula's numbers. */
export function anLabel(): TextRun {
  return new TextRun({ text: 'Application numérique :', color: ANNOTATION_RED, underline: { type: UnderlineType.SINGLE } });
}

/** A calculation's conclusion (e.g. « la chute de tension est admissible »), red and underlined. */
export function conclusionRun(text: string): TextRun {
  return new TextRun({ text, color: ANNOTATION_RED, underline: { type: UnderlineType.SINGLE } });
}

const SINGLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: BLACK };
const TABLE_BORDERS = {
  top: SINGLE_BORDER,
  bottom: SINGLE_BORDER,
  left: SINGLE_BORDER,
  right: SINGLE_BORDER,
  insideHorizontal: SINGLE_BORDER,
  insideVertical: SINGLE_BORDER,
};

function shaded(fill: string): IShadingAttributesProperties {
  return { fill, type: ShadingType.CLEAR, color: 'auto' };
}

/**
 * A table in the reference style: every border single 4; the header row (when `header`) amber
 * and bold; the first column (when `labelColumn`) salmon. A string cell is plain text; a
 * `TextRun[]` cell keeps its runs (e.g. `[valueRun('{tag}')]`).
 */
export function styledTable(rows: (string | TextRun[])[][], options: { header: boolean; labelColumn: boolean }): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: options.header && rowIndex === 0,
          children: row.map((content, columnIndex) => {
            const isHeader = options.header && rowIndex === 0;
            const isLabel = !isHeader && options.labelColumn && columnIndex === 0;
            const children = typeof content === 'string' ? [new TextRun({ text: content, bold: isHeader })] : content;
            return new TableCell({
              ...(isHeader ? { shading: shaded(HEADER_AMBER) } : isLabel ? { shading: shaded(LABEL_SALMON) } : {}),
              children: [new Paragraph({ children })],
            });
          }),
        }),
    ),
  });
}

/** Document styles: Times New Roman 11 pt everywhere, black headings, no blue theme colour. */
export const DOCUMENT_STYLES: IStylesOptions = {
  default: {
    document: { run: { font: FONT_FAMILY, size: 22 } },
    title: { run: { font: FONT_FAMILY, size: 32, bold: true, color: BLACK } },
    // Heading 1 carries the section's roman numeral (`{sectionNumber…}`) in its own text.
    heading1: { run: { font: FONT_FAMILY, size: 26, bold: true, color: BLACK }, paragraph: { spacing: { before: 240, after: 120 } } },
    heading2: { run: { font: FONT_FAMILY, size: 22, bold: true, underline: { type: UnderlineType.SINGLE }, color: BLACK }, paragraph: { spacing: { before: 160, after: 80 } } },
    heading3: { run: { font: FONT_FAMILY, size: 22, bold: true, color: BLACK } },
    heading4: { run: { font: FONT_FAMILY, size: 22, italics: true, color: BLACK } },
    heading5: { run: { font: FONT_FAMILY, size: 22, color: BLACK } },
    heading6: { run: { font: FONT_FAMILY, size: 22, color: BLACK } },
    hyperlink: { run: { color: BLACK, underline: { type: UnderlineType.SINGLE } } },
  },
};

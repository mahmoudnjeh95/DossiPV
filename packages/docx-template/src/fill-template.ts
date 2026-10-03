import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { DossierTemplateData } from './types';

export function fillDossierTemplate(templateBuffer: Buffer, data: DossierTemplateData): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.render(data);

  return doc.getZip().generate({ type: 'nodebuffer' });
}

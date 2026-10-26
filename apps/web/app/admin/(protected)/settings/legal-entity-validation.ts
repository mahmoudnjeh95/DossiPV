import { FormReader } from '../../../../lib/form-reader';

/** The « Société éditrice » form's fields as strings, to pre-fill the inputs. */
export interface LegalEntityFormValues {
  legalName: string;
  legalForm: string;
  legalRneId: string;
  legalTaxId: string;
  legalAddress: string;
  legalPublisher: string;
  legalInpdpDeclaration: string;
  legalHost: string;
}

export type LegalEntityInput = { [K in keyof LegalEntityFormValues]: string | null };

/** Reads the « Société éditrice » form; an empty field is null (printed "à compléter"). */
export function readLegalEntity(reader: FormReader): LegalEntityInput {
  return {
    legalName: reader.optionalText('legalName', 'Raison sociale', 200),
    legalForm: reader.optionalText('legalForm', 'Forme juridique', 200),
    legalRneId: reader.optionalText('legalRneId', 'Identifiant RNE', 50),
    legalTaxId: reader.optionalText('legalTaxId', 'Matricule fiscal', 50),
    legalAddress: reader.optionalText('legalAddress', 'Siège', 300),
    legalPublisher: reader.optionalText('legalPublisher', 'Directeur de la publication', 200),
    legalInpdpDeclaration: reader.optionalText('legalInpdpDeclaration', 'Déclaration INPDP', 100),
    legalHost: reader.optionalText('legalHost', 'Hébergeur', 300),
  };
}

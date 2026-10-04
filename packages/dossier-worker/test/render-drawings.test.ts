import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderDrawingPages } from '../src/render-drawings';

const singleInverterInput = {
  moduleLabel: 'LONGi LR7-72HGD-620M',
  inverters: [
    {
      inverterLabel: 'Sofar 1-4KTL2-G3',
      pacW: 3000,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitchLabel: 'ZJ BENY BB1H-63',
  dcSpdLabel: 'Generic DC-SPD-1',
  acSpdLabel: 'Generic AC-SPD-1',
  acBreakerLabel: 'Generic AC-BRK-20',
  dcRun: { sectionMm2: 6, lengthM: 25 },
  acRun: { sectionMm2: 6, lengthM: 15 },
  earthRodCount: 3,
};

describe('renderDrawingPages', () => {
  it('produces a 2-page PDF (single-line + unifilar) for a single-inverter project', async () => {
    const buffer = await renderDrawingPages(singleInverterInput);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });

  it('produces a valid 2-page PDF for a 2-inverter project without throwing or truncating', async () => {
    const twoInverterInput = {
      ...singleInverterInput,
      inverters: [singleInverterInput.inverters[0]!, singleInverterInput.inverters[0]!],
    };

    const buffer = await renderDrawingPages(twoInverterInput);

    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBe(2);
  });
});

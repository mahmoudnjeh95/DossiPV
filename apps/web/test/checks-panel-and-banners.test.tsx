import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChecksPanel } from '../components/checks-panel';
import { SubscriptionBanner } from '../components/subscription-banner';
import { LibraryPrerequisite } from '../components/library-prerequisite';

describe('ChecksPanel', () => {
  const checks = [
    { id: 'C09', level: 'BLOCK', pass: false, message: 'Interrupteur-sectionneur DC sous-dimensionné' },
    { id: 'C06', level: 'BLOCK', pass: false, message: 'Ratio DC/AC hors plage 0.9 - 1.3' },
    { id: 'C03', level: 'WARN', pass: false, message: 'Vmp à Tmin au-dessus de la plage MPPT (écrêtage possible)' },
    { id: 'C01', level: 'BLOCK', pass: true, message: 'ok' },
  ];

  it('explains a blocking check, shows measured vs expected values and links to the section to fix', () => {
    const html = renderToStaticMarkup(
      <ChecksPanel checks={checks} projectId="p1" derived={{ POWER_RATIO: 1.45, STRING_VOC_TMIN: 612.3, ISC_FIELD_DESIGN: 13.2 }} />,
    );

    expect(html).toContain('ne supporte pas la tension ou le courant du champ');
    expect(html).toContain('href="/projects/p1/sections/protections"');
    expect(html).toContain('Rapport actuel panneaux / onduleur : 1,45');
    expect(html).toContain('attendu : entre 0,9 et 1,3');
  });

  it('puts a tooltip on the abbreviations', () => {
    const html = renderToStaticMarkup(<ChecksPanel checks={checks} projectId="p1" />);

    expect(html).toContain('<abbr title="Entrée de l’onduleur qui suit le point de puissance maximale des panneaux."');
  });

  it('still works without a project (the dossier results page)', () => {
    const html = renderToStaticMarkup(<ChecksPanel checks={checks} />);

    expect(html).not.toContain('/sections/');
    expect(html).toContain('Interrupteur-sectionneur DC sous-dimensionné');
  });
});

describe('SubscriptionBanner before the email is confirmed', () => {
  it('says the free trial starts at confirmation instead of « Aucun abonnement »', () => {
    const html = renderToStaticMarkup(<SubscriptionBanner subscription={null} awaitingEmailConfirmation />);

    expect(html).toContain('essai gratuit démarrera dès que votre adresse e-mail sera confirmée');
    expect(html).not.toContain('Aucun abonnement');
  });

  it('keeps the usual message otherwise', () => {
    expect(renderToStaticMarkup(<SubscriptionBanner subscription={null} />)).toContain('Aucun abonnement');
  });
});

describe('LibraryPrerequisite', () => {
  it('links each missing type to the matching catalogue filter', () => {
    const html = renderToStaticMarkup(
      <LibraryPrerequisite missing={[{ label: 'module photovoltaïque', type: 'PV_MODULE' }, { label: 'onduleur', type: 'INVERTER' }]} />,
    );

    expect(html).toContain('href="/library?tab=catalogue&amp;type=PV_MODULE"');
    expect(html).toContain('href="/library?tab=catalogue&amp;type=INVERTER"');
    expect(html).toContain('href="/library/new"');
  });
});

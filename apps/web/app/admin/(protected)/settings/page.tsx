import Link from 'next/link';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { getOption3dPriceTnd } from '../../../../lib/platform-settings';
import { loadP2pSettings } from '../../../../lib/payments/p2p';
import { Option3dPriceForm } from './option3d-price-form';
import { P2pForm } from './p2p-form';
import { maskAccessToken } from '../../../../lib/admin-period';
import { ACTIVE_MAP_PROVIDER } from '../../../(app)/projects/[id]/map/esri-provider';

// Mirrors the model hardcoded in packages/document-text/src/generate-dossier-text.ts.
const CLAUDE_DOSSIER_MODEL = 'claude-sonnet-5-5';

export default async function AdminSettingsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const option3dPrice = await getOption3dPriceTnd();
  const p2p = await loadP2pSettings();

  return (
    <main>
      <h1>Paramètres</h1>
      <p>Configuration actuelle de la plateforme (lecture seule, sauf l&apos;option 3D et le paiement P2P).</p>

      <h2>Fournisseur de cartes</h2>
      <table>
        <tbody>
          <tr>
            <th>Source des tuiles</th>
            <td>{maskAccessToken(ACTIVE_MAP_PROVIDER.tileUrlTemplate)}</td>
          </tr>
          <tr>
            <th>Zoom maximum</th>
            <td>{ACTIVE_MAP_PROVIDER.maxZoom}</td>
          </tr>
        </tbody>
      </table>

      <h2>Modèle Claude</h2>
      <table>
        <tbody>
          <tr>
            <th>Génération du texte du dossier</th>
            <td>{CLAUDE_DOSSIER_MODEL}</td>
          </tr>
        </tbody>
      </table>

      <h2>Option 3D</h2>
      <p className="hint">
        Prix mensuel de l&apos;option 3D que les installateurs parrainés peuvent acheter seule. La durée payée se règle sur la fiche de
        l&apos;installateur.
      </p>
      <Option3dPriceForm priceTnd={option3dPrice} />

      <h2>Paiement P2P</h2>
      <p className="hint">
        Flouci, izi et D17 sont utilisés en virement de personne à personne : le client envoie le montant à l&apos;un de ces numéros puis
        déclare le paiement avec une capture d&apos;écran, que vous validez dans <Link href="/admin/paiements">Paiements</Link>. Un moyen
        sans numéro n&apos;est pas proposé ; sans aucun numéro, le paiement est indisponible.
      </p>
      <P2pForm
        values={{
          p2pAccountHolder: p2p.accountHolder ?? '',
          p2pFlouciNumber: p2p.numbers.FLOUCI ?? '',
          p2pIziNumber: p2p.numbers.IZI ?? '',
          p2pD17Number: p2p.numbers.D17 ?? '',
          p2pInstructions: p2p.instructions ?? '',
        }}
      />

      <h2>Plans</h2>
      <p>
        Les plans se gèrent dans <Link href="/admin/plans">Plans</Link>.
      </p>
    </main>
  );
}

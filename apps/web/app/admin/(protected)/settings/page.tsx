import Link from 'next/link';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { ACTIVE_MAP_PROVIDER } from '../../../(app)/projects/[id]/map/esri-provider';

// Mirrors the model hardcoded in packages/document-text/src/generate-dossier-text.ts.
const CLAUDE_DOSSIER_MODEL = 'claude-sonnet-5-5';

export default async function AdminSettingsPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  return (
    <main>
      <h1>Paramètres</h1>
      <p>Configuration actuelle de la plateforme (lecture seule).</p>

      <h2>Fournisseur de cartes</h2>
      <table>
        <tbody>
          <tr>
            <th>Source des tuiles</th>
            <td>{ACTIVE_MAP_PROVIDER.tileUrlTemplate}</td>
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

      <h2>Plans</h2>
      <p>
        Les plans se gèrent dans <Link href="/admin/plans">Plans</Link>.
      </p>
    </main>
  );
}

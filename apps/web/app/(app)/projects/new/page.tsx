'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createProjectAction, type CreateProjectActionState } from '../actions';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../../lib/labels';

export default function NewProjectPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState<CreateProjectActionState | undefined, FormData>(
    createProjectAction,
    undefined,
  );

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › Nouveau projet
      </p>
      <h1>Nouveau projet</h1>
      <form action={formAction} className="card stack">
        <p className="muted">
          Seul le nom du client est nécessaire pour commencer ; le reste du dossier se complète section par section.
        </p>
        <div className="form-grid">
          <label>
            Civilité
            <select name="civility" defaultValue="">
              <option value="">—</option>
              {CIVILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nom complet du client
            <input type="text" name="fullName" required maxLength={200} />
          </label>
          <label>
            Type de client
            <select name="clientKind" defaultValue="residential">
              {CLIENT_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Référence STEG
            <input type="text" name="stegReference" maxLength={100} />
            <span className="hint">Peut être renseignée plus tard ; verrouillée après la première génération.</span>
          </label>
        </div>
        {state?.error && <p role="alert">{state.error}</p>}
        <div className="actions">
          <button type="submit" disabled={pending}>
            Créer le projet
          </button>
          <Link href="/projects" className="button secondary">
            Annuler
          </Link>
        </div>
      </form>
    </main>
  );
}

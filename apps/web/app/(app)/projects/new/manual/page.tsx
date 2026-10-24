'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useKeepFormValues } from '../../../../../lib/keep-form-values';
import { createProjectAction, type CreateProjectActionState } from '../../actions';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../../../lib/labels';

export default function NewProjectPage(): React.JSX.Element {
  const { state, formAction, formRef, errorRef } = useKeepFormValues<CreateProjectActionState>(createProjectAction);

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › Nouveau projet
      </p>
      <h1>Nouveau projet</h1>
      <form ref={formRef} action={formAction} className="card stack">
        {state?.error && <p ref={errorRef} role="alert">{state.error}</p>}
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
        <div className="actions">
          <CreateButton />
          <Link href="/projects" className="button secondary">
            Annuler
          </Link>
        </div>
      </form>
    </main>
  );
}

/** Own component so useFormStatus sees the form: the redirect after creation can take a few seconds. */
function CreateButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Création du projet…' : 'Créer le projet'}
    </button>
  );
}

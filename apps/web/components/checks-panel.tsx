import Link from 'next/link';
import { CHECK_HELP, checkFixHref } from '../lib/check-help';
import { Jargon } from './jargon';

export interface CheckLike {
  id: string;
  level: string;
  pass: boolean;
  message: string;
}

/**
 * Renders a list of engine checks grouped as blocking failures, warnings and passes. Used by
 * the project overview (live engine run) and the dossier results page (checks stored with the
 * job), so both read the same way.
 */
export function ChecksPanel({
  checks,
  projectId,
  derived,
}: {
  checks: CheckLike[];
  /** With a project, a failing check links to the section that fixes it. */
  projectId?: string;
  /** The engine's derived values: shown as measured / expected figures where a check has some. */
  derived?: Record<string, number>;
}): React.JSX.Element {
  const detail = (c: CheckLike): React.JSX.Element | null => {
    const help = CHECK_HELP[c.id];
    if (!help) return null;
    const facts = derived ? help.facts(derived) : [];
    return (
      <span className="check-help" style={{ display: 'block', marginTop: 4 }}>
        <span className="muted" style={{ display: 'block' }}>
          <Jargon text={help.explain} />
        </span>
        {facts.length > 0 && (
          <span style={{ display: 'block' }}>
            {facts.map((line) => (
              <span key={line} style={{ display: 'block' }}>
                <Jargon text={line} />
              </span>
            ))}
          </span>
        )}
        {projectId && <Link href={checkFixHref(projectId, help.fix)}>{help.fix.label} →</Link>}
      </span>
    );
  };
  const failing = checks.filter((c) => !c.pass);
  const blocking = failing.filter((c) => c.level === 'BLOCK');
  const warnings = failing.filter((c) => c.level !== 'BLOCK');
  const passing = checks.filter((c) => c.pass);

  return (
    <>
      {blocking.length === 0 && warnings.length === 0 && (
        <div className="banner banner-ok">Les {checks.length} contrôles sont satisfaits.</div>
      )}
      {blocking.length > 0 && (
        <>
          <h3 style={{ margin: '8px 0' }}>
            <span className="badge badge-danger">Bloquant</span> {blocking.length} contrôle(s) à
            corriger
          </h3>
          <ul className="check-list">
            {blocking.map((c, index) => (
              <li key={`${c.id}-${index}`}>
                <span className="check-id">{c.id}</span>
                <span>
                  <Jargon text={c.message} />
                  {detail(c)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <h3 style={{ margin: '8px 0' }}>
            <span className="badge badge-warn">Avertissement</span> {warnings.length} point(s) à
            vérifier
          </h3>
          <ul className="check-list">
            {warnings.map((c, index) => (
              <li key={`${c.id}-${index}`}>
                <span className="check-id">{c.id}</span>
                <span>
                  <Jargon text={c.message} />
                  {detail(c)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="muted">{passing.length} contrôle(s) satisfait(s)</summary>
        <ul className="check-list" style={{ marginTop: 6 }}>
          {passing.map((c, index) => (
            <li key={`${c.id}-${index}`}>
              <span className="check-id">{c.id}</span>
              <span className="muted">{c.message}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

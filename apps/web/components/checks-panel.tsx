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
export function ChecksPanel({ checks }: { checks: CheckLike[] }): React.JSX.Element {
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
                <span>{c.message}</span>
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
                <span>{c.message}</span>
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

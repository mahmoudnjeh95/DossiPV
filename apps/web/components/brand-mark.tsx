interface BrandMarkProps {
  inverse?: boolean;
  compact?: boolean;
}

export function BrandMark({ inverse = false, compact = false }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={`brand-lockup${inverse ? ' brand-lockup-inverse' : ''}${compact ? ' brand-lockup-compact' : ''}`}>
      <svg className="brand-symbol" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 4v6M11.8 9.1l3.3 4.7M36.2 9.1l-3.3 4.7" />
        <path d="M18 17a6 6 0 1 1 12 0" />
        <path d="M9 20h30v21H9zM9 27h30M19 20v21M29 20v21" />
        <path className="brand-symbol-accent" d="M9 41h30" />
      </svg>
      <span className="brand-wordmark">
        <strong>DossiPV</strong>
        {!compact && <small>Dossiers photovoltaïques BT</small>}
      </span>
    </span>
  );
}
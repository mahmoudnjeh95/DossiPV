import type { ComponentType } from 'react';
import type { IconProps } from '@dossipv/icons';

interface MetricCardProps {
  icon: ComponentType<IconProps>;
  label: string;
  value: string | number;
  description?: string;
  className?: string;
}

export function MetricCard({ icon: Icon, label, value, description, className = '' }: MetricCardProps): React.JSX.Element {
  return (
    <div
      className={`card ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)', fontWeight: 600 }}>{label}</p>
          <p className="stat" style={{ marginTop: 4 }}>{value}</p>
          {description && (
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem', marginTop: 4 }}>{description}</p>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <Icon size="lg" color="gold" />
        </div>
      </div>
    </div>
  );
}

import type { ComponentType } from 'react';
import type { IconProps } from '@dossipv/icons';
import { MetricCard } from '../../../../components/cards/metric-card';

interface AdminStatsCardProps {
  icon: ComponentType<IconProps>;
  label: string;
  value: string | number;
}

export function AdminStatsCard({ icon, label, value }: AdminStatsCardProps): React.JSX.Element {
  return <MetricCard icon={icon} label={label} value={value} />;
}

import type { ComponentType } from 'react';
import type { IconProps } from '@dossipv/icons';
import { MetricCard } from '../../../components/cards/metric-card';

interface InstallerStatsCardProps {
  icon: ComponentType<IconProps>;
  label: string;
  value: string | number;
}

export function StatsCard({ icon, label, value }: InstallerStatsCardProps): React.JSX.Element {
  return <MetricCard icon={icon} label={label} value={value} />;
}

import Link from 'next/link';
import { requireAuthenticatedSuperAdmin } from '../layout';

const EQUIPMENT_CATEGORIES = [
  { href: '/admin/equipment/pv-modules', label: 'Modules PV' },
  { href: '/admin/equipment/inverters', label: 'Onduleurs' },
  { href: '/admin/equipment/cables', label: 'Câbles' },
  { href: '/admin/equipment/dc-fuses', label: 'Fusibles DC' },
  { href: '/admin/equipment/dc-switches', label: 'Interrupteurs DC' },
  { href: '/admin/equipment/ac-breakers', label: 'Disjoncteurs AC' },
  { href: '/admin/equipment/ac-isolators', label: 'Sectionneurs AC' },
  { href: '/admin/equipment/spds', label: 'Parafoudres (SPD)' },
  { href: '/admin/equipment/accessories', label: 'Accessoires' },
];

export default async function EquipmentIndexPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  return (
    <main>
      <h1>Équipements</h1>
      <ul>
        {EQUIPMENT_CATEGORIES.map((category) => (
          <li key={category.href}>
            <Link href={category.href}>{category.label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

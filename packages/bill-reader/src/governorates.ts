export interface Governorate {
  name: string;
  capital: string;
  lat: number;
  lon: number;
}

export const TUNISIAN_GOVERNORATES: readonly Governorate[] = [
  { name: 'Tunis', capital: 'Tunis', lat: 36.8065, lon: 10.1815 },
  { name: 'Ariana', capital: 'Ariana', lat: 36.8625, lon: 10.1956 },
  { name: 'Ben Arous', capital: 'Ben Arous', lat: 36.7531, lon: 10.2189 },
  { name: 'Manouba', capital: 'Manouba', lat: 36.8081, lon: 10.0971 },
  { name: 'Nabeul', capital: 'Nabeul', lat: 36.4513, lon: 10.7357 },
  { name: 'Zaghouan', capital: 'Zaghouan', lat: 36.4029, lon: 10.1429 },
  { name: 'Bizerte', capital: 'Bizerte', lat: 37.2744, lon: 9.8739 },
  { name: 'Béja', capital: 'Béja', lat: 36.7256, lon: 9.1817 },
  { name: 'Jendouba', capital: 'Jendouba', lat: 36.5011, lon: 8.7802 },
  { name: 'Le Kef', capital: 'Le Kef', lat: 36.1742, lon: 8.7049 },
  { name: 'Siliana', capital: 'Siliana', lat: 36.0849, lon: 9.3708 },
  { name: 'Sousse', capital: 'Sousse', lat: 35.8256, lon: 10.6369 },
  { name: 'Monastir', capital: 'Monastir', lat: 35.7643, lon: 10.8113 },
  { name: 'Mahdia', capital: 'Mahdia', lat: 35.5047, lon: 11.0622 },
  { name: 'Sfax', capital: 'Sfax', lat: 34.7406, lon: 10.7603 },
  { name: 'Kairouan', capital: 'Kairouan', lat: 35.6781, lon: 10.0963 },
  { name: 'Kasserine', capital: 'Kasserine', lat: 35.1676, lon: 8.8365 },
  { name: 'Sidi Bouzid', capital: 'Sidi Bouzid', lat: 35.0382, lon: 9.4849 },
  { name: 'Gabès', capital: 'Gabès', lat: 33.8815, lon: 10.0982 },
  { name: 'Médenine', capital: 'Médenine', lat: 33.3549, lon: 10.5055 },
  { name: 'Tataouine', capital: 'Tataouine', lat: 32.9297, lon: 10.4518 },
  { name: 'Gafsa', capital: 'Gafsa', lat: 34.425, lon: 8.7842 },
  { name: 'Tozeur', capital: 'Tozeur', lat: 33.9197, lon: 8.1335 },
  { name: 'Kébili', capital: 'Kébili', lat: 33.7044, lon: 8.969 },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function findGovernorate(name: string | null): Governorate | null {
  if (!name) return null;
  const wanted = normalize(name);
  return TUNISIAN_GOVERNORATES.find((g) => normalize(g.name) === wanted) ?? null;
}

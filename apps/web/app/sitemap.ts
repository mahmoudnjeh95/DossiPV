import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

const PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/inscription', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/login', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/cgu', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/confidentialite', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}

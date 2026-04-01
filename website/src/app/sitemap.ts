import type { MetadataRoute } from 'next';
import { getPosts } from '@/lib/content';

export const dynamic = 'force-static';

const BASE = 'https://anvil-sooty.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getPosts('docs').map(p => ({
    url: `${BASE}/docs/${p.slug}/`,
    lastModified: p.date || new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const blog = getPosts('blog').map(p => ({
    url: `${BASE}/blog/${p.slug}/`,
    lastModified: p.date || new Date().toISOString(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [
    { url: BASE, lastModified: new Date().toISOString(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/docs/`, lastModified: new Date().toISOString(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/blog/`, lastModified: new Date().toISOString(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/changelog/`, lastModified: new Date().toISOString(), changeFrequency: 'weekly', priority: 0.6 },
    ...docs,
    ...blog,
  ];
}

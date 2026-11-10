import { TAX_UPDATED } from './content';

export function taxPageSchema(opts: { origin: string; path: string; name: string; description: string; app: boolean }) {
  const url = new URL(opts.path, opts.origin).href;
  const out: unknown[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: opts.name,
      url,
      description: opts.description,
      inLanguage: 'en-US',
      dateModified: TAX_UPDATED,
      datePublished: TAX_UPDATED,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: new URL('/', opts.origin).href },
        { '@type': 'ListItem', position: 2, name: opts.name, item: url },
      ],
    },
  ];
  if (opts.app)
    out.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: opts.name,
      url,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any (runs in the browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
  return out;
}

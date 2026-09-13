import type { APIRoute } from 'astro';
import { SITE_URL } from '../data/site.mjs';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    `# ${SITE_URL}
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap-index.xml
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );

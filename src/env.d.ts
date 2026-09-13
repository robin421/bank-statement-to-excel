/// <reference types="astro/client" />

declare module '*?url' {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
  readonly PUBLIC_AFFILIATE_OCR_URL?: string;
  readonly PUBLIC_ADSENSE_CLIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

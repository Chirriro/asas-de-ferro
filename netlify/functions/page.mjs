import { getStore } from '@netlify/blobs';
import { initialCodices } from './seed.mjs';
import { getSiteSettings } from './site.mjs';
import { publicCodex } from './core.mjs';

export const config = {
  path: ['/', '/codice', '/codice/*', '/personagens', '/mundo', '/admin', '/admin/*'],
  method: 'GET',
};

const htmlEscape = text => String(text ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export async function htmlPage(request, settings, codex = null) {
  const url = new URL(request.url);
  const origin = settings.siteUrl || url.origin;
  const pathname = url.pathname;
  const section = pathname.startsWith('/codice') ? 'Códice'
    : pathname.startsWith('/admin') ? 'Administração'
    : pathname === '/personagens' ? 'Personagens' : pathname === '/mundo' ? 'Mundo' : '';
  const title = codex?.title ? `${codex.title} | ${settings.siteName}`
    : section ? `${section} | ${settings.siteName}` : settings.siteName;
  const description = codex?.summary || settings.description;
  const shareTitle = codex?.title ? title : settings.shareTitle || title;
  const shareDescription = codex?.summary || settings.shareDescription || description;
  const canonical = new URL(pathname, origin).href;
  const asset = kind => `${origin}/site-media/${kind}?v=${settings.assets[kind]}`;
  const socialImage = settings.assets.social ? asset('social') : null;
  const favicon = settings.assets.icon ? asset('icon') : null;
  const meta = (name, value, property = false) => `<meta ${property ? 'property' : 'name'}="${name}" content="${htmlEscape(value)}">`;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    meta('theme-color', settings.themeColor),
    meta('description', description),
    meta('og:type', 'website', true),
    meta('og:locale', 'pt_BR', true),
    meta('og:site_name', settings.siteName, true),
    meta('og:title', shareTitle, true),
    meta('og:description', shareDescription, true),
    meta('og:url', canonical, true),
    meta('twitter:card', socialImage ? 'summary_large_image' : 'summary'),
    meta('twitter:title', shareTitle),
    meta('twitter:description', shareDescription),
    `<link rel="canonical" href="${htmlEscape(canonical)}">`,
    ...(socialImage ? [meta('og:image', socialImage, true), meta('twitter:image', socialImage)] : []),
    ...(favicon ? [`<link rel="icon" href="${htmlEscape(favicon)}">`] : []),
    `<title>${htmlEscape(title)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;500;600;700&family=Cinzel:wght@400;500;600;700&family=PT+Sans+Narrow:wght@400;700&display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="/styles.css">',
    '<script type="module" src="/app.js"></script>',
  ];
  return `<!doctype html><html lang="pt-BR"><head>${head.join('\n')}</head><body><a class="skip-link" href="#app">Ir para o conteúdo</a><main id="app" tabindex="-1"></main></body></html>`;
}

export default async function page(request) {
  try {
    const settings = await getSiteSettings();
    const url = new URL(request.url);
    let codex = null;
    const match = /^\/codice\/([a-z0-9-]+)$/.exec(url.pathname);
    if (match) {
      const slug = match[1];
      const override = await getStore('asas-de-ferro-codices').get(`entry/${slug}`, { type: 'json', consistency: 'strong' });
      if (!override?.deleted) {
        const item = override || initialCodices.find(entry => entry.slug === slug) || null;
        if (item) codex = publicCodex(item, false, process.env.SESSION_SECRET || '');
      }
      if (!codex && slug.startsWith('oculto-')) codex = { title: '???', summary: '' };
    }
    const html = await htmlPage(request, settings, codex);
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      },
    });
  } catch (error) {
    console.error('Page metadata error:', error);
    return new Response('Não foi possível carregar a página.', { status: 500 });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { validAssetPath, validateCodex, publicCodex } from '../netlify/functions/core.mjs';
import { normalizeSettings, defaultBackgroundEffects } from '../netlify/functions/site.mjs';

const content = { general: 'Texto', specific: 'Reservado', professional: 'Secreto' };
const entry = { slug: 'porto-celeste', title: 'Porto Celeste', category: 'Localidades', summary: '',
  publicLevel: 0, tags: [], aliases: [], banner: '/assets/banners/porto.webp', parentSlug: 'avalon', content };

test('validates nested entries and Git assets', () => {
  const item = validateCodex(entry);
  assert.equal(item.parentSlug, 'avalon');
  assert.equal(item.banner, entry.banner);
  assert.throws(() => validateCodex({ ...entry, parentSlug: entry.slug }));
  assert.throws(() => validateCodex({ ...entry, banner: '/assets/../../admin.png' }));
  assert.equal(validAssetPath('/assets/regiões/ilha%20azul.webp'), false); // Paths are URL-encoded.
  assert.equal(validAssetPath('/assets/ilhas/ilha%20azul.webp'), true);
  assert.equal(validAssetPath('/assets/%2e%2e/admin.png'), false);
  assert.equal(validAssetPath('https://example.com/image.png'), false);
});

test('redacts hidden content and name including banner and parent', () => {
  const hidden = publicCodex({ ...entry, publicLevel: -1 });
  assert.equal(hidden.title, '???');
  assert.equal(hidden.parentSlug, null);
  assert.equal(hidden.banner, '');
  assert.equal(hidden.content.general, null);
  const normal = publicCodex(entry);
  assert.equal(normal.banner, entry.banner);
  assert.equal(normal.parentSlug, 'avalon');
  assert.equal(normal.content.specific, null);
});

test('validates versioned site image selections without uploads', () => {
  const assets = { logo: '', icon: '', social: '', background: '',
    'background-codex': '', 'background-characters': '', 'background-world': '', 'background-admin': '' };
  const prior = { siteName: 'Asas de Ferro', tagline: '', description: 'Um site',
    shareTitle: '', shareDescription: '', siteUrl: '', themeColor: '#101b27', assets,
    backgroundEffects: defaultBackgroundEffects, particleLayers: [] };
  const next = normalizeSettings({ ...prior, assets: { ...assets, logo: '/assets/logos/logo.png' } }, prior);
  assert.equal(next.assets.logo, '/assets/logos/logo.png');
  assert.throws(() => normalizeSettings({ ...prior, assets: { ...assets, logo: '/assets/../admin.png' } }, prior));
});

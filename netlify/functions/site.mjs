import { getStore } from '@netlify/blobs';
import { cookieName, getCookie, sameOrigin, verifySession } from './core.mjs';

export const config = { path: ['/system/site-config', '/system/site-upload/:kind', '/site-media/:kind'] };

const settingsStore = () => getStore('asas-de-ferro-site');
export const sceneNames = ['home', 'codex', 'characters', 'world', 'admin'];
const sceneKinds = ['background', 'background-codex', 'background-characters', 'background-world', 'background-admin'];
const assetKinds = new Set(['logo', 'icon', 'social', ...sceneKinds]);
export const defaultBackgroundEffects = Object.freeze(Object.fromEntries(
  sceneNames.map(scene => [scene, { overlay: scene === 'home' ? 40 : 52, vignette: scene === 'home' ? 55 : 45 }]),
));
const particleDirections = new Set(['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right']);
const particlePages = new Set(['all', ...sceneNames]);
const defaultParticleLayers = [
  { id: 'default-stars', name: 'Luzes celestes', enabled: true, page: 'all', color: '#D3F4ED', count: 28, speed: 24, opacity: 0.42, size: 2, direction: 'up-right' },
];
const baseSettings = Object.freeze({
  siteName: 'Asas de Ferro',
  tagline: 'Um mundo entre os céus',
  description: 'Explore os lugares, os personagens e as histórias de Asas de Ferro.',
  shareTitle: '',
  shareDescription: '',
  siteUrl: '',
  themeColor: '#101b27',
  assets: { logo: 0, background: 0, icon: 0, social: 0, 'background-codex': 0, 'background-characters': 0, 'background-world': 0, 'background-admin': 0 },
  backgroundEffects: defaultBackgroundEffects,
  particleLayers: defaultParticleLayers,
});

export async function getSiteSettings(store = settingsStore()) {
  const saved = await store.get('identity', { type: 'json', consistency: 'strong' });
  return {
    ...baseSettings, ...(saved || {}),
    assets: { ...baseSettings.assets, ...(saved?.assets || {}) },
    backgroundEffects: Object.fromEntries(sceneNames.map(scene => [scene, {
      ...defaultBackgroundEffects[scene], ...(saved?.backgroundEffects?.[scene] || {}),
    }])),
    particleLayers: Array.isArray(saved?.particleLayers) ? saved.particleLayers : defaultParticleLayers.map(layer => ({ ...layer })),
  };
}

export function normalizeSettings(input, prior) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configurações inválidas.');
  const fields = [
    ['siteName', 90, true], ['tagline', 160, false], ['description', 320, true],
    ['shareTitle', 140, false], ['shareDescription', 320, false], ['siteUrl', 300, false],
  ];
  const next = { ...prior, assets: { ...prior.assets } };
  for (const [field, limit, required] of fields) {
    if (typeof input[field] !== 'string') throw new Error(`Campo inválido: ${field}.`);
    const value = input[field].trim();
    if (value.length > limit || (required && !value) || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value)) throw new Error(`Campo inválido: ${field}.`);
    next[field] = value;
  }
  if (next.siteUrl) {
    let parsed;
    try { parsed = new URL(next.siteUrl); } catch { throw new Error('Informe uma URL completa e segura.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('Use a origem HTTPS do seu site, sem caminhos ou parâmetros.');
    }
    next.siteUrl = parsed.origin;
  }
  if (typeof input.themeColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(input.themeColor)) throw new Error('Cor do tema inválida.');
  next.themeColor = input.themeColor.toUpperCase();
  if (input.backgroundEffects !== undefined) {
    if (!input.backgroundEffects || typeof input.backgroundEffects !== 'object' || Array.isArray(input.backgroundEffects)) {
      throw new Error('Intensidades de fundo inválidas.');
    }
    next.backgroundEffects = Object.fromEntries(sceneNames.map(scene => {
      const fx = input.backgroundEffects[scene];
      if (!fx || !Number.isInteger(fx.overlay) || fx.overlay < 0 || fx.overlay > 100 ||
        !Number.isInteger(fx.vignette) || fx.vignette < 0 || fx.vignette > 100) {
        throw new Error('Intensidades de fundo inválidas.');
      }
      return [scene, { overlay: fx.overlay, vignette: fx.vignette }];
    }));
  }
  if (input.particleLayers !== undefined) {
    if (!Array.isArray(input.particleLayers) || input.particleLayers.length > 8) throw new Error('Camadas de partículas inválidas.');
    const ids = new Set();
    let total = 0;
    next.particleLayers = input.particleLayers.map(layer => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer) ||
        typeof layer.id !== 'string' || !/^[a-z0-9-]{1,45}$/.test(layer.id) || ids.has(layer.id) ||
        typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 50 ||
        typeof layer.enabled !== 'boolean' || !particlePages.has(layer.page) ||
        typeof layer.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(layer.color) ||
        !Number.isInteger(layer.count) || layer.count < 0 || layer.count > 80 ||
        typeof layer.speed !== 'number' || !Number.isFinite(layer.speed) || layer.speed < 2 || layer.speed > 100 ||
        typeof layer.opacity !== 'number' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1 ||
        typeof layer.size !== 'number' || !Number.isFinite(layer.size) || layer.size < 1 || layer.size > 12 ||
        !particleDirections.has(layer.direction)) throw new Error('Configuração de partículas inválida.');
      total += layer.enabled ? layer.count : 0;
      ids.add(layer.id);
      return { id: layer.id, name: layer.name.trim(), enabled: layer.enabled, page: layer.page,
        color: layer.color.toUpperCase(), count: layer.count, speed: layer.speed,
        opacity: layer.opacity, size: layer.size, direction: layer.direction };
    });
    if (total > 180) throw new Error('Limite de 180 partículas ativas excedido.');
  }
  return next;
}

function responseJson(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
}

function binaryType(data, kind) {
  const v = new Uint8Array(data);
  const png = v.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => v[i] === byte);
  if (png) return 'image/png';
  if (kind === 'icon' && v.length >= 6 && v[0] === 0 && v[1] === 0 && v[2] === 1 && v[3] === 0) return 'image/x-icon';
  if (kind !== 'icon' && v.length >= 3 && v[0] === 0xff && v[1] === 0xd8 && v[2] === 0xff) return 'image/jpeg';
  if (kind !== 'icon' && v.length >= 12 && String.fromCharCode(...v.slice(0, 4)) === 'RIFF' && String.fromCharCode(...v.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export default async function site(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    const method = request.method.toUpperCase();
    const store = settingsStore();
    const secret = process.env.SESSION_SECRET || '';
    const isAdmin = verifySession(getCookie(request, cookieName), secret);
    if (path[0] === 'site-media' && path.length === 2 && method === 'GET' && assetKinds.has(path[1])) {
      const kind = path[1];
      const settings = await getSiteSettings(store);
      if (!settings.assets[kind]) return new Response('Not found', { status: 404 });
      const [data, type] = await Promise.all([
        store.get(`assets/${kind}`, { type: 'arrayBuffer', consistency: 'strong' }),
        store.get(`assets-types/${kind}`, { type: 'text', consistency: 'strong' }),
      ]);
      if (!data || !type) return new Response('Not found', { status: 404 });
      return new Response(data, { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' } });
    }
    if (url.pathname === '/system/site-config') {
      if (method === 'GET') return responseJson({ settings: await getSiteSettings(store) });
      if (method !== 'PUT') return responseJson({ error: 'Método não permitido.' }, 405);
      if (!isAdmin) return responseJson({ error: 'Acesso restrito.' }, 401);
      if (!sameOrigin(request)) return responseJson({ error: 'Origem inválida.' }, 403);
      if (['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT)) return responseJson({ error: 'Edição bloqueada neste ambiente.' }, 403);
      if (Number(request.headers.get('content-length') || 0) > 12_000) return responseJson({ error: 'Dados muito grandes.' }, 413);
      const data = await request.text();
      if (data.length > 12_000) return responseJson({ error: 'Dados muito grandes.' }, 413);
      const settings = normalizeSettings(JSON.parse(data), await getSiteSettings(store));
      await store.setJSON('identity', settings);
      return responseJson({ settings });
    }
    if (path[0] === 'system' && path[1] === 'site-upload' && path.length === 3 && assetKinds.has(path[2])) {
      if (!['POST', 'DELETE'].includes(method)) return responseJson({ error: 'Método não permitido.' }, 405);
      if (!isAdmin) return responseJson({ error: 'Acesso restrito.' }, 401);
      if (!sameOrigin(request)) return responseJson({ error: 'Origem inválida.' }, 403);
      if (['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT)) return responseJson({ error: 'Edição bloqueada neste ambiente.' }, 403);
      const kind = path[2];
      if (method === 'DELETE') {
        await Promise.all([store.delete(`assets/${kind}`), store.delete(`assets-types/${kind}`)]);
        const settings = await getSiteSettings(store);
        settings.assets[kind] = 0;
        await store.setJSON('identity', settings);
        return responseJson({ settings });
      }
      const maxBytes = kind === 'icon' ? 512_000 : kind === 'logo' ? 2_000_000 : 4_000_000;
      if (Number(request.headers.get('content-length') || 0) > maxBytes) return responseJson({ error: 'Arquivo grande demais.' }, 413);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength < 8 || bytes.byteLength > maxBytes) return responseJson({ error: 'Tamanho de arquivo inválido.' }, 413);
      const type = binaryType(bytes, kind);
      if (!type) return responseJson({ error: 'Formato não permitido. Use PNG, JPG ou WebP. Para ícone, PNG ou ICO.' }, 415);
      await store.set(`assets/${kind}`, bytes);
      await store.set(`assets-types/${kind}`, type);
      const settings = await getSiteSettings(store);
      settings.assets[kind] = Date.now();
      await store.setJSON('identity', settings);
      return responseJson({ settings, assetUrl: `/site-media/${kind}?v=${settings.assets[kind]}` });
    }
    return responseJson({ error: 'Rota não encontrada.' }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return responseJson({ error: 'JSON inválido.' }, 400);
    if (error?.message && /^(Configurações inválidas|Campo inválido|Informe uma URL|Use a origem HTTPS|Cor do tema inválida)/.test(error.message)) return responseJson({ error: error.message }, 400);
    console.error('Site settings error:', error);
    return responseJson({ error: 'Erro interno ao salvar as configurações.' }, 500);
  }
}

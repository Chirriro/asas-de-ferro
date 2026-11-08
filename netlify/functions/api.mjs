import { getStore } from '@netlify/blobs';
import { initialCodices } from './seed.mjs';
import {
  cookieName, getCookie, publicCodex, publicListing, sameOrigin,
  signSession, validateCodex, verifyPassword, verifySession,
} from './core.mjs';

export const config = { path: '/api/*' };
const seed = new Map(initialCodices.map(item => [item.slug, item]));
const keys = { index: 'index' };

function respond(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });
}

function storage() {
  return getStore('asas-de-ferro-codices');
}

async function readOverride(store, slug) {
  return await store.get(`entry/${slug}`, { type: 'json', consistency: 'strong' });
}

async function readEntry(store, slug) {
  const override = await readOverride(store, slug);
  if (override?.deleted) return null;
  return override || seed.get(slug) || null;
}

async function readIndex(store) {
  return (await store.get(keys.index, { type: 'json', consistency: 'strong' })) || [];
}

async function allEntries(store) {
  const index = await readIndex(store);
  const slugs = [...new Set([...seed.keys(), ...index])];
  const entries = await Promise.all(slugs.map(slug => readEntry(store, slug)));
  return entries.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

async function writeEntry(store, item) {
  await store.setJSON(`entry/${item.slug}`, item);
  const index = await readIndex(store);
  if (!index.includes(item.slug)) await store.setJSON(keys.index, [...index, item.slug]);
}

function sessionCookie(value, request, age = 43200) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}

export default async function api(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] !== 'api') return respond({ error: 'Rota inválida.' }, 404);
    const method = request.method.toUpperCase();
    const secret = process.env.SESSION_SECRET || '';
    const isAdmin = verifySession(getCookie(request), secret);

    if (path[1] === 'session' && method === 'GET') return respond({ isAdmin });

    if (path[1] === 'login' && method === 'POST') {
      if (!sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
      if (secret.length < 32 || !process.env.ADMIN_PASSWORD_HASH) {
        return respond({ error: 'Administrador ainda não configurado no servidor.' }, 503);
      }
      const body = await request.json();
      const username = process.env.ADMIN_USERNAME || 'admin';
      if (body?.username !== username || !verifyPassword(body?.password, process.env.ADMIN_PASSWORD_HASH)) {
        return respond({ error: 'Credenciais inválidas.' }, 401);
      }
      return respond({ isAdmin: true }, 200, { 'set-cookie': sessionCookie(signSession(secret), request) });
    }

    if (path[1] === 'logout' && method === 'POST') {
      if (!sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
      return respond({ isAdmin: false }, 200, { 'set-cookie': sessionCookie('', request, 0) });
    }

    if (path[1] !== 'codices') return respond({ error: 'Rota inválida.' }, 404);
    if (path.length > 3) return respond({ error: 'Rota inválida.' }, 404);
    const slug = path[2];
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return respond({ error: 'Identificador inválido.' }, 400);
    const store = storage();

    if (!slug && method === 'GET') {
      return respond({ entries: (await allEntries(store)).map(publicListing) });
    }
    if (slug && method === 'GET') {
      const item = await readEntry(store, slug);
      return item ? respond({ entry: publicCodex(item, isAdmin && url.searchParams.get('preview') !== '1') }) : respond({ error: 'Verbete não encontrado.' }, 404);
    }

    if (!isAdmin) return respond({ error: 'Acesso restrito.' }, 401);
    if (!sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
    if (process.env.CONTEXT === 'deploy-preview' || process.env.CONTEXT === 'branch-deploy') {
      return respond({ error: 'Edição desativada neste ambiente de prévia.' }, 403);
    }

    if (!slug && method === 'POST') {
      const item = validateCodex(await request.json());
      if (await readEntry(store, item.slug)) return respond({ error: 'Este identificador já existe.' }, 409);
      await writeEntry(store, item);
      return respond({ entry: item }, 201);
    }
    if (slug && method === 'PUT') {
      if (!await readEntry(store, slug)) return respond({ error: 'Verbete não encontrado.' }, 404);
      const item = validateCodex(await request.json());
      if (item.slug !== slug) return respond({ error: 'O identificador não pode ser alterado.' }, 400);
      await writeEntry(store, item);
      return respond({ entry: item });
    }
    if (slug && method === 'DELETE') {
      if (!await readEntry(store, slug)) return respond({ error: 'Verbete não encontrado.' }, 404);
      await store.setJSON(`entry/${slug}`, { deleted: true });
      return respond({ deleted: true });
    }
    return respond({ error: 'Método não permitido.' }, 405);
  } catch (error) {
    if (error instanceof SyntaxError) return respond({ error: 'JSON inválido.' }, 400);
    if (error?.message && /^(Dados inválidos|Identificador inválido|Título deve|Categoria ou resumo|Nível público|Lista de|Marcador ou|Conteúdo inválido|Texto ausente|Marcadores)/.test(error.message)) {
      return respond({ error: error.message }, 400);
    }
    console.error('API error:', error);
    return respond({ error: 'Erro interno. Tente novamente.' }, 500);
  }
}

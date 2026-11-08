import { getStore } from '@netlify/blobs';
import { initialCodices } from './seed.mjs';
import { cookieName, getCookie, hiddenSlug, publicCodex, publicListing,
  sameOrigin, signSession, validateCodex, verifyPassword, verifySession } from './core.mjs';

export const config = { path: '/api/*' };
const seeds = new Map(initialCodices.map(entry => [entry.slug, entry]));
const store = () => getStore('asas-de-ferro-codices');
const writeForbidden = () => ['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT);

function respond(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
}
async function readEntry(db, slug) {
  const updated = await db.get(`entry/${slug}`, { type: 'json', consistency: 'strong' });
  if (updated?.deleted) return null;
  return updated || seeds.get(slug) || null;
}
async function readIndex(db) {
  return (await db.get('index', { type: 'json', consistency: 'strong' })) || [];
}
async function allEntries(db) {
  const names = [...new Set([...seeds.keys(), ...await readIndex(db)])];
  const result = await Promise.all(names.map(name => readEntry(db, name)));
  return result.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}
async function validateHierarchy(db, entry) {
  if (!entry.parentSlug) return;
  const items = await allEntries(db);
  const parents = new Map(items.map(item => [item.slug, item.parentSlug || null]));
  if (!parents.has(entry.parentSlug)) throw new Error('Verbete pai não encontrado.');
  parents.set(entry.slug, entry.parentSlug);
  const seen = new Set([entry.slug]);
  let parent = entry.parentSlug;
  while (parent) {
    if (seen.has(parent)) throw new Error('Hierarquia circular não permitida.');
    seen.add(parent);
    parent = parents.get(parent) || null;
  }
}
async function writeEntry(db, entry) {
  await db.setJSON(`entry/${entry.slug}`, entry);
  const index = await readIndex(db);
  if (!index.includes(entry.slug)) await db.setJSON('index', [...index, entry.slug]);
}
function sessionCookie(value, request, age = 43200) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}
function validTag(tag) {
  return typeof tag === 'string' && tag.trim().length > 0 && tag.trim().length <= 50 && !/[<>\u0000-\u001f]/.test(tag);
}
async function tagList(db, entries) {
  const saved = (await db.get('tags', { type: 'json', consistency: 'strong' })) || [];
  return [...new Set([...saved, ...entries.flatMap(entry => entry.tags || [])])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export default async function api(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] !== 'api' || path.length > 3) return respond({ error: 'Rota inválida.' }, 404);
    const method = request.method.toUpperCase();
    const secret = process.env.SESSION_SECRET || '';
    const admin = verifySession(getCookie(request), secret);

    if (path[1] === 'session' && method === 'GET') return respond({ isAdmin: admin });
    if (path[1] === 'login' && method === 'POST') {
      if (!sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
      if (secret.length < 32 || !process.env.ADMIN_PASSWORD_HASH) return respond({ error: 'Administrador não configurado.' }, 503);
      const body = await request.json();
      if (body?.username !== (process.env.ADMIN_USERNAME || 'admin') || !verifyPassword(body?.password, process.env.ADMIN_PASSWORD_HASH)) {
        return respond({ error: 'Credenciais inválidas.' }, 401);
      }
      return respond({ isAdmin: true }, 200, { 'set-cookie': sessionCookie(signSession(secret), request) });
    }
    if (path[1] === 'logout' && method === 'POST') {
      if (!sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
      return respond({ isAdmin: false }, 200, { 'set-cookie': sessionCookie('', request, 0) });
    }
    if (!['codices', 'tags'].includes(path[1])) return respond({ error: 'Rota inválida.' }, 404);
    const db = store();

    if (path[1] === 'tags') {
      if (path.length !== 2) return respond({ error: 'Rota inválida.' }, 404);
      if (!admin) return respond({ error: 'Acesso restrito.' }, 401);
      if (method === 'GET') return respond({ tags: await tagList(db, await allEntries(db)) });
      if (!sameOrigin(request) || writeForbidden()) return respond({ error: 'Edição não permitida.' }, 403);
      if (!['POST', 'PUT', 'DELETE'].includes(method)) return respond({ error: 'Método não permitido.' }, 405);
      const body = await request.json();
      const oldTag = body?.tag?.trim?.();
      const newTag = body?.newTag?.trim?.();
      if (!validTag(oldTag) || (method === 'PUT' && !validTag(newTag))) return respond({ error: 'Marcador inválido.' }, 400);
      const entries = await allEntries(db);
      let tags = await tagList(db, entries);
      if (method === 'POST') {
        if (tags.some(tag => tag.toLocaleLowerCase('pt-BR') === oldTag.toLocaleLowerCase('pt-BR'))) return respond({ error: 'Marcador já existe.' }, 409);
        tags.push(oldTag);
      } else {
        if (!tags.includes(oldTag)) return respond({ error: 'Marcador não encontrado.' }, 404);
        if (method === 'PUT' && oldTag !== newTag && tags.includes(newTag)) return respond({ error: 'Marcador já existe.' }, 409);
        tags = method === 'PUT' ? tags.map(tag => tag === oldTag ? newTag : tag) : tags.filter(tag => tag !== oldTag);
        for (const item of entries.filter(entry => entry.tags.includes(oldTag))) {
          const next = { ...item, tags: method === 'PUT'
            ? [...new Set(item.tags.map(tag => tag === oldTag ? newTag : tag))]
            : item.tags.filter(tag => tag !== oldTag), updatedAt: new Date().toISOString() };
          await writeEntry(db, next);
        }
      }
      await db.setJSON('tags', [...new Set(tags)]);
      return respond({ tags: await tagList(db, await allEntries(db)) });
    }

    const slug = path[2];
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return respond({ error: 'Identificador inválido.' }, 400);
    if (!slug && method === 'GET') {
      const all = await allEntries(db);
      const visible = all.map(item => publicListing(item, admin, secret));
      if (!admin) {
        const maskedParents = new Map(all.filter(item => item.publicLevel === -1).map(item => [item.slug, hiddenSlug(item.slug, secret)]));
        for (const item of visible) if (maskedParents.has(item.parentSlug)) item.parentSlug = maskedParents.get(item.parentSlug);
      }
      return respond({ entries: visible });
    }
    if (slug && method === 'GET') {
      let item = await readEntry(db, slug);
      if (!item && slug.startsWith('oculto-')) {
        item = (await allEntries(db)).find(entry => entry.publicLevel === -1 && hiddenSlug(entry.slug, secret) === slug) || null;
      }
      if (!item) return respond({ error: 'Verbete não encontrado.' }, 404);
      const response = publicCodex(item, admin && url.searchParams.get('preview') !== '1', secret);
      if (response.parentSlug && !admin) {
        const parent = await readEntry(db, response.parentSlug);
        if (parent?.publicLevel === -1) response.parentSlug = hiddenSlug(parent.slug, secret);
      }
      return respond({ entry: response });
    }

    if (!admin) return respond({ error: 'Acesso restrito.' }, 401);
    if (!sameOrigin(request) || writeForbidden()) return respond({ error: 'Edição não permitida.' }, 403);
    if (!slug && method === 'POST') {
      const item = validateCodex(await request.json());
      if (await readEntry(db, item.slug)) return respond({ error: 'Identificador já existe.' }, 409);
      await validateHierarchy(db, item);
      await writeEntry(db, item);
      return respond({ entry: item }, 201);
    }
    if (slug && method === 'PUT') {
      if (!await readEntry(db, slug)) return respond({ error: 'Verbete não encontrado.' }, 404);
      const item = validateCodex(await request.json());
      if (item.slug !== slug) return respond({ error: 'O identificador não pode ser alterado.' }, 400);
      await validateHierarchy(db, item);
      await writeEntry(db, item);
      return respond({ entry: item });
    }
    if (slug && method === 'DELETE') {
      if (!await readEntry(db, slug)) return respond({ error: 'Verbete não encontrado.' }, 404);
      if ((await allEntries(db)).some(item => item.parentSlug === slug)) return respond({ error: 'Mova ou exclua os subverbetes antes de remover este verbete.' }, 409);
      await db.setJSON(`entry/${slug}`, { deleted: true });
      return respond({ deleted: true });
    }
    return respond({ error: 'Método não permitido.' }, 405);
  } catch (error) {
    if (error instanceof SyntaxError) return respond({ error: 'JSON inválido.' }, 400);
    if (error?.message && /^(Dados inválidos|Identificador inválido|Título deve|Categoria ou resumo|Nível público|Lista de|Marcador ou|Conteúdo inválido|Texto ausente|Marcadores|Verbete pai|Hierarquia circular|Imagem de banner)/.test(error.message)) return respond({ error: error.message }, 400);
    console.error('Codex API error:', error);
    return respond({ error: 'Erro interno. Tente novamente.' }, 500);
  }
}

import { getStore } from '@netlify/blobs';
import { cookieName, getCookie, sameOrigin, verifySession } from './core.mjs';
import { applyCharacterSettings, displayCharacter, importActor } from './character-core.mjs';

export const config = { path: ['/character-data', '/character-data/:slug'] };
const getDb = () => getStore('asas-de-ferro-characters');
const deniedContext = () => ['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT);
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

async function list(db) {
  return (await db.get('index', { type: 'json', consistency: 'strong' })) || [];
}
async function read(db, slug) {
  const result = await db.get(`character/${slug}`, { type: 'json', consistency: 'strong' });
  return result?.deleted ? null : result;
}
async function requireWrite(request) {
  const secret = process.env.SESSION_SECRET || '';
  if (!verifySession(getCookie(request, cookieName), secret)) return json({ error: 'Acesso restrito.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  if (deniedContext()) return json({ error: 'Edição desativada nesta prévia.' }, 403);
  return null;
}

export default async function characters(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    if (path[0] !== 'character-data' || path.length > 2) return json({ error: 'Rota não encontrada.' }, 404);
    const slug = path[1];
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: 'Identificador inválido.' }, 400);
    const db = getDb();
    const method = request.method.toUpperCase();
    if (method === 'GET' && !slug) {
      const items = await list(db);
      const entries = await Promise.all(items.map(async id => {
        const item = await read(db, id);
        return item ? { slug: item.slug, name: item.name, level: item.level, sprite: item.sprite, classes: item.classes.map(c => ({ name: c.name, level: c.level })) } : null;
      }));
      return json({ entries: entries.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) });
    }
    if (method === 'GET' && slug) {
      const profile = await read(db, slug);
      return profile ? json({ character: displayCharacter(profile) }) : json({ error: 'Personagem não encontrado.' }, 404);
    }
    if (!['POST','PUT','DELETE'].includes(method)) return json({ error: 'Método não permitido.' }, 405);
    const failed = await requireWrite(request);
    if (failed) return failed;
    if (method === 'POST' && !slug) {
      if (Number(request.headers.get('content-length') || 0) > 1_500_000) return json({ error: 'JSON grande demais.' }, 413);
      const text = await request.text();
      if (text.length > 1_500_000) return json({ error: 'JSON grande demais.' }, 413);
      const profile = importActor(JSON.parse(text));
      const index = await list(db);
      let old = null;
      // Prefer Foundry's stable export UUID, including when the character is renamed.
      if (profile.sourceId) {
        for (const id of index) {
          const existing = await read(db, id);
          if (existing?.sourceId === profile.sourceId) { old = existing; break; }
        }
      }
      const collision = await read(db, profile.slug);
      if (!old && collision) {
        // Pre-V14 records are matched by slug once, then upgraded to UUID matching.
        if (collision.sourceId && collision.sourceId !== profile.sourceId) {
          return json({ error: 'Outro personagem já usa este identificador.' }, 409);
        }
        old = collision;
      }
      if (old) {
        profile.slug = old.slug;
        profile.sprite = old.sprite || '';
        profile.spriteTransform = old.spriteTransform || { size: 100, x: 0, y: 0 };
        profile.maxOverrides = old.maxOverrides || profile.maxOverrides;
      }
      await db.setJSON(`character/${profile.slug}`, profile);
      if (!index.includes(profile.slug)) await db.setJSON('index', [...index, profile.slug]);
      return json({ character: displayCharacter(profile), updated: Boolean(old) }, old ? 200 : 201);
    }
    if (method === 'PUT' && slug) {
      const old = await read(db, slug);
      if (!old) return json({ error: 'Personagem não encontrado.' }, 404);
      if (Number(request.headers.get('content-length') || 0) > 12000) return json({ error: 'Dados grandes demais.' }, 413);
      const input = await request.text();
      if (input.length > 12000) return json({ error: 'Dados grandes demais.' }, 413);
      const next = applyCharacterSettings(old, JSON.parse(input));
      await db.setJSON(`character/${slug}`, next);
      return json({ character: displayCharacter(next) });
    }
    if (method === 'DELETE' && slug) {
      const old = await read(db, slug);
      if (!old) return json({ error: 'Personagem não encontrado.' }, 404);
      await db.setJSON(`character/${slug}`, { deleted: true });
      await db.setJSON('index', (await list(db)).filter(id => id !== slug));
      return json({ deleted: true });
    }
    return json({ error: 'Rota não encontrada.' }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'O arquivo não contém JSON válido.' }, 400);
    if (error?.message && /^(Arquivo inválido|O personagem|Não foi possível|Imagem inválida|Dados inválidos|Valor máximo inválido|Enquadramento do sprite inválido)/.test(error.message)) return json({ error: error.message }, 400);
    console.error('Character API error', error);
    return json({ error: 'Erro interno ao processar personagem.' }, 500);
  }
}

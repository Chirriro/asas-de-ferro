import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

export const levels = ['general', 'specific', 'professional'];
export const cookieName = 'adf_session';
const secretStart = '{{secret}}';
const secretEnd = '{{/secret}}';

export function hideSecrets(value) {
  let result = '';
  let position = 0;
  while (position < value.length) {
    const start = value.indexOf(secretStart, position);
    if (start < 0) return result + value.slice(position);
    result += value.slice(position, start) + '???';
    const end = value.indexOf(secretEnd, start + secretStart.length);
    if (end < 0) return result;
    position = end + secretEnd.length;
  }
  return result;
}

export function hasValidSecretPairs(value) {
  let open = false;
  const tokens = value.match(/\{\{\/?secret\}\}/g) || [];
  for (const token of tokens) {
    if (token === secretStart) {
      if (open) return false;
      open = true;
    } else {
      if (!open) return false;
      open = false;
    }
  }
  return !open;
}

export function publicCodex(codex, isAdmin = false) {
  if (isAdmin) return codex;
  const result = {
    slug: codex.slug,
    title: codex.title,
    category: codex.category,
    tags: codex.tags,
    aliases: codex.aliases,
    summary: codex.summary,
    publicLevel: codex.publicLevel,
    updatedAt: codex.updatedAt,
    content: {},
  };
  levels.forEach((level, index) => {
    result.content[level] = index <= codex.publicLevel
      ? hideSecrets(codex.content[level])
      : null;
  });
  return result;
}

export function publicListing(codex) {
  const { slug, title, category, tags, aliases, summary, updatedAt } = codex;
  return { slug, title, category, tags, aliases, summary, updatedAt };
}

export function validateCodex(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Dados inválidos.');
  const slug = String(payload.slug || '').toLowerCase().trim();
  const title = String(payload.title || '').trim();
  const category = String(payload.category || 'Geral').trim();
  const summary = String(payload.summary || '').trim();
  const publicLevel = Number(payload.publicLevel);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 72) throw new Error('Identificador inválido.');
  if (!title || title.length > 120) throw new Error('Título deve conter entre 1 e 120 caracteres.');
  if (!category || category.length > 80 || summary.length > 1000) throw new Error('Categoria ou resumo muito longo.');
  if (!Number.isInteger(publicLevel) || publicLevel < 0 || publicLevel > 2) throw new Error('Nível público inválido.');
  const cleanList = (items, limit) => {
    if (!Array.isArray(items) || items.length > 30) throw new Error('Lista de marcadores inválida.');
    const values = items.map(item => typeof item === 'string' ? item.trim() : '');
    if (values.some(value => !value || value.length > limit)) throw new Error('Marcador ou sinônimo inválido.');
    return [...new Set(values)];
  };
  const tags = cleanList(payload.tags || [], 50);
  const aliases = cleanList(payload.aliases || [], 120);
  if (!payload.content || typeof payload.content !== 'object') throw new Error('Conteúdo inválido.');
  const content = {};
  for (const level of levels) {
    if (typeof payload.content[level] !== 'string' || payload.content[level].length > 150_000) {
      throw new Error('Texto ausente ou maior que o permitido.');
    }
    if (!hasValidSecretPairs(payload.content[level])) throw new Error(`Marcadores {{secret}} inválidos em ${level}.`);
    content[level] = payload.content[level];
  }
  return { slug, title, category, summary, publicLevel, tags, aliases, content, updatedAt: new Date().toISOString() };
}

export function passwordHash(password, saltHex) {
  return `${saltHex}:${scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024 || typeof encoded !== 'string') return false;
  const match = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const expected = Buffer.from(match[2], 'hex');
  const actual = scryptSync(password, Buffer.from(match[1], 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function signSession(secret, timestamp = Date.now()) {
  const payload = String(Math.floor(timestamp / 1000) + 12 * 60 * 60);
  const signature = createHmac('sha256', secret).update(`admin.${payload}`).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySession(cookie, secret, now = Date.now()) {
  if (typeof cookie !== 'string' || typeof secret !== 'string' || secret.length < 32) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra || !/^\d{10,11}$/.test(expires || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (Number(expires) < Math.floor(now / 1000)) return false;
  const expected = createHmac('sha256', secret).update(`admin.${expires}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function getCookie(request, name = cookieName) {
  const cookies = request.headers.get('cookie') || '';
  const part = cookies.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : '';
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const hostOrigin = new URL(request.url).origin;
  return Boolean(origin) && origin === hostOrigin && request.headers.get('x-codex-request') === '1';
}

import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

export const levels = ['general', 'specific', 'professional'];
export const cookieName = 'adf_session';

export function hideSecrets(value) {
  const open = '{{secret}}';
  const close = '{{/secret}}';
  let result = '', cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(open, cursor);
    if (start < 0) return result + value.slice(cursor);
    result += value.slice(cursor, start) + '???';
    const end = value.indexOf(close, start + open.length);
    if (end < 0) return result;
    cursor = end + close.length;
  }
  return result;
}

export function hasValidSecretPairs(value) {
  let open = false;
  for (const marker of value.match(/\{\{\/?secret\}\}/g) || []) {
    if (marker === '{{secret}}') {
      if (open) return false;
      open = true;
    } else {
      if (!open) return false;
      open = false;
    }
  }
  return !open;
}

export function hiddenSlug(slug, secret) {
  const hash = createHmac('sha256', secret || 'local-codex-secret').update(`hidden:${slug}`).digest('hex');
  return `oculto-${hash.slice(0, 22)}`;
}

export function publicCodex(codex, isAdmin = false, secret = '') {
  if (isAdmin) return codex;
  const hidden = codex.publicLevel === -1;
  const result = {
    slug: hidden ? hiddenSlug(codex.slug, secret) : codex.slug,
    title: hidden ? '???' : codex.title,
    category: hidden ? 'Desconhecido' : codex.category,
    tags: hidden ? [] : codex.tags,
    aliases: hidden ? [] : codex.aliases,
    summary: hidden ? '' : codex.summary,
    publicLevel: codex.publicLevel,
    updatedAt: codex.updatedAt,
    content: {},
  };
  levels.forEach((level, index) => {
    result.content[level] = index <= codex.publicLevel ? hideSecrets(codex.content[level]) : null;
  });
  return result;
}

export function publicListing(codex, isAdmin = false, secret = '') {
  const { content, publicLevel, ...metadata } = publicCodex(codex, isAdmin, secret);
  return metadata;
}

export function validateCodex(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Dados inválidos.');
  const slug = String(payload.slug || '').toLowerCase().trim();
  const title = String(payload.title || '').trim();
  const category = String(payload.category || 'Geral').trim();
  const summary = String(payload.summary || '').trim();
  const publicLevel = Number(payload.publicLevel);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 72 || slug.startsWith('oculto-')) throw new Error('Identificador inválido.');
  if (!title || title.length > 120) throw new Error('Título deve conter entre 1 e 120 caracteres.');
  if (!category || category.length > 80 || summary.length > 1000) throw new Error('Categoria ou resumo muito longo.');
  if (!Number.isInteger(publicLevel) || publicLevel < -1 || publicLevel > 2) throw new Error('Nível público inválido.');
  const cleanList = (list, max) => {
    if (!Array.isArray(list) || list.length > 30) throw new Error('Lista de marcadores inválida.');
    const values = list.map(value => typeof value === 'string' ? value.trim() : '');
    if (values.some(value => !value || value.length > max)) throw new Error('Marcador ou sinônimo inválido.');
    return [...new Set(values)];
  };
  const tags = cleanList(payload.tags || [], 50);
  const aliases = cleanList(payload.aliases || [], 120);
  if (!payload.content || typeof payload.content !== 'object') throw new Error('Conteúdo inválido.');
  const content = {};
  for (const level of levels) {
    if (typeof payload.content[level] !== 'string' || payload.content[level].length > 150_000) throw new Error('Texto ausente ou maior que o permitido.');
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
  return timingSafeEqual(scryptSync(password, Buffer.from(match[1], 'hex'), 64), Buffer.from(match[2], 'hex'));
}
export function signSession(secret, timestamp = Date.now()) {
  const expires = String(Math.floor(timestamp / 1000) + 12 * 3600);
  return `${expires}.${createHmac('sha256', secret).update(`admin.${expires}`).digest('hex')}`;
}
export function verifySession(cookie, secret, now = Date.now()) {
  if (typeof cookie !== 'string' || typeof secret !== 'string' || secret.length < 32) return false;
  const [expires, signature, extra] = cookie.split('.');
  if (extra || !/^\d{10,11}$/.test(expires || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (Number(expires) < Math.floor(now / 1000)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(`admin.${expires}`).digest(), Buffer.from(signature, 'hex'));
}
export function getCookie(request, name = cookieName) {
  const part = (request.headers.get('cookie') || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : '';
}
export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('x-codex-request') === '1';
}

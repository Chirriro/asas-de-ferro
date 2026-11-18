import { validAssetPath } from './core.mjs';

const kindNames = { physical: 'Físico', air: 'Ar', bolt: 'Raio', dark: 'Trevas', earth: 'Terra', fire: 'Fogo', ice: 'Gelo', light: 'Luz', poison: 'Veneno' };
const statNames = { dex: 'Destreza', ins: 'Astúcia', mig: 'Vigor', wlp: 'Vontade' };
const clean = (value, max = 160) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bounded = (value, fallback = 0, max = 9999) => Math.max(0, Math.min(max, Math.round(number(value, fallback))));

export function plainText(html, max = 1800) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // Foundry enrichers are references, not readable descriptions outside Foundry.
    .replace(/@[a-z][a-z0-9_.-]*\[[^\]\r\n]*\](?:\{[^}\r\n]*\})?/gi, '')
    .replace(/<\s*\/?\s*(?:p|div|br|li|h\d|hr|ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|#x27);/gi, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" })[entity.toLowerCase()] || entity)
    .replace(/\n\s*\n+/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

export function validateSprite(sprite) {
  return sprite === '' || (validAssetPath(sprite) && /\.(?:png|jpe?g|webp|avif|gif)$/i.test(sprite));
}

// Sprite framing is shared by the web view and PNG exporter.
export const defaultSpriteTransform = Object.freeze({ size: 100, x: 0, y: 0 });

export function normalizeSpriteTransform(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    size: Number.isFinite(input.size) ? Math.max(50, Math.min(250, Math.round(input.size))) : 100,
    x: Number.isFinite(input.x) ? Math.max(-60, Math.min(60, Math.round(input.x))) : 0,
    y: Number.isFinite(input.y) ? Math.max(-60, Math.min(60, Math.round(input.y))) : 0,
  };
}

export function sourceIdentity(raw) {
  const id = raw?._stats?.exportSource;
  if (typeof id?.worldId !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id.worldId)) return '';
  if (typeof id.uuid !== 'string' || !/^Actor\.[a-zA-Z0-9]{8,32}$/.test(id.uuid)) return '';
  return `${id.worldId}:${id.uuid}`;
}

function resourcesFromActor(actor, classes, peculiarities) {
  const src = actor.system || {};
  const lvl = bounded(src.level?.value, 1, 100);
  const mig = bounded(src.attributes?.mig?.base, 6, 20);
  const wlp = bounded(src.attributes?.wlp?.base, 6, 20);
  const benefits = resource => classes.filter(item => item.resourceBenefits?.[resource] === true).length * 5;
  // Derived data is not embedded in standard Foundry Actor exports.
  const baseline = {
    hp: 5 * mig + lvl + benefits('hp') + number(src.resources?.hp?.bonus),
    mp: 5 * wlp + lvl + benefits('mp') + number(src.resources?.mp?.bonus),
    ip: 6 + classes.filter(item => item.resourceBenefits?.ip).length * 2 + number(src.resources?.ip?.bonus),
  };
  // A known peculiarity grants +5 to both maxima. Other custom effects remain editable.
  for (const feature of peculiarities) {
    const text = feature.description;
    if (/aumente seus pv e pm máximos em 5/i.test(text)) { baseline.hp += 5; baseline.mp += 5; }
  }
  const result = {};
  for (const resource of ['hp', 'mp', 'ip']) {
    const current = bounded(src.resources?.[resource]?.value, 0);
    const calculated = bounded(baseline[resource]);
    result[resource] = { current, calculated, max: Math.max(current, calculated) };
  }
  return result;
}

export function importActor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'character' || !raw.system || !Array.isArray(raw.items)) {
    throw new Error('Arquivo inválido: exporte um Ator do tipo Personagem no Foundry.');
  }
  if (raw.items.length > 500) throw new Error('O personagem contém itens demais.');
  const name = clean(raw.name, 120);
  if (!name) throw new Error('O personagem não possui nome.');
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (!slug) throw new Error('Não foi possível gerar o identificador.');
  const classes = raw.items.filter(i => i?.type === 'class').slice(0, 25).map(i => ({
    name: clean(i.name, 120), key: clean(i.system?.fuid, 120),
    resourceBenefits: Object.fromEntries(['hp', 'mp', 'ip'].map(k => [k, i.system?.benefits?.resources?.[k]?.value === true])),
    level: Number.isInteger(i.system?.level?.value) ? bounded(i.system.level.value) : null,
  }));
  const skills = raw.items.filter(i => i?.type === 'skill').slice(0, 150).map(i => ({
    name: clean(i.name, 120), level: bounded(i.system?.level?.value, 1, 25),
    classKey: clean(i.system?.class?.value, 120), description: plainText(i.system?.description),
  }));
  for (const cls of classes) if (cls.level == null) cls.level = skills.filter(s => s.classKey && s.classKey === cls.key).reduce((sum, s) => sum + s.level, 0);
  const peculiarities = raw.items.filter(i => i?.type === 'optionalFeature' && (i.system?.fuid === 'peculiaridade' || /peculiaridade/i.test(i.name || ''))).slice(0, 30).map(i => ({
    name: clean(i.name, 120), description: plainText(i.system?.data?.description || i.system?.description, 2100),
  }));
  const attributes = Object.fromEntries(Object.keys(statNames).map(key => [key, {
    name: statNames[key], value: bounded(raw.system?.attributes?.[key]?.base, 6, 20),
  }]));
  const affinities = Object.fromEntries(Object.keys(kindNames).map(key => [key, {
    name: kindNames[key], value: Math.max(-4, Math.min(4, number(raw.system?.affinities?.[key]?.base))),
  }]));
  const profile = {
    slug, name, level: bounded(raw.system.level?.value, 1, 100),
    sourceId: sourceIdentity(raw),
    attributes, affinities, classes, skills, peculiarities,
    sprite: '', cardSubtitle: '', spriteTransform: { ...defaultSpriteTransform }, maxOverrides: { hp: null, mp: null, ip: null },
    updatedAt: new Date().toISOString(),
  };
  profile.resources = resourcesFromActor(raw, classes, peculiarities);
  return profile;
}

export function applyCharacterSettings(profile, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dados inválidos.');
  const sprite = data.sprite ?? '';
  if (typeof sprite !== 'string' || sprite.length > 250 || !validateSprite(sprite)) throw new Error('Imagem inválida. Selecione uma imagem da biblioteca.');
  const overrides = {};
  for (const key of ['hp', 'mp', 'ip']) {
    const value = data.maxOverrides?.[key];
    if (value === '' || value === null || value === undefined) overrides[key] = null;
    else if (!Number.isInteger(value) || value < 0 || value > 9999) throw new Error('Valor máximo inválido.');
    else overrides[key] = value;
  }
  const cardSubtitle = data.cardSubtitle === undefined ? (profile.cardSubtitle || '') : data.cardSubtitle;
  if (typeof cardSubtitle !== 'string' || cardSubtitle.length > 160) throw new Error('Texto da seleção inválido.');
  let spriteTransform = normalizeSpriteTransform(profile.spriteTransform);
  if (data.spriteTransform !== undefined) {
    const value = data.spriteTransform;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !['size', 'x', 'y'].every(key => Number.isInteger(value[key])) ||
      value.size < 50 || value.size > 250 || Math.abs(value.x) > 60 || Math.abs(value.y) > 60) {
      throw new Error('Enquadramento do sprite inválido.');
    }
    spriteTransform = { size: value.size, x: value.x, y: value.y };
  }
  return { ...profile, sprite, cardSubtitle: cardSubtitle.trim(), spriteTransform, maxOverrides: overrides, updatedAt: new Date().toISOString() };
}

export function displayCharacter(profile) {
  const resources = Object.fromEntries(['hp','mp','ip'].map(key => [key, {
    ...profile.resources[key], max: profile.maxOverrides?.[key] ?? profile.resources[key].max,
  }]));
  return {
    slug: profile.slug, name: profile.name, level: profile.level, sprite: profile.sprite || '', cardSubtitle: profile.cardSubtitle || '',
    spriteTransform: normalizeSpriteTransform(profile.spriteTransform),
    maxOverrides: profile.maxOverrides || { hp:null, mp:null, ip:null },
    resources, attributes: profile.attributes, affinities: profile.affinities,
    classes: (profile.classes || []).map(c => ({ name: c.name, key: c.key, level: c.level })),
    skills: (profile.skills || []).map(s => ({ name:s.name, level:s.level, classKey:s.classKey, description:plainText(s.description) })),
    peculiarities: (profile.peculiarities || []).map(f => ({ name:f.name, description:plainText(f.description, 2100) })),
  };
}

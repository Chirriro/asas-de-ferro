const dataBase = '/character-data';
let rosterCache = null;
const profiles = new Map();
const affinityLabels = {
  physical: 'Físico', air: 'Ar', bolt: 'Raio', dark: 'Trevas', earth: 'Terra',
  fire: 'Fogo', ice: 'Gelo', light: 'Luz', poison: 'Veneno',
};
const statLabels = { dex: 'DESTREZA', ins: 'ASTÚCIA', mig: 'VIGOR', wlp: 'VONTADE' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const level = n => Number.isFinite(Number(n)) ? Number(n) : 0;

async function request(route = '', options = {}) {
  const headers = { ...options.headers };
  if (options.method && options.method !== 'GET') headers['x-codex-request'] = '1';
  const response = await fetch(`${dataBase}${route}`, { ...options, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body;
}
export function invalidateCharacters() { rosterCache = null; profiles.clear(); }
async function getRoster() { if (!rosterCache) rosterCache = request().then(r => r.entries).catch(e => { rosterCache = null; throw e; }); return rosterCache; }
async function getProfile(slug) {
  if (!profiles.has(slug)) profiles.set(slug, request('/' + slug).then(r => r.character).catch(e => { profiles.delete(slug); throw e; }));
  return profiles.get(slug);
}
export async function prefetchCharacters(pathname) {
  if (pathname === '/personagens' || pathname === '/admin/personagens') await getRoster();
  const match = /^\/(?:personagens|admin\/personagens\/editar)\/([a-z0-9-]+)$/.exec(pathname);
  if (match) await getProfile(match[1]);
}
const sprite = path => typeof path === 'string' && /^\/assets\/[a-zA-Z0-9%_.~()/\-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(path) ? path : '';
function portrait(path, alt, cls = 'character-portrait') {
  return sprite(path) ? `<img src="${esc(path)}" class="${cls}" alt="${esc(alt)}" draggable="false">` : '<div class="character-no-sprite" aria-hidden="true">◇</div>';
}
const spriteDefaults = { size: 100, x: 0, y: 0 };
function spriteFrame(value) {
  const input = value && typeof value === 'object' ? value : {};
  const safe = (key, low, high, fallback) => Number.isFinite(input[key])
    ? Math.min(high, Math.max(low, Math.round(input[key]))) : fallback;
  return { size: safe('size', 50, 250, 100), x: safe('x', -60, 60, 0), y: safe('y', -60, 60, 0) };
}
function frameStyle(value) {
  const { size, x, y } = spriteFrame(value);
  return `style="--character-sprite-size:${size / 100};--character-sprite-x:${x}%;--character-sprite-y:${y}%"`;
}
function back(label, href) { return `<a href="${href}" class="return-link" data-nav><span aria-hidden="true">←</span> ${label}</a>`; }
function fieldTitle(value) { return `<h2 class="character-title">${value}</h2>`; }
const affinityText = amount => amount <= -2 ? 'Muito vulnerável' : amount === -1 ? 'Vulnerável' : amount === 0 ? 'Normal' : amount === 1 ? 'Resistente' : amount === 2 ? 'Imune' : 'Absorção';

export async function renderCharacterIndex(app) {
  const entries = await getRoster();
  app.innerHTML = `<div class="scene inner-scene character-scene"><div class="inner-page">
    ${back('MENU PRINCIPAL', '/')}
    <div class="panel-heading character-heading"><span class="overline">REGISTROS DA CAMPANHA</span><h1>Personagens</h1></div>
    ${entries.length ? `<div class="character-roster">${entries.map(c => `<a data-nav href="/personagens/${esc(c.slug)}" class="character-roster-card">
      <div class="character-roster-art">${portrait(c.sprite, c.name)}</div>
      <div class="character-roster-info"><span class="overline">NÍVEL ${level(c.level)}</span><h2>${esc(c.name)}</h2>
        <p>${esc(c.classes.map(k => k.name).join(' · '))}</p></div>
    </a>`).join('')}</div>` : '<div class="character-empty">Nenhum personagem disponível.</div>'}
  </div></div>`;
}

function skillGroups(profile) {
  const groups = profile.classes.map(cls => ({ ...cls, skills: profile.skills.filter(item => item.classKey && item.classKey === cls.key) }));
  const known = new Set(profile.classes.map(cls => cls.key).filter(Boolean));
  const ungrouped = profile.skills.filter(item => !item.classKey || !known.has(item.classKey));
  if (ungrouped.length) groups.push({ name: 'Outras habilidades', key: '', skills: ungrouped });
  return groups;
}
function resourcesTemplate(profile) {
  return ['hp','mp','ip'].map((key, i) => `<div class="character-resource ${key}"><span>${['PV MÁXIMOS','PM MÁXIMOS','PI MÁXIMOS'][i]}</span><strong>${level(profile.resources[key]?.max)}</strong></div>`).join('');
}
export async function renderCharacterSheet(app, slug) {
  const p = await getProfile(slug);
  app.innerHTML = `<div class="scene inner-scene character-scene"><div class="inner-page">
    ${back('PERSONAGENS', '/personagens')}
    <div class="character-sheet" id="character-sheet-view">
      <div class="character-sheet-content">
        <header class="character-summary">
          <span class="overline">PERSONAGEM · NÍVEL ${level(p.level)}</span>
          <h1>${esc(p.name)}</h1>
          <div class="character-resources">${resourcesTemplate(p)}</div>
        </header>
        <section class="character-panel">${fieldTitle(`Classes · Nível ${level(p.level)}`)}
          <div class="character-class-list">${p.classes.map(cls => `<span>${esc(cls.name)} <strong>NV ${level(cls.level)}</strong></span>`).join('') || '<span>Nenhuma classe registrada</span>'}</div>
        </section>
        <div class="character-stat-columns">
          <section class="character-panel">${fieldTitle('Atributos')}<div class="character-attribute-grid">
            ${Object.entries(statLabels).map(([key,label]) => `<div class="character-attribute"><span>${label}</span><strong>d${level(p.attributes[key]?.value)}</strong></div>`).join('')}
          </div></section>
          <section class="character-panel">${fieldTitle('Afinidades')}<div class="character-affinity-grid">
            ${Object.entries(affinityLabels).map(([key,label]) => `<div class="character-affinity"><span>${label}</span><strong class="affinity-${level(p.affinities[key]?.value)}">${affinityText(level(p.affinities[key]?.value))}</strong></div>`).join('')}
          </div></section>
        </div>
        <section class="character-panel">${fieldTitle('Habilidades')}
          <div class="character-skill-groups">${skillGroups(p).map(cls => `<section class="character-skill-group"><h3>${esc(cls.name)}</h3>
            ${cls.skills.map(skill => `<div class="character-skill"><div><strong>${esc(skill.name)}</strong><span>NV ${level(skill.level)}</span></div>${skill.description ? `<p>${esc(skill.description)}</p>` : ''}</div>`).join('') || '<p>Nenhuma habilidade registrada.</p>'}
          </section>`).join('')}</div>
        </section>
        <section class="character-panel">${fieldTitle('Peculiaridades')}
          ${p.peculiarities.length ? `<div class="character-peculiarities">${p.peculiarities.map(item => `<section><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}</section>`).join('')}</div>` : '<p>Nenhuma peculiaridade registrada.</p>'}
        </section>
      </div>
      <aside class="character-sprite-wrap" ${frameStyle(p.spriteTransform)} aria-label="Ilustração de ${esc(p.name)}">${portrait(p.sprite, p.name)}</aside>
    </div>
    <div class="character-download-row"><button class="ui-button" type="button" id="character-download">BAIXAR FICHA PNG</button><span id="character-download-status" role="status"></span></div>
  </div></div>`;
  app.querySelector('#character-download')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = app.querySelector('#character-download-status');
    button.disabled = true;
    status.textContent = 'Gerando imagens…';
    try {
      await downloadCharacterPNG(p);
      status.textContent = 'Ficha PNG gerada.';
    } catch (error) { status.textContent = `Falha: ${error.message}`; }
    finally { button.disabled = false; }
  });
}

export async function renderCharacterAdmin(app, navigate) {
  const entries = await getRoster();
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">
    ${back('PAINEL DO MESTRE', '/admin')}
    <div class="panel-heading character-heading"><span class="overline">IMPORTAÇÃO DE FICHAS FOUNDRY V14</span><h1>Gerenciar Personagens</h1></div>
    <div class="character-import"><label class="ui-button" for="character-json-files">IMPORTAR JSON</label>
      <input id="character-json-files" type="file" accept=".json,application/json" multiple>
      <span id="character-import-status" role="status"></span></div>
    <div class="admin-entry-list">${entries.map(c => `<a href="/admin/personagens/editar/${esc(c.slug)}" data-nav>
      <span><strong>${esc(c.name)}</strong><small>Nível ${level(c.level)} · ${esc(c.classes.map(cls=>cls.name).join(' / '))}</small></span>
      <span>CONFIGURAR →</span></a>`).join('') || '<p>Nenhum personagem importado.</p>'}</div>
  </div></div>`;
  app.querySelector('#character-json-files').addEventListener('change', async event => {
    const files = [...event.target.files];
    const status = app.querySelector('#character-import-status');
    const errors = [];
    let imported = 0;
    for (const file of files) {
      if (file.size > 1_500_000) { errors.push(`${file.name}: muito grande`); continue; }
      try {
        const contents = await file.text();
        await request('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: contents });
        imported++;
      } catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    invalidateCharacters();
    status.textContent = [imported ? `${imported} arquivo(s) importado(s).` : '', ...errors].filter(Boolean).join(' ');
    const target = app.querySelector('.admin-entry-list');
    if (target) {
      const records = await getRoster();
      target.innerHTML = records.map(c => `<a href="/admin/personagens/editar/${esc(c.slug)}" data-nav><span><strong>${esc(c.name)}</strong><small>Nível ${level(c.level)}</small></span><span>CONFIGURAR →</span></a>`).join('');
    }
  });
}

export async function renderCharacterEditor(app, slug, navigate, openAssetLibrary) {
  const p = await getProfile(slug);
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page character-admin-page">
    ${back('GERENCIAR PERSONAGENS', '/admin/personagens')}
    <div class="panel-heading character-heading"><span class="overline">CONFIGURAÇÃO DO PERSONAGEM</span><h1>${esc(p.name)}</h1></div>
    <form id="character-config-form" class="character-config-form">
      <div class="character-admin-sprite">
        <div class="character-editor-frame" id="character-sprite-preview" ${frameStyle(p.spriteTransform)}>${portrait(p.sprite, p.name, 'character-portrait')}</div>
        <div class="character-editor-controls">
          <label for="character-sprite">SPRITE</label><input id="character-sprite" type="text" readonly value="${esc(p.sprite || '')}" placeholder="Sem imagem">
          <div class="character-config-buttons"><button type="button" class="ui-button secondary" id="character-pick">BIBLIOTECA</button><button type="button" class="ui-button secondary" id="character-clear">LIMPAR</button></div>
          <div class="character-sprite-controls">
            ${[
              ['size', 'TAMANHO', 50, 250, '%'],
              ['x', 'POSIÇÃO HORIZONTAL', -60, 60, '%'],
              ['y', 'POSIÇÃO VERTICAL', -60, 60, '%'],
            ].map(([key, label, min, max, suffix]) => `<div class="character-sprite-setting"><div class="character-sprite-setting-heading"><label for="sprite-${key}">${label}</label><output id="sprite-${key}-value" for="sprite-${key}">${spriteFrame(p.spriteTransform)[key]}${suffix}</output></div><input type="range" id="sprite-${key}" min="${min}" max="${max}" step="1" value="${spriteFrame(p.spriteTransform)[key]}"></div>`).join('')}
            <button type="button" class="ui-button secondary" id="sprite-reset">REDEFINIR ENQUADRAMENTO</button>
          </div>
        </div>
      </div>
      <h2>PV / PM / PI MÁXIMOS</h2>
      <div class="character-config-max">${['hp','mp','ip'].map(key=>`<div><label for="character-max-${key}">${key.toUpperCase()}</label>
        <input id="character-max-${key}" type="number" min="0" max="9999" placeholder="Calculado: ${level(p.resources[key]?.calculated)}" value="${p.maxOverrides?.[key] ?? ''}"></div>`).join('')}</div>
      <div class="character-config-buttons"><button type="submit" class="ui-button">SALVAR</button><button type="button" id="character-remove" class="ui-button danger">EXCLUIR</button></div>
      <p id="notice" class="notice" role="status"></p>
    </form>
    <p><a class="ui-button secondary" data-nav href="/personagens/${esc(p.slug)}">VER FICHA PÚBLICA</a></p>
  </div></div>`;
  const spriteInput = app.querySelector('#character-sprite');
  const previewFrame = app.querySelector('#character-sprite-preview');
  const getFrame = () => ({
    size: Number(app.querySelector('#sprite-size').value),
    x: Number(app.querySelector('#sprite-x').value),
    y: Number(app.querySelector('#sprite-y').value),
  });
  const updateFrame = () => {
    const value = getFrame();
    previewFrame.style.setProperty('--character-sprite-size', String(value.size / 100));
    previewFrame.style.setProperty('--character-sprite-x', `${value.x}%`);
    previewFrame.style.setProperty('--character-sprite-y', `${value.y}%`);
    for (const [key, amount] of Object.entries(value)) app.querySelector(`#sprite-${key}-value`).textContent = `${amount}%`;
  };
  for (const key of ['size', 'x', 'y']) app.querySelector(`#sprite-${key}`).addEventListener('input', updateFrame);
  app.querySelector('#sprite-reset').addEventListener('click', () => {
    for (const [key, value] of Object.entries(spriteDefaults)) app.querySelector(`#sprite-${key}`).value = value;
    updateFrame();
  });
  const setSprite = path => {
    spriteInput.value = path;
    previewFrame.innerHTML = path
      ? `<img class="character-portrait" draggable="false" src="${esc(path)}" alt="Prévia">`
      : '<div class="character-no-sprite">◇</div>';
  };
  app.querySelector('#character-pick').addEventListener('click', () => openAssetLibrary(setSprite));
  app.querySelector('#character-clear').addEventListener('click', () => setSprite(''));
  app.querySelector('#character-config-form').addEventListener('submit', async event => {
    event.preventDefault();
    const overrides = Object.fromEntries(['hp','mp','ip'].map(key => {
      const value = app.querySelector('#character-max-' + key).value;
      return [key, value === '' ? null : Number(value)];
    }));
    try {
      await request('/' + slug, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sprite: spriteInput.value, spriteTransform: getFrame(), maxOverrides: overrides }) });
      invalidateCharacters();
      app.querySelector('#notice').textContent = 'Alterações salvas.';
    } catch (error) { app.querySelector('#notice').textContent = error.message; }
  });
  app.querySelector('#character-remove').addEventListener('click', async () => {
    if (!confirm(`Excluir ${p.name}?`)) return;
    try { await request('/' + slug, { method:'DELETE' }); invalidateCharacters(); navigate('/admin/personagens'); }
    catch (error) { app.querySelector('#notice').textContent = error.message; }
  });
}

// One high-resolution reference sheet. Height adapts to all skills.
export async function downloadCharacterPNG(profile) {
  await document.fonts.ready;
  const WIDTH = 2480;
  const PAD = 120;
  const GAP = 86;
  const COL = (WIDTH - PAD * 2 - GAP) / 2;
  const headerBottom = 930;
  const fontBody = '"PT Sans Narrow", sans-serif';
  const fontTitle = 'Cinzel, Georgia, serif';
  const fontLabel = 'Antonio, sans-serif';
  const ink = '#26333a';
  const muted = '#56656a';
  const paper = '#f7f6f1';
  const accentCss = getComputedStyle(document.documentElement).getPropertyValue('--theme-base').trim();
  const accent = /^#[0-9a-f]{6}$/i.test(accentCss) ? accentCss : '#42685c';
  const title = text => String(text ?? '');

  const art = await (async () => {
    if (!sprite(profile.sprite)) return null;
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = profile.sprite;
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      });
      return image.naturalWidth && image.naturalHeight ? image : null;
    } catch { return null; }
  })();

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas indisponível.');
  const safeInt = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function drawSheet(ctx, paint, finalHeight) {
    ctx.textBaseline = 'top';
    function fill(color, x, y, w, h) {
      if (!paint) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
    function type(text, x, y, font, color = ink) {
      if (!paint) return;
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(title(text), x, y);
    }
    function wrap(text, font, width) {
      ctx.font = font;
      const lines = [];
      const blocks = title(text).replace(/\r/g, '').split('\n');
      for (const block of blocks) {
        if (!block.trim()) { lines.push(''); continue; }
        let line = '';
        for (const word of block.trim().split(/\s+/)) {
          const tryLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(tryLine).width <= width) { line = tryLine; continue; }
          if (line) { lines.push(line); line = ''; }
          let segment = '';
          for (const char of Array.from(word)) {
            if (segment && ctx.measureText(segment + char).width > width) {
              lines.push(segment);
              segment = char;
            } else segment += char;
          }
          line = segment;
        }
        if (line) lines.push(line);
      }
      return lines;
    }
    function lines(text, x, y, width, font, color, lineHeight) {
      const pieces = wrap(text, font, width);
      for (const piece of pieces) {
        type(piece, x, y, font, color);
        y += lineHeight;
      }
      return y;
    }
    function heading(text, x, y, width) {
      fill(accent, x, y, 8, 57);
      fill('rgba(38,51,58,.08)', x + 8, y, width - 8, 57);
      type(text, x + 24, y + 7, `bold 42px ${fontLabel}`, ink);
      return y + 90;
    }
    function thinLine(x, y, width) { fill('rgba(38,51,58,.13)', x, y, width, 2); }
    function descriptor(name, description, x, y, width, prefix = '') {
      const blockName = prefix ? `${name}   ${prefix}` : name;
      y = lines(blockName, x + 8, y, width - 16, `bold 37px ${fontBody}`, ink, 45);
      if (description) {
        y += 11;
        y = lines(description, x + 8, y, width - 16, `32px ${fontBody}`, muted, 40);
      }
      y += 23;
      thinLine(x, y, width);
      return y + 24;
    }

    if (paint) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, WIDTH, finalHeight);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 17, finalHeight);
      ctx.fillRect(PAD, 74, WIDTH - PAD * 2, 5);
      const bg = ctx.createLinearGradient(0, 0, WIDTH, headerBottom);
      bg.addColorStop(0, '#f7f6f1');
      bg.addColorStop(1, '#e4e9e5');
      ctx.fillStyle = bg;
      ctx.fillRect(17, 80, WIDTH - 17, headerBottom - 85);
      if (art) {
        const artX = 1250, artY = 79, artW = WIDTH - artX - 58, artH = headerBottom - 80;
        const frame = spriteFrame(profile.spriteTransform);
        // Match the web sprite frame: 117% width, 124% height, cover and top-biased crop.
        const frameW = artW * 1.17;
        const frameH = artH * 1.24;
        const cover = Math.max(frameW / art.naturalWidth, frameH / art.naturalHeight);
        const imageW = art.naturalWidth * cover;
        const imageH = art.naturalHeight * cover;
        const zoom = frame.size / 100;
        const offsetX = (-0.06 + frame.x / 100) * frameW;
        const offsetY = (-0.03 + frame.y / 100) * frameH;
        const imageX = artX + offsetX + frameW / 2 + zoom * ((frameW - imageW) / 2 - frameW / 2);
        const imageY = artY + offsetY + frameH / 2 + zoom * ((frameH - imageH) * 0.12 - frameH / 2);
        ctx.save();
        ctx.beginPath(); ctx.rect(artX, artY, artW, artH); ctx.clip();
        ctx.drawImage(art, imageX, imageY, imageW * zoom, imageH * zoom);
        ctx.restore();
        const fade = ctx.createLinearGradient(artX - 60, 0, artX + 560, 0);
        fade.addColorStop(0, paper);
        fade.addColorStop(1, 'rgba(247,246,241,0)');
        ctx.fillStyle = fade;
        ctx.fillRect(artX - 60, artY, 620, artH);
      }
      fill(accent, PAD, headerBottom, WIDTH - PAD * 2, 5);
    }
    type('ASAS DE FERRO  /  REGISTRO DE PERSONAGEM', PAD, 120, `bold 34px ${fontLabel}`, accent);
    let nameY = lines(profile.name.toUpperCase(), PAD, 212, 1120, `bold 94px ${fontTitle}`, ink, 111);
    const levelY = Math.max(415, nameY + 28);
    type(`NÍVEL ${safeInt(profile.level)}`, PAD, levelY, `bold 45px ${fontLabel}`, accent);
    const resourceY = levelY + 134;
    const resourceWidth = 314;
    [['hp', 'PV MÁX.'], ['mp', 'PM MÁX.'], ['ip', 'PI MÁX.']].forEach(([key, label], index) => {
      const x = PAD + index * (resourceWidth + 38);
      fill('rgba(255,255,255,.44)', x, resourceY, resourceWidth, 178);
      fill(accent, x, resourceY, resourceWidth, 6);
      type(label, x + 20, resourceY + 22, `bold 30px ${fontLabel}`, muted);
      type(safeInt(profile.resources[key]?.max), x + 20, resourceY + 67, `bold 79px ${fontLabel}`, ink);
    });

    let left = headerBottom + 75;
    let right = left;
    const rightX = PAD + COL + GAP;
    left = heading(`CLASSES  /  NÍVEL ${safeInt(profile.level)}`, PAD, left, COL);
    if (profile.classes.length) {
      for (const cls of profile.classes) {
        left = descriptor(cls.name, '', PAD, left, COL, `NV ${safeInt(cls.level)}`);
      }
    } else left = descriptor('Nenhuma classe registrada', '', PAD, left, COL);
    left += 35;
    left = heading('ATRIBUTOS', PAD, left, COL);
    const aWidth = (COL - 24) / 2;
    Object.entries(statLabels).forEach(([key,label], index) => {
      const x = PAD + (index % 2) * (aWidth + 24);
      const y = left + Math.floor(index / 2) * 125;
      fill('rgba(75,98,95,.055)', x, y, aWidth, 111);
      type(label, x + 15, y + 10, `bold 29px ${fontLabel}`, muted);
      type(`d${safeInt(profile.attributes[key]?.value)}`, x + 15, y + 49, `bold 51px ${fontLabel}`, ink);
    });
    left += 290;
    right = heading('AFINIDADES', rightX, right, COL);
    const affW = (COL - 36) / 3;
    Object.entries(affinityLabels).forEach(([key,label],index) => {
      const x = rightX + (index % 3) * (affW + 18);
      const y = right + Math.floor(index / 3) * 111;
      fill('rgba(75,98,95,.045)', x, y, affW, 99);
      type(label, x + 10, y + 8, `bold 29px ${fontLabel}`, muted);
      const value = safeInt(profile.affinities[key]?.value);
      const description = affinityText(value);
      const pieces = wrap(description, `bold 29px ${fontBody}`, affW - 20);
      pieces.forEach((piece,i) => type(piece, x + 10, y + 47 + 28 * i, `bold 29px ${fontBody}`, value < 0 ? '#a4423b' : ink));
    });
    right += 375;
    right = heading('PECULIARIDADES', rightX, right, COL);
    if (profile.peculiarities.length) {
      for (const item of profile.peculiarities) {
        right = descriptor(item.name, item.description || '', rightX, right, COL);
      }
    } else right = descriptor('Nenhuma peculiaridade registrada', '', rightX, right, COL);

    const skillStart = Math.max(left, right) + 82;
    let leftSkillY = heading('HABILIDADES', PAD, skillStart, COL);
    let rightSkillY = skillStart + 90;
    const groups = skillGroups(profile);
    for (const group of groups) {
      const x = leftSkillY <= rightSkillY ? PAD : rightX;
      const start = x === PAD ? leftSkillY : rightSkillY;
      let next = start;
      next = lines(group.name.toUpperCase(), x + 4, next, COL - 8, `bold 37px ${fontLabel}`, accent, 47) + 23;
      if (!group.skills.length) next = descriptor('Nenhuma habilidade registrada', '', x, next, COL);
      for (const skill of group.skills) {
        next = descriptor(skill.name, skill.description, x, next, COL, `NV ${safeInt(skill.level)}`);
      }
      next += 36;
      if (x === PAD) leftSkillY = next;
      else rightSkillY = next;
    }
    const bottom = Math.max(leftSkillY, rightSkillY, skillStart + 70);
    if (paint) {
      thinLine(PAD, bottom + 40, WIDTH - PAD * 2);
      type('ASAS DE FERRO', PAD, finalHeight - 118, `bold 36px ${fontLabel}`, accent);
      type('FICHA DE PERSONAGEM', WIDTH - PAD - 470, finalHeight - 115, `bold 31px ${fontLabel}`, muted);
    }
    return bottom + 190;
  }

  const measured = drawSheet(measure, false, 0);
  const height = Math.max(3508, Math.ceil(measured / 20) * 20);
  if (height > 27000) throw new Error('Ficha muito extensa para exportar como PNG único neste navegador.');
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  drawSheet(ctx, true, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Não foi possível exportar a imagem.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `asas-de-ferro-${profile.slug}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 1;
}

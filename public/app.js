const app = document.querySelector('#app');
const state = {
  isAdmin: false,
  entries: [],
  current: null,
  search: '',
  tag: '',
  settings: { siteName: 'Asas de Ferro', tagline: 'Um mundo entre os céus', description: 'Explore Asas de Ferro', shareTitle: '', shareDescription: '', siteUrl: '', themeColor: '#101b27', assets: { logo: 0, background: 0, icon: 0, social: 0, 'background-codex': 0, 'background-characters': 0, 'background-world': 0, 'background-admin': 0 }, backgroundEffects: {}, particleLayers: [] },
  tagCatalog: [],
};

const knowledgeLevels = [
  ['general', 'Conhecimento Geral'],
  ['specific', 'Conhecimento Específico'],
  ['professional', 'Conhecimento Profissional'],
];

const menuOptions = [
  { name: 'CÓDICE', url: '/codice' },
  { name: 'PERSONAGENS', url: null },
  { name: 'MUNDO', url: null },
  { name: 'ADMINISTRAÇÃO', url: '/admin' },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

function renderInline(raw) {
  let output = escapeHtml(raw);
  output = output.replace(/\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|([^\]]+))?\]\]/gi, (_, slug, label) =>
    `<a href="/codice/${slug.toLowerCase()}" data-nav>${label || slug}</a>`);
  output = output.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label, href) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return output;
}

function renderMarkdown(value) {
  return String(value || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(Boolean).map(block => {
    const text = block.trim();
    const heading = text.match(/^(#{1,4})\s+([^\n]+)$/);
    if (heading) {
      const depth = Math.min(heading[1].length + 2, 4);
      return `<h${depth}>${renderInline(heading[2])}</h${depth}>`;
    }
    const lines = text.split('\n');
    if (lines.every(line => /^[-*] /.test(line))) {
      return `<ul>${lines.map(line => `<li>${renderInline(line.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map(renderInline).join(' ')}</p>`;
  }).join('');
}

function addAutomaticLinks(container, currentSlug) {
  if (!container || !state.entries.length) return;
  const candidates = state.entries.flatMap(item => [item.title, ...(item.aliases || [])]
    .filter(label => label && label !== '???' && label.length >= 3)
    .map(label => ({ label, slug: item.slug })))
    .filter(item => item.slug !== currentSlug)
    .sort((a, b) => b.label.length - a.label.length);
  const names = new Map();
  for (const item of candidates) {
    const key = item.label.toLocaleLowerCase('pt-BR');
    if (!names.has(key)) names.set(key, item);
  }
  if (!names.size) return;
  const escaped = [...names.values()].map(item => item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement?.closest('a, code, pre, button, textarea')) nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    let match;
    let last = 0;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(text))) {
      fragment.append(document.createTextNode(text.slice(last, match.index)));
      const link = document.createElement('a');
      link.href = `/codice/${names.get(match[1].toLocaleLowerCase('pt-BR')).slug}`;
      link.textContent = match[1];
      link.dataset.nav = '';
      fragment.append(link);
      last = match.index + match[0].length;
    }
    if (last) {
      fragment.append(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    }
  }
}

async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.method && options.method !== 'GET') headers['x-codex-request'] = '1';
  if (options.body) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/${path}`, { ...options, headers, credentials: 'same-origin' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Erro HTTP ${response.status}`);
  return json;
}

async function loadIndex() {
  state.entries = (await api('codices')).entries;
}

function notice(message, error = false) {
  const node = document.querySelector('#notice');
  if (!node) return;
  node.textContent = message;
  node.className = `notice ${error ? 'error' : 'success'}`;
}

async function siteRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (options.method && options.method !== 'GET') headers['x-codex-request'] = '1';
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

function applySiteIdentity() {
  const s = state.settings;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.themeColor);
  const existing = document.querySelector('link[rel="icon"]');
  if (s.assets.icon) {
    const icon = existing || document.createElement('link');
    icon.rel = 'icon';
    icon.href = `/site-media/icon?v=${s.assets.icon}`;
    if (!existing) document.head.append(icon);
  } else existing?.remove();
}

function navigate(path) {
  if (location.pathname + location.search !== path) history.pushState({}, '', path);
  window.scrollTo({ top: 0, behavior: 'instant' });
  route();
}

const sceneLabels = {
  home: 'Menu principal', codex: 'Códice', characters: 'Personagens',
  world: 'Mundo', admin: 'Administração',
};
const sceneAssetKinds = {
  home: 'background', codex: 'background-codex', characters: 'background-characters',
  world: 'background-world', admin: 'background-admin',
};
const movementVectors = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  'up-left': [-.707, -.707], 'up-right': [.707, -.707],
  'down-left': [-.707, .707], 'down-right': [.707, .707],
};
const particleDirections = [
  ['up', 'Para cima'], ['down', 'Para baixo'], ['left', 'Para a esquerda'],
  ['right', 'Para a direita'], ['up-left', 'Diagonal superior esquerda'],
  ['up-right', 'Diagonal superior direita'], ['down-left', 'Diagonal inferior esquerda'],
  ['down-right', 'Diagonal inferior direita'],
];

function sceneForPath(pathname) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/codice')) return 'codex';
  if (pathname.startsWith('/admin')) return 'admin';
  return pathname.startsWith('/personagens') ? 'characters' : 'world';
}

function drawSceneEffectsAfterSettings() {
  document.querySelector('.fx-particles')?.remove();
  drawSceneEffects();
}

function drawSceneEffects() {
  const scene = sceneForPath(location.pathname);
  const container = document.querySelector('.title-screen, .scene');
  if (!container) return;
  const config = state.settings;
  const assetKind = sceneAssetKinds[scene];
  const version = config.assets?.[assetKind];
  const image = version ? `url("/site-media/${assetKind}?v=${version}")` : 'none';
  const intensity = config.backgroundEffects?.[scene] || { overlay: 48, vignette: 55 };
  container.style.setProperty('--scene-bg', image);
  container.style.setProperty('--overlay-opacity', String(intensity.overlay / 100));
  container.style.setProperty('--vignette-opacity', String(intensity.vignette / 100));
  const layer = document.createElement('div');
  layer.className = 'fx-particles';
  layer.setAttribute('aria-hidden', 'true');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let remaining = reduced ? 20 : 180;
  for (const preset of config.particleLayers || []) {
    if (!preset.enabled || (preset.page !== 'all' && preset.page !== scene)) continue;
    const vector = movementVectors[preset.direction] || [0, -1];
    const count = Math.min(preset.count, remaining);
    remaining -= count;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'fx-particle';
      dot.style.cssText = [
        `left:${Math.random() * 100}%`, `top:${Math.random() * 100}%`,
        `--dot-color:${preset.color}`, `--dot-opacity:${preset.opacity}`,
        `--dot-size:${preset.size}px`,
        `--dx:${Math.round(vector[0] * Math.min(window.innerWidth, 1300) * (.3 + Math.random() * .35))}px`,
        `--dy:${Math.round(vector[1] * Math.min(window.innerHeight, 1000) * (.3 + Math.random() * .35))}px`,
        `--dot-duration:${(preset.speed * (.8 + Math.random() * .4)).toFixed(2)}s`,
        `--dot-delay:${(-Math.random() * preset.speed).toFixed(2)}s`,
      ].join(';');
      layer.append(dot);
    }
    if (remaining <= 0) break;
  }
  container.prepend(layer);
}

function renderHome() {
  state.current = null;
  document.body.className = 'on-title-screen';
  const settings = state.settings;
  const logo = settings.assets.logo
    ? `<h1 class="sr-only">${escapeHtml(settings.siteName)}</h1><img class="title-logo-image" draggable="false" src="/site-media/logo?v=${settings.assets.logo}" alt="${escapeHtml(settings.siteName)}">`
    : `<h1 class="title-logo-text" id="screen-title">${escapeHtml(settings.siteName)}</h1>`;
  app.innerHTML = `<section class="title-screen" aria-label="Menu principal de Asas de Ferro">
    <div class="sky-lights" aria-hidden="true"><div class="light-ring"></div><div class="horizon-line"></div></div>
    <div class="title-content">
      <div class="title-header">
        <div class="title-logo">${logo}</div>
        <div class="title-mark"><span></span><i></i><span></span></div>
        <p class="title-tagline">${escapeHtml(settings.tagline)}</p>
      </div>
      <nav class="title-menu" aria-label="Menu principal">
        ${menuOptions.map((item, index) => {
          const inner = `<span class="menu-selection-light" aria-hidden="true"></span>
            <span class="menu-waves" aria-hidden="true"><i></i><i></i></span>
            <span class="menu-glyph" aria-hidden="true">✦</span>
            <span class="menu-label">${item.name}</span>`;
          return item.url
            ? `<a href="${item.url}" class="title-menu-item ${index === 0 ? 'is-selected' : ''}" data-nav data-menu-index="${index}">${inner}</a>`
            : `<button type="button" class="title-menu-item is-unavailable" aria-disabled="true" data-menu-index="${index}">${inner}</button>`;
        }).join('')}
      </nav>
    </div>
  </section>`;
  const items = [...document.querySelectorAll('.title-menu-item')];
  let active = 0;
  const selectItem = index => {
    active = index;
    items.forEach((element, i) => element.classList.toggle('is-selected', i === active));
  };
  items.forEach((item, index) => {
    item.addEventListener('pointerenter', () => selectItem(index));
    item.addEventListener('focus', () => selectItem(index));
    item.addEventListener('click', () => selectItem(index));
  });
}

function tagOptions() {
  return [...new Set(state.entries.flatMap(item => item.tags || []))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function filteredEntries() {
  const search = state.search.toLocaleLowerCase('pt-BR');
  return state.entries.filter(item => {
    const metadata = [item.title, item.category, item.summary, ...(item.tags || []), ...(item.aliases || [])]
      .join(' ').toLocaleLowerCase('pt-BR');
    return metadata.includes(search) && (!state.tag || item.tags?.includes(state.tag));
  });
}

function entryList(selectedSlug) {
  const entries = filteredEntries();
  return entries.length ? entries.map(item => `<li><a data-nav href="/codice/${item.slug}" ${item.slug === selectedSlug ? 'aria-current="page"' : ''}>
    <span class="item-title">${escapeHtml(item.title)}</span><small>${escapeHtml(item.category)}</small></a></li>`).join('')
    : '<li class="list-empty">Nenhum verbete encontrado.</li>';
}

function sidebar(selectedSlug) {
  return `<aside class="sidebar" aria-label="Índice do Códice">
    <div class="sidebar-title"><span>ÍNDICE DO MUNDO</span><small>AD / 01</small></div>
    <label for="search">PESQUISAR</label>
    <input id="search" type="search" value="${escapeHtml(state.search)}" placeholder="Ilha, nação, palavra-chave…" autocomplete="off">
    <label for="tag-filter">FILTRAR POR MARCADOR</label>
    <select id="tag-filter"><option value="">Todos os marcadores</option>
      ${tagOptions().map(tag => `<option value="${escapeHtml(tag)}" ${state.tag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}</select>
    <div class="sidebar-count"><span>VERBETES</span><span id="entry-count">${filteredEntries().length.toString().padStart(2, '0')}</span></div>
    <ul class="entry-list" id="entry-list">${entryList(selectedSlug)}</ul>
  </aside>`;
}

function bindSidebar(selectedSlug) {
  document.querySelector('#search')?.addEventListener('input', event => {
    state.search = event.target.value;
    document.querySelector('#entry-list').innerHTML = entryList(selectedSlug);
    document.querySelector('#entry-count').textContent = filteredEntries().length.toString().padStart(2, '0');
  });
  document.querySelector('#tag-filter')?.addEventListener('change', event => {
    state.tag = event.target.value;
    document.querySelector('#entry-list').innerHTML = entryList(selectedSlug);
    document.querySelector('#entry-count').textContent = filteredEntries().length.toString().padStart(2, '0');
  });
}

async function renderCodex(slug) {
  if (!state.entries.length) await loadIndex();
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  let item = null;
  if (slug) {
    try { item = (await api(`codices/${slug}${preview ? '?preview=1' : ''}`)).entry; }
    catch (error) {
      app.innerHTML = `<div class="scene inner-scene"><div class="inner-page error-screen"><h1>Verbete indisponível</h1><p>${escapeHtml(error.message)}</p><a data-nav href="/codice">Voltar ao Códice</a></div></div>`;
      return;
    }
  }
  state.current = item;
  const article = item ? `<article class="reader">
    <h2 class="article-title">${escapeHtml(item.title)}</h2>
    <p class="metadata">${escapeHtml(item.category)}</p>
    <div class="tags">${item.tags.map(tag => `<button type="button" class="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
    ${item.summary ? `<p class="reader-summary">${escapeHtml(item.summary)}</p>` : ''}
    ${state.isAdmin ? `<div class="reader-actions">
      <button type="button" class="ui-button" id="edit-codex">EDITAR VERBETE</button>
      <button type="button" class="ui-button secondary" id="preview-codex">${preview ? 'VISÃO DO MESTRE' : 'PRÉVIA DO VISITANTE'}</button>
    </div>` : ''}
    ${preview && state.isAdmin ? '<p class="small faint">Exibindo os níveis de conhecimento acessíveis aos visitantes.</p>' : ''}
    ${knowledgeLevels.map(([key, title], index) => `<section class="knowledge-section" data-knowledge="${key}" aria-label="${title}">
      <h2><span>${String(index + 1).padStart(2, '0')}</span> ${title}</h2>
      ${item.content[key] === null
        ? `<div class="censored"><strong>???</strong><p>Conhecimento ainda não disponível.</p></div>`
        : `<div class="codex-body">${renderMarkdown(item.content[key]) || '<p class="small">Sem informações registradas.</p>'}</div>`}
    </section>`).join('')}
  </article>` : `<div class="empty-state"><span class="empty-index">ARQUIVO / NAVEGAÇÃO</span>
    <h2>Explore o Códice.</h2><p>Selecione uma localidade no índice para conhecer as histórias que atravessam os céus.</p></div>`;
  app.innerHTML = `<div class="scene reader-scene"><div class="inner-page">
    ${adminBack()}
    <div class="page-heading"><div><h1>Códice</h1><p>Fragmentos de história. Conhecimento a descobrir.</p></div><div class="page-counter">REGISTROS / ${state.entries.length.toString().padStart(2, '0')}</div></div>
    <div class="codex-layout">${sidebar(slug)}${article}</div>
  </div></div>`;
  bindSidebar(slug);
  document.querySelectorAll('.codex-body').forEach(section => addAutomaticLinks(section, slug));
  document.querySelector('#edit-codex')?.addEventListener('click', () => navigate(`/admin/codice/editar/${slug}`));
  document.querySelector('#preview-codex')?.addEventListener('click', () => navigate(`/codice/${slug}${preview ? '' : '?preview=1'}`));
}

function renderLogin() {
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">${adminBack()}<div class="login-wrap">
    <section class="login"><div class="eyebrow">ACESSO RESTRITO</div>
      <h1>Área do Mestre</h1><p>Gerencie os conhecimentos do mundo usando sua conta de administrador.</p>
      <form id="login-form">
        <label for="username">USUÁRIO</label><input id="username" name="username" required autocomplete="username" value="admin">
        <label for="password">SENHA</label><input id="password" name="password" type="password" required autocomplete="current-password">
        <button type="submit" class="ui-button">ENTRAR NO SISTEMA</button>
      </form><p id="notice" class="notice" role="status"></p>
    </section>
  </div></div></div>`;
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('login', { method: 'POST', body: JSON.stringify({
        username: document.querySelector('#username').value,
        password: document.querySelector('#password').value,
      }) });
      state.isAdmin = true;
      state.entries = [];
      await route();
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
}

function freshEntry() {
  return {
    slug: '', title: '', category: 'Geral', summary: '', tags: [], aliases: [], publicLevel: 0,
    content: { general: '', specific: '', professional: '' },
  };
}

function adminBack(label = 'MENU PRINCIPAL', destination = '/') {
  return `<a href="${destination}" data-nav class="return-link"><span aria-hidden="true">←</span> ${label}</a>`;
}

async function logout() {
  try {
    await api('logout', { method: 'POST' });
    state.isAdmin = false;
    state.entries = [];
    state.search = '';
    state.tag = '';
    navigate('/');
  } catch (error) { notice(error.message, true); }
}

function renderDashboard() {
  app.innerHTML = `<div class="scene inner-scene dashboard-scene">
    <div class="subtle-particles" aria-hidden="true"></div>
    <div class="inner-page">
      ${adminBack()}
      <div class="panel-heading"><span class="overline">PAINEL DO MESTRE</span><h1>Administração</h1>
        <p>Escolha o que deseja gerenciar.</p></div>
      <div class="dashboard-grid">
        <a class="dashboard-option" data-nav href="/admin/codice"><span class="option-number">01 / ARQUIVOS</span>
          <strong>Códice</strong><span>Crie, organize e edite os registros do mundo.</span><small>GERENCIAR VERBETES　→</small></a>
        <a class="dashboard-option" data-nav href="/admin/site"><span class="option-number">02 / CONFIGURAÇÕES</span>
          <strong>Identidade do site</strong><span>Nome, logo, ícone, fundo e prévias de compartilhamento.</span><small>PERSONALIZAR　→</small></a>
        <a class="dashboard-option" data-nav href="/admin/tags"><span class="option-number">03 / ORGANIZAÇÃO</span>
          <strong>Marcadores</strong><span>Crie, renomeie e remova marcadores dos verbetes.</span><small>GERENCIAR MARCADORES　→</small></a>
        <button class="dashboard-option dashboard-logout" id="logout" type="button"><span class="option-number">04 / SESSÃO</span>
          <strong>Encerrar sessão</strong><span>Desconectar a conta de administrador.</span><small>SAIR　→</small></button>
      </div>
      <p class="notice" id="notice" role="status"></p>
    </div>
  </div>`;
  document.querySelector('#logout').addEventListener('click', logout);
}

async function renderAdminCodices() {
  if (!state.entries.length) await loadIndex();
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">
    ${adminBack('PAINEL DO MESTRE', '/admin')}
    <div class="panel-heading"><span class="overline">ADMINISTRAÇÃO / ARQUIVOS</span><h1>Gerenciar Códice</h1></div>
    <div class="admin-list-head"><p>Selecione um verbete ou crie um novo registro.</p>
      <div class="admin-list-actions"><a class="ui-button secondary" href="/admin/tags" data-nav>MARCADORES</a><a class="ui-button" href="/admin/codice/novo" data-nav>NOVO VERBETE</a></div></div>
    <div class="admin-entry-list">${state.entries.map(item => `<a href="/admin/codice/editar/${item.slug}" data-nav>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span>
      <span>EDITAR　→</span></a>`).join('') || '<p>Nenhum registro encontrado.</p>'}</div>
  </div></div>`;
}

async function renderEditor(editSlug = null) {
  let item = freshEntry();
  if (editSlug) {
    try { item = (await api(`codices/${editSlug}`)).entry; }
    catch (error) { app.innerHTML = `<div class="inner-page error-screen"><p>${escapeHtml(error.message)}</p>${adminBack('VOLTAR', '/admin/codice')}</div>`; return; }
  }
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">
    ${adminBack('GERENCIAR CÓDICE', '/admin/codice')}
    <section class="editor">
      <div class="panel-heading"><span class="overline">EDITOR DE CONHECIMENTO</span><h1>${editSlug ? `Editar: ${escapeHtml(item.title)}` : 'Novo verbete'}</h1>
        <p>Defina o que os jogadores podem descobrir.</p></div>
      <form id="codex-form">
        <div class="editor-grid">
          <div><label for="title">TÍTULO</label><input id="title" required maxlength="120" value="${escapeHtml(item.title)}"></div>
          <div><label for="slug">IDENTIFICADOR DA URL</label><input id="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="72" value="${escapeHtml(item.slug)}" ${editSlug ? 'readonly' : ''}></div>
          <div><label for="category">CATEGORIA</label><input id="category" maxlength="80" required value="${escapeHtml(item.category)}"></div>
          <div><label for="public-level">CONHECIMENTO PÚBLICO ATÉ</label><select id="public-level">
            <option value="-1" ${item.publicLevel === -1 ? 'selected' : ''}>Nenhum / nome oculto (???)</option>
            ${knowledgeLevels.map(([key, label], index) => `<option value="${index}" ${item.publicLevel === index ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label for="tags">MARCADORES <span class="hint">(separados por vírgula)</span></label><input id="tags" value="${escapeHtml(item.tags.join(', '))}"></div>
          <div><label for="aliases">OUTROS NOMES <span class="hint">(links automáticos)</span></label><input id="aliases" value="${escapeHtml(item.aliases.join(', '))}"></div>
        </div>
        <label for="summary">RESUMO PÚBLICO OPCIONAL</label>
        <textarea id="summary" rows="3" maxlength="1000">${escapeHtml(item.summary)}</textarea>
        <p class="hint">Escolha “Nenhum” para ocultar também o nome, o resumo e os marcadores dos visitantes. Níveis acima do escolhido são censurados. Para ocultar um trecho específico, use {{secret}}texto{{/secret}}.</p>
        <div class="editor-content">
          ${knowledgeLevels.map(([key, label]) => `<label for="content-${key}">${label.toUpperCase()} <span class="hint">(Markdown e [[identificador|texto]])</span></label>
            <textarea id="content-${key}" spellcheck="true">${escapeHtml(item.content[key])}</textarea>`).join('')}
        </div>
        <div class="editor-actions"><button type="submit" class="ui-button">${editSlug ? 'SALVAR ALTERAÇÕES' : 'CRIAR VERBETE'}</button>
          <button type="button" id="view-entry" class="ui-button secondary" ${editSlug ? '' : 'disabled'}>VISUALIZAR</button>
          ${editSlug ? '<button type="button" class="ui-button danger" id="delete-entry">EXCLUIR VERBETE</button>' : ''}
        </div>
      </form><p id="notice" class="notice" role="status"></p>
    </section></div></div>`;
  let slugTouched = Boolean(editSlug);
  document.querySelector('#slug').addEventListener('input', () => { slugTouched = true; });
  document.querySelector('#title').addEventListener('input', event => {
    if (!slugTouched) document.querySelector('#slug').value = slugify(event.target.value);
  });
  document.querySelector('#view-entry')?.addEventListener('click', () => navigate(`/codice/${editSlug}`));
  document.querySelector('#delete-entry')?.addEventListener('click', async () => {
    if (!confirm(`Excluir o verbete "${item.title}"?`)) return;
    try { await api(`codices/${editSlug}`, { method: 'DELETE' }); await loadIndex(); navigate('/admin/codice'); }
    catch (error) { notice(error.message, true); }
  });
  document.querySelector('#codex-form').addEventListener('submit', async event => {
    event.preventDefault();
    const value = id => document.getElementById(id).value;
    const list = text => text.split(',').map(part => part.trim()).filter(Boolean);
    const payload = {
      title: value('title').trim(), slug: value('slug').trim(), category: value('category').trim(),
      summary: value('summary'), tags: list(value('tags')), aliases: list(value('aliases')),
      publicLevel: Number(value('public-level')),
      content: Object.fromEntries(knowledgeLevels.map(([key]) => [key, value(`content-${key}`)])),
    };
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api(editSlug ? `codices/${editSlug}` : 'codices', { method: editSlug ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      await loadIndex();
      if (!editSlug) { navigate(`/admin/codice/editar/${payload.slug}`); notice('Verbete criado com sucesso.'); }
      else notice('Alterações salvas com sucesso.');
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
}

async function renderTagManager() {
  const data = await api('tags');
  state.tagCatalog = data.tags;
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page tags-manager">
    ${adminBack('PAINEL DO MESTRE', '/admin')}
    <div class="panel-heading"><span class="overline">ADMINISTRAÇÃO / ORGANIZAÇÃO</span>
      <h1>Marcadores</h1><p>Renomeie ou remova um marcador em todos os verbetes que o utilizam.</p></div>
    <section class="settings-panel">
      <form id="create-tag" class="tag-create-row">
        <div><label for="new-tag">NOVO MARCADOR</label><input id="new-tag" maxlength="50" required placeholder="Ex.: Impérios"></div>
        <button class="ui-button" type="submit">CRIAR MARCADOR</button>
      </form>
      <div class="tag-manager-list">${data.tags.map((tag, index) => `<div class="tag-manager-row" data-tag-index="${index}">
        <label for="managed-tag-${index}">${escapeHtml(tag)}</label>
        <input id="managed-tag-${index}" value="${escapeHtml(tag)}" maxlength="50" aria-label="Renomear ${escapeHtml(tag)}">
        <button type="button" class="ui-button secondary" data-tag-rename="${index}">RENOMEAR</button>
        <button type="button" class="ui-button danger" data-tag-delete="${index}">REMOVER</button>
      </div>`).join('') || '<p>Nenhum marcador registrado.</p>'}</div>
      <p class="small faint">Ao renomear ou remover, todos os verbetes associados são atualizados.</p>
      <p id="notice" class="notice" role="status"></p>
    </section>
  </div></div>`;
  document.querySelector('#create-tag').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('tags', { method: 'POST', body: JSON.stringify({ tag: document.querySelector('#new-tag').value.trim() }) });
      await loadIndex();
      await renderTagManager();
      notice('Marcador criado.');
    } catch (error) { notice(error.message, true); }
  });
  document.querySelectorAll('[data-tag-rename]').forEach(button => button.addEventListener('click', async () => {
    const index = Number(button.dataset.tagRename);
    const oldTag = data.tags[index];
    const newTag = document.querySelector(`#managed-tag-${index}`).value.trim();
    if (!newTag || newTag === oldTag) return;
    button.disabled = true;
    try {
      await api('tags', { method: 'PUT', body: JSON.stringify({ tag: oldTag, newTag }) });
      await loadIndex();
      await renderTagManager();
      notice('Marcador renomeado em todos os verbetes.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('[data-tag-delete]').forEach(button => button.addEventListener('click', async () => {
    const tag = data.tags[Number(button.dataset.tagDelete)];
    if (!confirm(`Remover o marcador "${tag}" de todos os verbetes?`)) return;
    button.disabled = true;
    try {
      await api('tags', { method: 'DELETE', body: JSON.stringify({ tag }) });
      await loadIndex();
      await renderTagManager();
      notice('Marcador removido dos verbetes.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  }));
}

function particleLayerEditor(layer, index) {
  const select = (field, options) => `<select data-particle-field="${field}">
    ${options.map(([value, label]) => `<option value="${value}" ${layer[field] === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  return `<fieldset class="particle-editor" data-particle-index="${index}"><legend>CAMADA ${index + 1}</legend>
    <div class="particle-head"><label class="particle-toggle"><input type="checkbox" data-particle-field="enabled" ${layer.enabled ? 'checked' : ''}> Ativar camada</label>
      <button type="button" class="ui-button danger" data-remove-particle="${index}">REMOVER CAMADA</button></div>
    <div class="particle-fields">
      <label>Nome <input data-particle-field="name" maxlength="50" value="${escapeHtml(layer.name)}"></label>
      <label>Exibir em ${select('page', [['all','Todas as páginas'], ...Object.entries(sceneLabels)])}</label>
      <label>Cor <input data-particle-field="color" type="color" value="${escapeHtml(layer.color)}"></label>
      <label>Direção ${select('direction', particleDirections)}</label>
      <label>Quantidade (0–80) <input data-particle-field="count" type="number" min="0" max="80" step="1" value="${layer.count}"></label>
      <label>Velocidade, duração em segundos (2–100) <input data-particle-field="speed" type="number" min="2" max="100" step="1" value="${layer.speed}"></label>
      <label>Intensidade / opacidade (0–100%) <input data-particle-field="opacity" type="range" min="0" max="100" step="1" value="${Math.round(layer.opacity * 100)}"><output>${Math.round(layer.opacity * 100)}%</output></label>
      <label>Tamanho (1–12px) <input data-particle-field="size" type="number" min="1" max="12" step="1" value="${layer.size}"></label>
    </div>
  </fieldset>`;
}

function assetField(kind, title, description, accept) {
  const version = state.settings.assets[kind];
  const path = `/site-media/${kind}?v=${version}`;
  return `<div class="asset-field"><div class="asset-field-info"><strong>${title}</strong><p>${description}</p>
    ${version ? `<div class="uploaded-asset"><img src="${path}" draggable="false" alt="Prévia: ${title}"><span>Arquivo atual</span></div>` : '<span class="small faint">Nenhum arquivo enviado.</span>'}</div>
    <div class="asset-actions"><input id="asset-${kind}" type="file" accept="${accept}" aria-label="Arquivo para ${title}">
      <button type="button" class="ui-button secondary" data-upload="${kind}">ENVIAR ARQUIVO</button>
      ${version ? `<button type="button" class="ui-button secondary" data-remove="${kind}">REMOVER</button>` : ''}</div></div>`;
}

async function renderSiteSettings() {
  const s = state.settings;
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page settings-page">
    ${adminBack('PAINEL DO MESTRE', '/admin')}
    <div class="panel-heading"><span class="overline">ADMINISTRAÇÃO / PERSONALIZAÇÃO</span><h1>Identidade do site</h1>
      <p>Defina os nomes, imagens e informações exibidas ao compartilhar um link.</p></div>
    <section class="settings-panel">
      <form id="site-form">
        <h2>Informações gerais</h2>
        <div class="editor-grid">
          <div><label for="siteName">NOME DO SITE</label><input id="siteName" maxlength="90" required value="${escapeHtml(s.siteName)}"></div>
          <div><label for="tagline">SUBTÍTULO DO MENU PRINCIPAL</label><input id="tagline" maxlength="160" value="${escapeHtml(s.tagline)}"></div>
        </div>
        <label for="description">DESCRIÇÃO DO SITE</label><textarea id="description" maxlength="320" rows="3" required>${escapeHtml(s.description)}</textarea>
        <h2>Prévia do link</h2>
        <div class="editor-grid">
          <div><label for="shareTitle">TÍTULO PARA COMPARTILHAMENTO <span class="hint">(opcional)</span></label><input id="shareTitle" maxlength="140" value="${escapeHtml(s.shareTitle)}"></div>
          <div><label for="siteUrl">DOMÍNIO DO SITE <span class="hint">(opcional, HTTPS)</span></label><input id="siteUrl" type="url" placeholder="https://seusite.com" maxlength="300" value="${escapeHtml(s.siteUrl)}"></div>
        </div>
        <label for="shareDescription">DESCRIÇÃO DO LINK <span class="hint">(opcional)</span></label>
        <textarea id="shareDescription" maxlength="320" rows="3">${escapeHtml(s.shareDescription)}</textarea>
        <div class="editor-grid"><div><label for="themeColor">COR DO NAVEGADOR</label><input id="themeColor" type="color" value="${escapeHtml(s.themeColor)}"></div></div>
        <h2>Fundos por página</h2>
        <p class="small faint">O escurecimento e a vinheta são independentes em cada tela. 0% = nenhum escurecimento; 100% = máximo.</p>
        <div class="background-controls">${Object.entries(sceneLabels).map(([key, label]) => {
          const fx = s.backgroundEffects?.[key] || { overlay: 45, vignette: 55 };
          return `<fieldset class="background-control"><legend>${label}</legend>
            <label for="overlay-${key}">Escurecimento: <output>${fx.overlay}%</output></label>
            <input id="overlay-${key}" type="range" min="0" max="100" step="1" value="${fx.overlay}">
            <label for="vignette-${key}">Vinheta: <output>${fx.vignette}%</output></label>
            <input id="vignette-${key}" type="range" min="0" max="100" step="1" value="${fx.vignette}">
          </fieldset>`;
        }).join('')}</div>
        <h2>Partículas do site</h2>
        <p class="small faint">Até 8 camadas, 180 partículas ativas ao todo. Mais segundos = movimento mais lento. A opção “Todas as páginas” também afeta o Códice e a administração.</p>
        <div id="particle-editor-list"></div>
        <button class="ui-button secondary" type="button" id="add-particle">ADICIONAR CAMADA DE PARTÍCULAS</button>
        <div class="settings-save"><button class="ui-button" type="submit">SALVAR CONFIGURAÇÕES E EFEITOS</button></div>
      </form>
      <p class="notice" id="notice" role="status"></p>
      <div class="settings-assets"><h2>Arquivos visuais</h2><p class="small">Envie seus próprios arquivos. Os formatos aceitos são PNG, JPG e WebP; o favicon também aceita ICO.</p>
        ${assetField('logo', 'Logo do menu', 'Imagem no topo da tela inicial. PNG transparente funciona melhor. Até 2 MB.', '.png,.jpg,.jpeg,.webp')}
        ${Object.entries(sceneLabels).map(([key, label]) => assetField(sceneAssetKinds[key], `Fundo: ${label}`, `Plano de fundo exclusivo para ${label.toLowerCase()}. Até 4 MB.`, '.png,.jpg,.jpeg,.webp')).join('')}
        ${assetField('icon', 'Ícone do site', 'Favicon para a aba do navegador. Recomendado 64×64 ou 128×128. Até 512 KB.', '.png,.ico')}
        ${assetField('social', 'Imagem para compartilhamento', 'Imagem de prévia para Discord, WhatsApp e redes sociais. Recomendado 1200×630. Até 4 MB.', '.png,.jpg,.jpeg,.webp')}
      </div>
      <p class="small">As prévias são geradas pelo servidor. Após alterar a identidade, verifique novamente seu link usando o domínio publicado no Netlify.</p>
    </section>
  </div></div>`;
  let draftLayers = structuredClone(s.particleLayers || []);
  const form = document.querySelector('#site-form');
  const showLayers = () => {
    document.querySelector('#particle-editor-list').innerHTML = draftLayers.map(particleLayerEditor).join('');
  };
  showLayers();
  document.querySelector('#add-particle').addEventListener('click', () => {
    if (draftLayers.length >= 8) { notice('Limite de 8 camadas alcançado.', true); return; }
    draftLayers.push({ id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Camada ${draftLayers.length + 1}`, enabled: true, page: 'all',
      color: '#B5ECDD', count: 12, speed: 22, opacity: .45, size: 2, direction: 'up' });
    showLayers();
  });
  document.querySelector('#particle-editor-list').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-particle]');
    if (!button) return;
    draftLayers.splice(Number(button.dataset.removeParticle), 1);
    showLayers();
  });
  const updateParticle = event => {
    const input = event.target.closest('[data-particle-field]');
    if (!input) return;
    const index = Number(input.closest('[data-particle-index]').dataset.particleIndex);
    const field = input.dataset.particleField;
    if (field === 'enabled') draftLayers[index][field] = input.checked;
    else if (field === 'count' || field === 'speed' || field === 'size') draftLayers[index][field] = Number(input.value);
    else if (field === 'opacity') {
      draftLayers[index][field] = Number(input.value) / 100;
      input.nextElementSibling.textContent = `${input.value}%`;
    } else draftLayers[index][field] = input.value;
  };
  document.querySelector('#particle-editor-list').addEventListener('input', updateParticle);
  document.querySelector('#particle-editor-list').addEventListener('change', updateParticle);
  document.querySelectorAll('.background-control input[type="range"]').forEach(slider => {
    slider.addEventListener('input', () => { slider.previousElementSibling.querySelector('output').textContent = `${slider.value}%`; });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const fields = ['siteName', 'tagline', 'description', 'shareTitle', 'shareDescription', 'siteUrl', 'themeColor'];
      const payload = Object.fromEntries(fields.map(id => [id, form.querySelector(`#${id}`).value]));
      payload.backgroundEffects = Object.fromEntries(Object.keys(sceneLabels).map(key => [key, {
        overlay: Number(form.querySelector(`#overlay-${key}`).value),
        vignette: Number(form.querySelector(`#vignette-${key}`).value),
      }]));
      payload.particleLayers = draftLayers;
      const result = await siteRequest('/system/site-config', { method: 'PUT', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
      state.settings = result.settings;
      applySiteIdentity();
      drawSceneEffectsAfterSettings();
      notice('Configurações salvas. Compartilhamentos antigos podem ficar em cache por algum tempo.');
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
  document.querySelectorAll('[data-upload]').forEach(button => {
    button.addEventListener('click', async () => {
      const kind = button.dataset.upload;
      const input = document.querySelector(`#asset-${kind}`);
      const file = input.files?.[0];
      if (!file) { notice('Selecione um arquivo antes de enviar.', true); return; }
      const limits = { logo: 2_000_000, icon: 512_000, social: 4_000_000 };
      if (file.size > (limits[kind] || 4_000_000)) { notice('Arquivo acima do limite.', true); return; }
      button.disabled = true;
      try {
        const result = await siteRequest(`/system/site-upload/${kind}`, {
          method: 'POST', body: await file.arrayBuffer(), headers: { 'content-type': 'application/octet-stream' },
        });
        state.settings = result.settings;
        applySiteIdentity();
        await renderSiteSettings();
        notice('Imagem enviada. Ela já está disponível no site.');
      } catch (error) { notice(error.message, true); }
      finally { button.disabled = false; }
    });
  });
  document.querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Remover esta imagem do site?')) return;
      button.disabled = true;
      try {
        const result = await siteRequest(`/system/site-upload/${button.dataset.remove}`, { method: 'DELETE' });
        state.settings = result.settings;
        applySiteIdentity();
        await renderSiteSettings();
        notice('Imagem removida.');
      } catch (error) { notice(error.message, true); }
      finally { button.disabled = false; }
    });
  });

}

async function renderAdmin(pathname) {
  if (!state.isAdmin) { renderLogin(); return; }
  if (pathname === '/admin' || pathname === '/admin/') return renderDashboard();
  if (pathname === '/admin/site') return renderSiteSettings();
  if (pathname === '/admin/tags') return renderTagManager();
  if (pathname === '/admin/codice') return renderAdminCodices();
  if (pathname === '/admin/codice/novo') return renderEditor();
  const match = /^\/admin\/codice\/editar\/([a-z0-9-]+)$/.exec(pathname);
  if (match) return renderEditor(match[1]);
  app.innerHTML = `<div class="inner-page error-screen">${adminBack()}<h1>Página não encontrada</h1></div>`;
}


let routeId = 0;
async function route() {
  const callId = ++routeId;
  const pathname = location.pathname;
  const section = pathname === '/' ? '' : pathname.startsWith('/codice') ? 'Códice' :
    pathname.startsWith('/admin') ? 'Administração' : pathname === '/mundo' ? 'Mundo' : 'Personagens';
  document.title = section ? `${section} | ${state.settings.siteName}` : state.settings.siteName;
  if (pathname !== '/') document.body.className = 'on-inner-page';
  try {
    if (pathname === '/') renderHome();
    else if (pathname === '/codice' || /^\/codice\/[a-z0-9-]+$/.test(pathname)) await renderCodex(pathname.split('/')[2] || null);
    else if (pathname === '/personagens' || pathname === '/mundo') navigate('/');
    else if (pathname.startsWith('/admin')) {
      const legacyEdit = pathname === '/admin' ? new URLSearchParams(location.search).get('edit') : null;
      if (legacyEdit && /^[a-z0-9-]+$/.test(legacyEdit) && state.isAdmin) {
        navigate(`/admin/codice/editar/${legacyEdit}`);
        return;
      }
      await renderAdmin(pathname);
    }
    else app.innerHTML = `<div class="scene inner-scene"><div class="inner-page error-screen">${adminBack()}<h1>Página não encontrada</h1></div></div>`;
  } catch (error) {
    if (callId !== routeId) return;
    app.innerHTML = `<div class="scene inner-scene"><div class="inner-page error-screen">${adminBack()}<h1>Falha ao carregar</h1><p>${escapeHtml(error.message)}</p></div></div>`;
  }
  if (callId === routeId) drawSceneEffects();
}

document.addEventListener('dragstart', event => {
  if (event.target instanceof Element && event.target.closest('img')) event.preventDefault();
});

document.addEventListener('click', event => {
  const tag = event.target.closest('[data-tag]');
  if (tag) { state.tag = tag.dataset.tag; navigate('/codice'); return; }
  const anchor = event.target.closest('a[data-nav]');
  if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  navigate(anchor.pathname + anchor.search);
});
window.addEventListener('popstate', route);

(async () => {
  const [session, info] = await Promise.allSettled([api('session'), siteRequest('/system/site-config')]);
  if (session.status === 'fulfilled') state.isAdmin = session.value.isAdmin;
  if (info.status === 'fulfilled') state.settings = info.value.settings;
  else console.warn('Site settings unavailable:', info.reason);
  applySiteIdentity();
  await route();
})();

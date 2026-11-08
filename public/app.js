const app = document.querySelector('#app');
const state = {
  isAdmin: false,
  entries: [],
  current: null,
  search: '',
  tag: '',
  settings: { siteName: 'Asas de Ferro', tagline: 'Um mundo entre os céus', description: 'Explore Asas de Ferro', shareTitle: '', shareDescription: '', siteUrl: '', themeColor: '#101b27', assets: { logo: 0, background: 0, icon: 0, social: 0, 'background-codex': 0, 'background-characters': 0, 'background-world': 0, 'background-admin': 0 }, backgroundEffects: {}, particleLayers: [] },
  tagCatalog: [],
  pages: [],
};

const knowledgeLevels = [
  ['general', 'Conhecimento Geral'],
  ['specific', 'Conhecimento Específico'],
  ['professional', 'Conhecimento Profissional'],
];

let stopMenuWave = () => {};
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

function resolveAssetUrl(kind, value) {
  return typeof value === 'string' && value.startsWith('/assets/') ? value
    : typeof value === 'number' && value > 0 ? `/site-media/${kind}?v=${value}` : '';
}
function assetUrl(kind) { return resolveAssetUrl(kind, state.settings.assets?.[kind]); }

function openAssetLibrary(onPick) {
  const dialog = document.createElement('dialog');
  dialog.className = 'asset-dialog';
  dialog.innerHTML = `<div class="asset-library"><header><h2>Biblioteca de arquivos</h2><button type="button" class="ui-button secondary" data-close>FECHAR</button></header>
    <div class="asset-library-main"><nav class="asset-folders" aria-label="Pastas da biblioteca"></nav>
      <section class="asset-thumbnails" aria-label="Imagens da pasta"></section></div></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
  const tree = dialog.querySelector('.asset-folders');
  const list = dialog.querySelector('.asset-thumbnails');
  fetch('/assets/library.json', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Biblioteca de imagens indisponível. Execute npm run assets:scan.');
    return response.json();
  }).then(data => {
    const folders = data.folders || [''];
    const files = (data.files || []).filter(file => typeof file.url === 'string' && file.url.startsWith('/assets/'));
    let selected = '';
    const draw = () => {
      tree.innerHTML = folders.map(folder => {
        const name = folder ? `${'　'.repeat(folder.split('/').length - 1)}${folder.split('/').at(-1)}` : 'Todas as pastas';
        return `<button type="button" data-folder="${escapeHtml(folder)}" class="${selected === folder ? 'active' : ''}">${escapeHtml(name)}</button>`;
      }).join('');
      const chosen = files.filter(file => !selected || file.folder === selected || file.folder.startsWith(selected + '/'));
      list.innerHTML = chosen.length ? chosen.map(file => `<button type="button" class="asset-tile" data-image="${escapeHtml(file.url)}">
        <img draggable="false" loading="lazy" src="${escapeHtml(file.url)}" alt=""><span>${escapeHtml(file.name)}</span>
        <small>${escapeHtml(file.folder || 'Pasta principal')}</small></button>`).join('')
        : '<p>Nenhuma imagem nesta pasta. Adicione arquivos em public/assets/ e aguarde o índice atualizar.</p>';
    };
    tree.addEventListener('click', event => {
      const folder = event.target.closest('[data-folder]');
      if (folder) { selected = folder.dataset.folder; draw(); }
    });
    list.addEventListener('click', event => {
      const file = event.target.closest('[data-image]');
      if (file) { onPick(file.dataset.image); dialog.close(); }
    });
    draw();
  }).catch(error => { list.textContent = error.message; });
}

function openBannerViewer(url, title) {
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  const img = document.createElement('img');
  img.src = url;
  img.alt = title;
  img.draggable = false;
  const close = document.createElement('button');
  close.className = 'ui-button secondary';
  close.type = 'button';
  close.textContent = 'FECHAR ×';
  close.addEventListener('click', () => dialog.close());
  dialog.append(close, img);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

function attachMenuWaves(items) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  const paint = now => {
    const active = items.find(item => item.classList.contains('is-selected'));
    const canvas = active?.querySelector('canvas.menu-wave-canvas');
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.floor(rect.width * pixelRatio);
        const height = Math.floor(rect.height * pixelRatio);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(pixelRatio, pixelRatio);
        ctx.globalCompositeOperation = 'screen';
        const w = rect.width, h = rect.height;
        const elapsed = reduce ? 0 : now * .00034;
        for (let index = 0; index < 23; index++) {
          const blend = index / 22;
          ctx.beginPath();
          const gradient = ctx.createLinearGradient(0, 0, w, 0);
          const alpha = (.12 + (1 - Math.abs(blend - .5) * 1.5) * .4).toFixed(3);
          gradient.addColorStop(0, 'rgba(63, 178, 197, 0)');
          gradient.addColorStop(.2, `rgba(90, 217, 226, ${alpha})`);
          gradient.addColorStop(.64, `rgba(179, 255, 232, ${alpha})`);
          gradient.addColorStop(1, 'rgba(132, 225, 237, 0)');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = index % 6 === 0 ? 1.05 : .55;
          ctx.shadowColor = 'rgba(121,250,245,.8)';
          ctx.shadowBlur = index % 6 === 0 ? 8 : 3;
          for (let x = 0; x <= w + 4; x += 4) {
            const u = x / w;
            const envelope = Math.pow(Math.sin(Math.PI * u), .9);
            const wave = Math.sin(u * Math.PI * 3 + elapsed + index * .21) * 11;
            const modulation = Math.sin(u * Math.PI * 5 - elapsed * .6 + index * .13) * 4;
            const y = h * .5 + (index - 11) * 1.35 + (wave + modulation) * envelope;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    frame = requestAnimationFrame(paint);
  };
  frame = requestAnimationFrame(paint);
  stopMenuWave = () => { cancelAnimationFrame(frame); stopMenuWave = () => {}; };
}

function applySiteIdentity() {
  const s = state.settings;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.themeColor);
  const existing = document.querySelector('link[rel="icon"]');
  if (assetUrl('icon')) {
    const icon = existing || document.createElement('link');
    icon.rel = 'icon';
    icon.href = assetUrl('icon');
    if (!existing) document.head.append(icon);
  } else existing?.remove();
}

let transitionId = 0;

function captureCurrentPage() {
  const current = app.firstElementChild;
  if (!current) return null;
  const previous = document.createElement('div');
  previous.className = 'page-outgoing';
  previous.setAttribute('aria-hidden', 'true');
  previous.inert = true;
  previous.style.top = `${-window.scrollY}px`;
  const snapshot = current.cloneNode(true);
  snapshot.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  previous.append(snapshot);
  document.body.append(previous);
  return previous;
}

async function changePage(path, push = true) {
  const version = ++transitionId;
  document.querySelectorAll('.page-outgoing').forEach(element => element.remove());
  app.classList.remove('page-arriving', 'page-initial');
  const outgoing = captureCurrentPage();
  if (push && location.pathname + location.search !== path) history.pushState({}, '', path);
  window.scrollTo({ top: 0, behavior: 'instant' });
  await route();
  if (version !== transitionId) { outgoing?.remove(); return; }
  if (!outgoing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    outgoing?.remove();
    return;
  }
  // The next page appears on top while the previous page retreats.
  void app.offsetWidth;
  app.classList.add('page-arriving');
  outgoing.classList.add('is-leaving');
  window.setTimeout(() => {
    outgoing.remove();
    if (version === transitionId) app.classList.remove('page-arriving');
  }, 490);
}
function navigate(path) { return changePage(path, true); }

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
  const image = assetUrl(assetKind) ? `url("${assetUrl(assetKind)}")` : 'none';
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
  stopMenuWave();
  const logo = assetUrl('logo')
    ? `<h1 class="sr-only">${escapeHtml(settings.siteName)}</h1><img class="title-logo-image" draggable="false" src="${escapeHtml(assetUrl('logo'))}" alt="${escapeHtml(settings.siteName)}">`
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
            <canvas class="menu-wave-canvas" aria-hidden="true"></canvas>
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
  attachMenuWaves(items);
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
  const matches = filteredEntries();
  if (!matches.length) return '<li class="list-empty">Nenhum verbete encontrado.</li>';
  const map = new Map(state.entries.map(item => [item.slug, item]));
  const included = new Set(matches.map(item => item.slug));
  for (const item of matches) {
    let parent = item.parentSlug;
    const seen = new Set([item.slug]);
    while (parent && map.has(parent) && !seen.has(parent)) {
      included.add(parent);
      seen.add(parent);
      parent = map.get(parent).parentSlug;
    }
  }
  const groups = new Map();
  for (const item of state.entries.filter(item => included.has(item.slug))) {
    const parent = included.has(item.parentSlug) && item.parentSlug !== item.slug ? item.parentSlug : '';
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(item);
  }
  const render = (parent, seen = new Set()) => (groups.get(parent) || []).map(item => {
    if (seen.has(item.slug)) return '';
    const next = new Set([...seen, item.slug]);
    const childNodes = render(item.slug, next);
    return `<li><a data-nav href="/codice/${item.slug}" ${item.slug === selectedSlug ? 'aria-current="page"' : ''}>
      <span class="item-title">${escapeHtml(item.title)}</span><small>${escapeHtml(item.category)}</small></a>
      ${childNodes ? `<ul class="entry-list children">${childNodes}</ul>` : ''}</li>`;
  }).join('');
  return render('');
}

function sidebar(selectedSlug) {
  return `<aside class="sidebar" aria-label="Índice do Códice">
    <div class="sidebar-title"><span>ÍNDICE DO MUNDO</span></div>
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
  const directChildren = item ? state.entries.filter(entry => entry.parentSlug === item.slug) : [];
  const parent = item?.parentSlug ? state.entries.find(entry => entry.slug === item.parentSlug) : null;
  const article = item ? `<article class="reader">
    ${parent ? `<a href="/codice/${parent.slug}" data-nav class="article-parent">← ${escapeHtml(parent.title)}</a>` : ''}
    <h2 class="article-title">${escapeHtml(item.title)}</h2>
    <p class="metadata">${escapeHtml(item.category)}</p>
    <div class="tags">${item.tags.map(tag => `<button type="button" class="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
    ${item.summary ? `<p class="reader-summary">${escapeHtml(item.summary)}</p>` : ''}
    ${item.banner ? `<button type="button" id="open-banner" class="codex-banner" aria-label="Ampliar imagem de ${escapeHtml(item.title)}"><img src="${escapeHtml(item.banner)}" draggable="false" alt="Banner de ${escapeHtml(item.title)}"><span>AMPLIAR IMAGEM</span></button>` : ''}
    ${state.isAdmin ? `<div class="reader-actions">
      <button type="button" class="ui-button" id="edit-codex">EDITAR VERBETE</button>
      <button type="button" class="ui-button secondary" id="preview-codex">${preview ? 'VISÃO DO MESTRE' : 'PRÉVIA DO VISITANTE'}</button>
    </div>` : ''}
    ${preview && state.isAdmin ? '<p class="small faint">Exibindo os níveis de conhecimento acessíveis aos visitantes.</p>' : ''}
    ${knowledgeLevels.map(([key, title]) => `<section class="knowledge-section" data-knowledge="${key}" aria-label="${title}">
      <h2>${title}</h2>
      ${item.content[key] === null
        ? `<div class="censored"><strong>???</strong></div>`
        : `<div class="codex-body">${renderMarkdown(item.content[key]) || '<p class="small">Sem informações registradas.</p>'}</div>`}
    </section>`).join('')}
    ${directChildren.length ? `<section class="subentries"><h3>SUBVERBETES</h3><ul>${directChildren.map(child => `<li><a data-nav href="/codice/${child.slug}">${escapeHtml(child.title)}</a></li>`).join('')}</ul></section>` : ''}
  </article>` : `<div class="empty-state" aria-label="Nenhum verbete selecionado"></div>`;
  app.innerHTML = `<div class="scene reader-scene"><div class="inner-page">
    ${adminBack()}
    <div class="page-heading"><h1>Códice</h1></div>
    <div class="codex-layout">${sidebar(slug)}${article}</div>
  </div></div>`;
  bindSidebar(slug);
  document.querySelectorAll('.codex-body').forEach(section => addAutomaticLinks(section, slug));
  document.querySelector('#open-banner')?.addEventListener('click', () => openBannerViewer(item.banner, item.title));
  document.querySelector('#edit-codex')?.addEventListener('click', () => navigate(`/admin/codice/editar/${slug}`));
  document.querySelector('#preview-codex')?.addEventListener('click', () => navigate(`/codice/${slug}${preview ? '' : '?preview=1'}`));
}

function renderLogin() {
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">${adminBack()}<div class="login-wrap">
    <section class="login"><div class="eyebrow">ACESSO RESTRITO</div>
      <h1>Área do Mestre</h1>
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
      await changePage('/admin', false);
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
}

function freshEntry() {
  return {
    slug: '', title: '', category: 'Geral', summary: '', tags: [], aliases: [], parentSlug: null, banner: '', publicLevel: 0,
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
      <div class="panel-heading"><span class="overline">PAINEL DO MESTRE</span><h1>Administração</h1></div>
      <div class="dashboard-grid">
        <a class="dashboard-option" data-nav href="/admin/codice"><strong>Códice</strong></a>
        <a class="dashboard-option" data-nav href="/admin/site"><strong>Personalização</strong></a>
        <a class="dashboard-option" data-nav href="/admin/tags"><strong>Marcadores</strong></a>
        <button class="dashboard-option dashboard-logout" id="logout" type="button"><strong>Encerrar sessão</strong></button>
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
    <div class="admin-list-head">
      <div class="admin-list-actions"><a class="ui-button secondary" href="/admin/tags" data-nav>MARCADORES</a><a class="ui-button" href="/admin/codice/novo" data-nav>NOVO VERBETE</a></div></div>
    <div class="admin-entry-list">${state.entries.map(item => `<a href="/admin/codice/editar/${item.slug}" data-nav>
      <span><strong>${item.parentSlug ? '↳ ' : ''}${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span>
      <span>EDITAR　→</span></a>`).join('') || '<p>Nenhum registro encontrado.</p>'}</div>
  </div></div>`;
}

async function renderEditor(editSlug = null) {
  if (!state.entries.length) await loadIndex();
  let item = freshEntry();
  if (editSlug) {
    try { item = (await api(`codices/${editSlug}`)).entry; }
    catch (error) { app.innerHTML = `<div class="inner-page error-screen"><p>${escapeHtml(error.message)}</p>${adminBack('VOLTAR', '/admin/codice')}</div>`; return; }
  }
  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page">
    ${adminBack('GERENCIAR CÓDICE', '/admin/codice')}
    <section class="editor">
      <div class="panel-heading"><span class="overline">EDITOR DE CONHECIMENTO</span><h1>${editSlug ? `Editar: ${escapeHtml(item.title)}` : 'Novo verbete'}</h1></div>
      <form id="codex-form">
        <div class="editor-grid">
          <div><label for="title">TÍTULO</label><input id="title" required maxlength="120" value="${escapeHtml(item.title)}"></div>
          <div><label for="slug">IDENTIFICADOR DA URL</label><input id="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="72" value="${escapeHtml(item.slug)}" ${editSlug ? 'readonly' : ''}></div>
          <div><label for="category">CATEGORIA</label><input id="category" maxlength="80" required value="${escapeHtml(item.category)}"></div>
          <div><label for="public-level">CONHECIMENTO PÚBLICO ATÉ</label><select id="public-level">
            <option value="-1" ${item.publicLevel === -1 ? 'selected' : ''}>Nenhum / nome oculto (???)</option>
            ${knowledgeLevels.map(([key, label], index) => `<option value="${index}" ${item.publicLevel === index ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div><label for="tags">MARCADORES</label><input id="tags" value="${escapeHtml(item.tags.join(', '))}"></div>
          <div><label for="aliases">OUTROS NOMES</label><input id="aliases" value="${escapeHtml(item.aliases.join(', '))}"></div>
          <div><label for="parentSlug">VERBETE PAI (SUBVERBETE)</label><select id="parentSlug"><option value="">Nenhum, verbete principal</option>
            ${state.entries.filter(e => e.slug !== editSlug).map(entry => `<option value="${entry.slug}" ${item.parentSlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.title)}</option>`).join('')}</select></div>
        </div>
        <label for="banner">BANNER DO VERBETE (OPCIONAL)</label>
        <div class="image-choice"><input id="banner" readonly placeholder="Nenhuma imagem selecionada" value="${escapeHtml(item.banner || '')}">
          <button type="button" class="ui-button secondary" id="choose-banner">BIBLIOTECA</button>
          <button type="button" class="ui-button secondary" id="clear-banner">LIMPAR</button></div>
        <label for="summary">RESUMO PÚBLICO OPCIONAL</label>
        <textarea id="summary" rows="3" maxlength="1000">${escapeHtml(item.summary)}</textarea>
        <div class="editor-content">
          ${knowledgeLevels.map(([key, label]) => `<label for="content-${key}">${label.toUpperCase()}</label>
            <textarea id="content-${key}" spellcheck="true">${escapeHtml(item.content[key])}</textarea>`).join('')}
        </div>
        <div class="editor-actions"><button type="submit" class="ui-button">${editSlug ? 'SALVAR ALTERAÇÕES' : 'CRIAR VERBETE'}</button>
          <button type="button" id="view-entry" class="ui-button secondary" ${editSlug ? '' : 'disabled'}>VISUALIZAR</button>
          ${editSlug ? '<button type="button" class="ui-button danger" id="delete-entry">EXCLUIR VERBETE</button>' : ''}
        </div>
      </form><p id="notice" class="notice" role="status"></p>
    </section></div></div>`;
  document.querySelector('#choose-banner').addEventListener('click', () => openAssetLibrary(value => { document.querySelector('#banner').value = value; }));
  document.querySelector('#clear-banner').addEventListener('click', () => { document.querySelector('#banner').value = ''; });
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
      parentSlug: value('parentSlug') || null, banner: value('banner'),
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
      <h1>Marcadores</h1></div>
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
      <label>Exibir em ${select('page', [['all','Todas as páginas'], ...((state.pages.length ? state.pages.map(page => [page.id, page.label]) : Object.entries(sceneLabels)))])}</label>
      <label>Cor <input data-particle-field="color" type="color" value="${escapeHtml(layer.color)}"></label>
      <label>Direção ${select('direction', particleDirections)}</label>
      <label>Quantidade <input data-particle-field="count" type="number" min="0" max="80" step="1" value="${layer.count}"></label>
      <label>Duração (s) <input data-particle-field="speed" type="number" min="2" max="100" step="1" value="${layer.speed}"></label>
      <label>Opacidade <input data-particle-field="opacity" type="range" min="0" max="100" step="1" value="${Math.round(layer.opacity * 100)}"><output>${Math.round(layer.opacity * 100)}%</output></label>
      <label>Tamanho <input data-particle-field="size" type="number" min="1" max="12" step="1" value="${layer.size}"></label>
    </div>
  </fieldset>`;
}

function assetField(kind, title, currentValue = state.settings.assets?.[kind]) {
  const current = resolveAssetUrl(kind, currentValue);
  return `<div class="asset-field"><div class="asset-field-info"><strong>${title}</strong>
    <div class="image-choice"><input id="asset-${kind}" type="text" readonly placeholder="Nenhuma imagem selecionada" value="${escapeHtml(current)}">
      <button type="button" class="ui-button secondary" data-pick-asset="${kind}">BIBLIOTECA</button>
      <button type="button" class="ui-button secondary" data-clear-asset="${kind}">LIMPAR</button></div></div>
    <div class="asset-preview" id="preview-${kind}">${current ? `<img src="${escapeHtml(current)}" draggable="false" alt="Prévia de ${escapeHtml(title)}">` : '<span>Sem imagem</span>'}</div></div>`;
}

async function renderSiteSettings() {
  const [{ pages }, { settings: freshSettings }] = await Promise.all([
    siteRequest('/system/site-pages'), siteRequest('/system/site-config'),
  ]);
  state.pages = pages;
  state.settings = freshSettings;
  const s = freshSettings;
  const draftAssets = { ...s.assets };
  const draftEffects = structuredClone(s.backgroundEffects || {});
  let draftLayers = structuredClone(s.particleLayers || []);
  let selectedPage = pages[0]?.id || '';

  app.innerHTML = `<div class="scene inner-scene"><div class="inner-page settings-page">
    ${adminBack('PAINEL DO MESTRE', '/admin')}
    <div class="panel-heading"><h1>Personalização</h1></div>
    <section class="settings-panel">
      <div class="settings-tabs" role="tablist" aria-label="Categorias de personalização">
        <button type="button" role="tab" aria-selected="true" data-settings-tab="identity">IDENTIDADE</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="pages">PÁGINAS</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="particles">PARTÍCULAS</button>
      </div>
      <form id="site-form">
        <section id="settings-panel-identity" class="settings-tab-panel" role="tabpanel" data-settings-panel="identity">
          <div class="editor-grid">
            <div><label for="siteName">NOME DO SITE</label><input id="siteName" maxlength="90" required value="${escapeHtml(s.siteName)}"></div>
            <div><label for="tagline">SUBTÍTULO</label><input id="tagline" maxlength="160" value="${escapeHtml(s.tagline)}"></div>
          </div>
          <label for="description">DESCRIÇÃO DO SITE</label><textarea id="description" maxlength="320" rows="2" required>${escapeHtml(s.description)}</textarea>
          <div class="editor-grid">
            <div><label for="shareTitle">TÍTULO DO LINK</label><input id="shareTitle" maxlength="140" value="${escapeHtml(s.shareTitle)}"></div>
            <div><label for="siteUrl">DOMÍNIO HTTPS</label><input id="siteUrl" type="url" maxlength="300" value="${escapeHtml(s.siteUrl)}"></div>
          </div>
          <label for="shareDescription">DESCRIÇÃO DO LINK</label>
          <textarea id="shareDescription" maxlength="320" rows="2">${escapeHtml(s.shareDescription)}</textarea>
          <label for="themeColor">COR DO NAVEGADOR</label><input id="themeColor" type="color" value="${escapeHtml(s.themeColor)}">
          <div class="settings-identity-assets">
            ${assetField('logo', 'Logo', draftAssets.logo)}
            ${assetField('icon', 'Favicon', draftAssets.icon)}
            ${assetField('social', 'Imagem do link', draftAssets.social)}
          </div>
        </section>
        <section id="settings-panel-pages" class="settings-tab-panel" role="tabpanel" data-settings-panel="pages" hidden>
          <label for="page-settings-selector">PÁGINA</label>
          <select id="page-settings-selector">${pages.map(page => `<option value="${escapeHtml(page.id)}" ${page.id === selectedPage ? 'selected' : ''}>${escapeHtml(page.label)}</option>`).join('')}</select>
          <div id="page-settings-controls" aria-live="polite"></div>
        </section>
        <section id="settings-panel-particles" class="settings-tab-panel" role="tabpanel" data-settings-panel="particles" hidden>
          <div id="particle-editor-list"></div>
          <button class="ui-button secondary" type="button" id="add-particle">ADICIONAR CAMADA</button>
        </section>
        <div class="settings-save"><button class="ui-button" type="submit">SALVAR ALTERAÇÕES</button></div>
      </form>
      <p class="notice" id="notice" role="status"></p>
    </section>
  </div></div>`;

  const form = document.querySelector('#site-form');
  const tabs = [...document.querySelectorAll('[data-settings-tab]')];
  tabs.forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.settingsTab;
    tabs.forEach(tab => {
      tab.setAttribute('aria-selected', String(tab === button));
    });
    document.querySelectorAll('[data-settings-panel]').forEach(panel => {
      panel.hidden = panel.dataset.settingsPanel !== selected;
    });
  }));

  function savePageInputs() {
    const overlay = document.querySelector('#page-overlay');
    const vignette = document.querySelector('#page-vignette');
    if (!overlay || !vignette || !selectedPage) return;
    draftEffects[selectedPage] = { overlay: Number(overlay.value), vignette: Number(vignette.value) };
  }

  function drawPageControls() {
    const page = pages.find(page => page.id === selectedPage);
    const target = document.querySelector('#page-settings-controls');
    if (!page) { target.textContent = ''; return; }
    const fx = draftEffects[page.id] || { overlay: 45, vignette: 55 };
    target.innerHTML = `<div class="page-settings-card">
      <div class="settings-slider"><label for="page-overlay">ESCURECIMENTO <output id="page-overlay-out">${fx.overlay}%</output></label>
        <input id="page-overlay" type="range" min="0" max="100" step="1" value="${fx.overlay}"></div>
      <div class="settings-slider"><label for="page-vignette">VINHETA <output id="page-vignette-out">${fx.vignette}%</output></label>
        <input id="page-vignette" type="range" min="0" max="100" step="1" value="${fx.vignette}"></div>
      ${assetField(page.backgroundKind, 'Imagem de fundo', draftAssets[page.backgroundKind])}
    </div>`;
    target.querySelectorAll('input[type="range"]').forEach(slider => {
      slider.addEventListener('input', () => {
        const output = document.querySelector(`#${slider.id}-out`);
        if (output) output.textContent = `${slider.value}%`;
        savePageInputs();
      });
    });
  }
  drawPageControls();
  document.querySelector('#page-settings-selector').addEventListener('change', event => {
    savePageInputs();
    selectedPage = event.target.value;
    drawPageControls();
  });

  const showLayers = () => {
    document.querySelector('#particle-editor-list').innerHTML = draftLayers.map(particleLayerEditor).join('');
  };
  showLayers();
  document.querySelector('#add-particle').addEventListener('click', () => {
    if (draftLayers.length >= 8) { notice('Limite de 8 camadas.', true); return; }
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
    else if (['count', 'speed', 'size'].includes(field)) draftLayers[index][field] = Number(input.value);
    else if (field === 'opacity') {
      draftLayers[index][field] = Number(input.value) / 100;
      input.nextElementSibling.textContent = `${input.value}%`;
    } else draftLayers[index][field] = input.value;
  };
  document.querySelector('#particle-editor-list').addEventListener('input', updateParticle);
  document.querySelector('#particle-editor-list').addEventListener('change', updateParticle);

  // The image library works for both identity and the selected page.
  document.querySelector('.settings-panel').addEventListener('click', event => {
    const pick = event.target.closest('[data-pick-asset]');
    if (pick) {
      openAssetLibrary(url => {
        const kind = pick.dataset.pickAsset;
        draftAssets[kind] = url;
        document.getElementById(`asset-${kind}`).value = url;
        document.getElementById(`preview-${kind}`).innerHTML = `<img draggable="false" src="${escapeHtml(url)}" alt="Prévia">`;
      });
    }
    const clear = event.target.closest('[data-clear-asset]');
    if (clear) {
      const kind = clear.dataset.clearAsset;
      draftAssets[kind] = '';
      document.getElementById(`asset-${kind}`).value = '';
      document.getElementById(`preview-${kind}`).textContent = '';
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    savePageInputs();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const fields = ['siteName', 'tagline', 'description', 'shareTitle', 'shareDescription', 'siteUrl', 'themeColor'];
      const payload = Object.fromEntries(fields.map(id => [id, form.querySelector(`#${id}`).value]));
      payload.backgroundEffects = draftEffects;
      payload.particleLayers = draftLayers;
      payload.assets = draftAssets;
      const result = await siteRequest('/system/site-config', {
        method: 'PUT', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' },
      });
      state.settings = result.settings;
      applySiteIdentity();
      drawSceneEffectsAfterSettings();
      notice('Alterações salvas.');
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
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
  stopMenuWave();
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
window.addEventListener('popstate', () => { changePage(location.pathname + location.search, false); });

(async () => {
  const [session, info] = await Promise.allSettled([api('session'), siteRequest('/system/site-config')]);
  if (session.status === 'fulfilled') state.isAdmin = session.value.isAdmin;
  if (info.status === 'fulfilled') state.settings = info.value.settings;
  else console.warn('Site settings unavailable:', info.reason);
  applySiteIdentity();
  await route();
  app.classList.add('page-initial');
  window.setTimeout(() => app.classList.remove('page-initial'), 400);
})();

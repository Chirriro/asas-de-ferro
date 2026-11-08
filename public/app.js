const app = document.querySelector('#app');
const state = {
  isAdmin: false,
  entries: [],
  current: null,
  search: '',
  tag: '',
  editorSlug: null,
};

const levelNames = [
  ['general', 'Conhecimento Geral'],
  ['specific', 'Conhecimento Específico'],
  ['professional', 'Conhecimento Profissional'],
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

function renderInline(source) {
  let output = escapeHtml(source);
  output = output.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi, (_, slug, label) =>
    `<a href="/codice/${slug.toLowerCase()}" data-nav>${label || slug}</a>`);
  output = output.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label, href) => {
    if (/&(?:quot|#0*3[49]|lt|gt);/i.test(href)) return label;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return output;
}

function renderMarkdown(source) {
  const paragraphs = source.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(Boolean);
  return paragraphs.map(paragraph => {
    const text = paragraph.trim();
    const header = text.match(/^(#{1,4})\s+([^\n]+)$/);
    if (header) return `<h${Math.min(4, header[1].length + 2)}>${renderInline(header[2])}</h${Math.min(4, header[1].length + 2)}>`;
    if (/^(?:[-*] )/m.test(text) && text.split('\n').every(line => /^[-*] /.test(line))) {
      return `<ul>${text.split('\n').map(line => `<li>${renderInline(line.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p>${text.split('\n').map(renderInline).join(' ')}</p>`;
  }).join('');
}

function autoLink(container, currentSlug) {
  const labels = state.entries.flatMap(entry => [entry.title, ...entry.aliases]
    .filter(label => label?.length >= 3)
    .map(label => ({ label, slug: entry.slug })))
    .filter(entry => entry.slug !== currentSlug)
    .sort((a, b) => b.label.length - a.label.length);
  if (!labels.length) return;
  const seen = new Set();
  const unique = labels.filter(item => {
    const key = item.label.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const escaped = unique.map(item => item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const lookup = new Map(unique.map(item => [item.label.toLocaleLowerCase('pt-BR'), item.slug]));
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('a, code, pre, textarea, button')) continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    const original = node.nodeValue;
    pattern.lastIndex = 0;
    let match;
    let last = 0;
    const fragment = document.createDocumentFragment();
    while ((match = pattern.exec(original))) {
      if (match.index > last) fragment.append(document.createTextNode(original.slice(last, match.index)));
      const slug = lookup.get(match[1].toLocaleLowerCase('pt-BR'));
      const link = document.createElement('a');
      link.href = `/codice/${slug}`;
      link.textContent = match[1];
      link.setAttribute('data-nav', '');
      fragment.append(link);
      last = match.index + match[0].length;
    }
    if (last) {
      fragment.append(document.createTextNode(original.slice(last)));
      node.replaceWith(fragment);
    }
  }
}

async function api(path, options = {}) {
  const request = { credentials: 'same-origin', ...options };
  if (request.body) {
    request.headers = { 'content-type': 'application/json', 'x-codex-request': '1', ...request.headers };
  } else if (request.method && request.method !== 'GET') {
    request.headers = { 'x-codex-request': '1', ...request.headers };
  }
  const response = await fetch(`/api/${path}`, request);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body;
}

async function loadIndex() {
  state.entries = (await api('codices')).entries;
}

function setNotice(message, isError = false) {
  const notice = document.querySelector('#notice');
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notice ${isError ? 'error' : 'success'}`;
}

function navigate(path) {
  if (location.pathname !== path) history.pushState({}, '', path);
  route();
}

function renderHome() {
  app.innerHTML = `<div class="home">
    <h1>Asas de Ferro</h1>
    <p>Bem-vindo ao universo de Asas de Ferro.</p>
    <p>Consulte o Códice para explorar localidades, acontecimentos, culturas e conhecimentos do mundo.</p>
    <p><a href="/codice" data-nav class="action-link">Abrir Códice</a></p>
    <p class="small">Outras áreas do projeto serão adicionadas futuramente.</p>
  </div>`;
}

function availableTags() {
  return [...new Set(state.entries.flatMap(entry => entry.tags || []))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function renderSidebar(selectedSlug) {
  const query = state.search.toLocaleLowerCase('pt-BR');
  const filtered = state.entries.filter(entry => {
    const text = [entry.title, entry.category, entry.summary, ...(entry.tags || []), ...(entry.aliases || [])].join(' ').toLocaleLowerCase('pt-BR');
    return text.includes(query) && (!state.tag || entry.tags?.includes(state.tag));
  });
  return `<aside class="sidebar" aria-label="Navegação do Códice">
    <label for="search">Pesquisar verbetes</label>
    <input type="search" id="search" placeholder="Nome, categoria ou marcador" value="${escapeHtml(state.search)}">
    <label for="tag-filter">Marcador</label>
    <select id="tag-filter">
      <option value="">Todos os marcadores</option>
      ${availableTags().map(tag => `<option value="${escapeHtml(tag)}" ${state.tag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('')}
    </select>
    <div class="small">${filtered.length} verbete(s)</div>
    <ul class="entry-list">
      ${filtered.map(entry => `<li><a href="/codice/${entry.slug}" data-nav ${selectedSlug === entry.slug ? 'aria-current="page"' : ''}>
        ${escapeHtml(entry.title)}<small>${escapeHtml(entry.category)}</small>
      </a></li>`).join('') || '<li class="small">Nenhum resultado.</li>'}
    </ul>
  </aside>`;
}

function bindSidebar() {
  const search = document.querySelector('#search');
  const select = document.querySelector('#tag-filter');
  if (search) search.addEventListener('input', event => {
    state.search = event.target.value;
    const reader = document.querySelector('.reader');
    document.querySelector('.sidebar').outerHTML = renderSidebar(state.current?.slug);
    bindSidebar();
    document.querySelector('#search').focus();
    document.querySelector('#search').setSelectionRange(state.search.length, state.search.length);
  });
  if (select) select.addEventListener('change', event => {
    state.tag = event.target.value;
    document.querySelector('.sidebar').outerHTML = renderSidebar(state.current?.slug);
    bindSidebar();
  });
}

async function renderCodex(slug) {
  if (!state.entries.length) await loadIndex();
  let item = null;
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  if (slug) {
    try { item = (await api(`codices/${slug}${preview ? '?preview=1' : ''}`)).entry; }
    catch (error) {
      app.innerHTML = `<p>${escapeHtml(error.message)}</p><p><a href="/codice" data-nav>Voltar ao Códice</a></p>`;
      return;
    }
  }
  state.current = item;
  const content = item ? `<article class="reader">
    <h1>${escapeHtml(item.title)}</h1>
    <div class="metadata">${escapeHtml(item.category)}</div>
    <div class="tags">${item.tags.map(tag => `<button type="button" class="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>
    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}
    ${state.isAdmin ? `<div class="reader-actions"><button type="button" id="edit-codex">Editar este verbete</button><button type="button" id="preview-codex">${preview ? 'Voltar à visão admin' : 'Prévia do visitante'}</button></div>` : ''}
    ${preview && state.isAdmin ? '<p class="small">Prévia pública: veja exatamente os níveis enviados aos visitantes.</p>' : ''}
    ${levelNames.map(([key, title]) => `<section class="knowledge-section" aria-label="${title}">
      <h2>${title}</h2>
      ${item.content[key] === null
        ? '<div class="censored"><strong>???</strong><p class="small">Conhecimento ainda não disponível.</p></div>'
        : `<div class="codex-body" data-level="${key}">${renderMarkdown(item.content[key]) || '<p class="small">Sem informações registradas.</p>'}</div>`}
    </section>`).join('')}
  </article>` : `<div class="empty-state"><h1>Códice</h1><p>Selecione um verbete na lista para começar a leitura.</p></div>`;
  app.innerHTML = `<h1 class="page-intro">Códice</h1><div class="codex-layout">${renderSidebar(slug)}${content}</div>`;
  bindSidebar();
  for (const body of document.querySelectorAll('.codex-body')) autoLink(body, slug);
  document.querySelector('#edit-codex')?.addEventListener('click', () => navigate(`/admin?edit=${slug}`));
  document.querySelector('#preview-codex')?.addEventListener('click', () => navigate(`/codice/${slug}${preview ? '' : '?preview=1'}`));
}

function renderLogin() {
  app.innerHTML = `<section class="login">
    <h1>Acesso do administrador</h1>
    <p>Somente o administrador pode criar ou editar verbetes.</p>
    <form id="login-form">
      <label for="username">Usuário</label><input id="username" name="username" required autocomplete="username" value="admin">
      <label for="password">Senha</label><input id="password" name="password" type="password" required autocomplete="current-password">
      <button type="submit">Entrar</button>
    </form><p id="notice" class="notice" role="status"></p>
  </section>`;
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await api('login', { method: 'POST', body: JSON.stringify({
        username: document.querySelector('#username').value, password: document.querySelector('#password').value,
      }) });
      state.isAdmin = true;
      route();
    } catch (error) {
      setNotice(error.message, true);
    } finally { button.disabled = false; }
  });
}

function emptyEntry() {
  return {
    slug: '', title: '', category: 'Geral', summary: '', tags: [], aliases: [],
    publicLevel: 0, content: { general: '', specific: '', professional: '' },
  };
}

async function renderAdmin() {
  if (!state.isAdmin) { renderLogin(); return; }
  const edit = new URLSearchParams(location.search).get('edit');
  let item = emptyEntry();
  if (edit) {
    try { item = (await api(`codices/${edit}`)).entry; }
    catch (error) { app.innerHTML = `<p>${escapeHtml(error.message)}</p>`; return; }
  }
  state.editorSlug = edit || null;
  app.innerHTML = `<section class="editor">
    <div class="admin-toolbar"><h1>Administração do Códice</h1>
      <button type="button" id="new-entry">Novo verbete</button>
      <button type="button" id="logout">Sair</button>
    </div>
    <p>Para editar um verbete existente, abra-o no <a href="/codice" data-nav>Códice</a> e clique em “Editar este verbete”.</p>
    <form id="codex-form">
      <div class="editor-grid">
        <div><label for="title">Título</label><input id="title" required maxlength="120" value="${escapeHtml(item.title)}"></div>
        <div><label for="slug">Identificador da URL</label><input id="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="72" value="${escapeHtml(item.slug)}" ${edit ? 'readonly' : ''}></div>
        <div><label for="category">Categoria</label><input id="category" maxlength="80" required value="${escapeHtml(item.category)}"></div>
        <div><label for="public-level">Conhecimento público até</label>
          <select id="public-level">${levelNames.map(([_, label], index) => `<option value="${index}" ${item.publicLevel === index ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        <div><label for="tags">Marcadores <span class="hint">(separar por vírgulas)</span></label><input id="tags" value="${escapeHtml(item.tags.join(', '))}"></div>
        <div><label for="aliases">Outros nomes <span class="hint">(para links automáticos)</span></label><input id="aliases" value="${escapeHtml(item.aliases.join(', '))}"></div>
      </div>
      <label for="summary">Resumo público opcional</label>
      <textarea id="summary" rows="3" maxlength="1000">${escapeHtml(item.summary)}</textarea>
      <p class="hint">Os três textos pertencem ao mesmo verbete. Níveis acima do escolhido mostram “???” aos visitantes. Para ocultar apenas um trecho, use {{secret}}texto{{/secret}}. O trecho oculto não será enviado aos visitantes.</p>
      <div class="editor-content">
        ${levelNames.map(([key, label]) => `<label for="content-${key}">${label} <span class="hint">(Markdown básico e [[identificador|texto]])</span></label>
          <textarea id="content-${key}" spellcheck="true">${escapeHtml(item.content[key])}</textarea>`).join('')}
      </div>
      <div class="editor-actions"><button type="submit">${edit ? 'Salvar alterações' : 'Criar verbete'}</button>
        <button type="button" id="view-entry" ${edit ? '' : 'disabled'}>Visualizar</button>
        ${edit ? '<button type="button" id="delete-entry" class="danger">Excluir verbete</button>' : ''}
      </div>
    </form><p id="notice" class="notice" role="status"></p>
  </section>`;
  document.querySelector('#title').addEventListener('input', event => {
    if (!edit) document.querySelector('#slug').value = slugify(event.target.value);
  });
  document.querySelector('#new-entry').addEventListener('click', () => navigate('/admin'));
  document.querySelector('#logout').addEventListener('click', async () => {
    try {
      await api('logout', { method: 'POST' });
      state.isAdmin = false;
      navigate('/');
    } catch (error) { setNotice(error.message, true); }
  });
  document.querySelector('#view-entry')?.addEventListener('click', () => navigate(`/codice/${edit}`));
  document.querySelector('#delete-entry')?.addEventListener('click', async () => {
    if (!confirm(`Excluir o verbete "${item.title}"?`)) return;
    try {
      await api(`codices/${edit}`, { method: 'DELETE' });
      await loadIndex();
      navigate('/codice');
    } catch (error) { setNotice(error.message, true); }
  });
  document.querySelector('#codex-form').addEventListener('submit', async event => {
    event.preventDefault();
    const f = id => document.getElementById(id).value;
    const commaList = value => value.split(',').map(part => part.trim()).filter(Boolean);
    const payload = {
      title: f('title').trim(), slug: f('slug').trim(), category: f('category').trim(),
      summary: f('summary'), tags: commaList(f('tags')), aliases: commaList(f('aliases')),
      publicLevel: Number(f('public-level')),
      content: Object.fromEntries(levelNames.map(([key]) => [key, f(`content-${key}`)])),
    };
    const button = event.target.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await api(edit ? `codices/${edit}` : 'codices', {
        method: edit ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      await loadIndex();
      if (!edit) { navigate(`/admin?edit=${payload.slug}`); setNotice('Verbete criado.'); }
      else setNotice('Alterações salvas.');
    } catch (error) { setNotice(error.message, true); }
    finally { button.disabled = false; }
  });
}

async function route() {
  const pathname = location.pathname;
  document.querySelectorAll('[data-nav]').forEach(link => link.removeAttribute('aria-current'));
  const link = document.querySelector(`.site-header a[href="${pathname === '/' ? '/' : pathname.startsWith('/codice') ? '/codice' : '/admin'}"]`);
  link?.setAttribute('aria-current', 'page');
  try {
    if (pathname === '/') renderHome();
    else if (pathname === '/codice' || pathname.startsWith('/codice/')) await renderCodex(pathname.split('/')[2] || null);
    else if (pathname === '/admin') await renderAdmin();
    else app.innerHTML = '<h1>Página não encontrada</h1><a href="/" data-nav>Início</a>';
  } catch (error) {
    app.textContent = `Não foi possível carregar: ${error.message}`;
  }
}

document.addEventListener('click', event => {
  const tag = event.target.closest('[data-tag]');
  if (tag) {
    state.tag = tag.dataset.tag;
    navigate('/codice');
    return;
  }
  const link = event.target.closest('a[data-nav]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.pathname + link.search);
});
window.addEventListener('popstate', route);

(async () => {
  try { state.isAdmin = (await api('session')).isAdmin; }
  catch { state.isAdmin = false; }
  await route();
})();

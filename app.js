// State
let articles = [];
let projects = [];
let books = [];
let activeTags = new Set();
let searchTerm = '';
let projectSearchTerm = '';
let currentProjectCategory = 'todos';
let isAdminLoggedIn = false;
let currentDashTab = 'articles';
let targetBookCoverId = null;


// ---------- Supabase ----------
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const AVATAR_DEFAULT = 'assets/foto_leandro.jpg?v=2026-10';

// Escapa texto antes de insertarlo como HTML (evita inyección de código)
// Clase de color del cartel de estado de una publicación
function statusClass(s) {
  const k = (s || 'Publicado').toLowerCase();
  if (k.startsWith('publicado')) return 'is-published';
  if (k.startsWith('aceptado')) return 'is-accepted';
  if (k.includes('prensa')) return 'is-press';
  if (k.includes('revisi')) return 'is-review';
  return '';
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Conversión entre el formato de la base y el que usa la página
const DB = {
  articles: {
    from: r => ({ id: r.id, year: r.year, title: r.title, authors: r.authors, venue: r.venue, type: r.type, date: r.date, status: r.status, link: r.link, citation: r.citation, tags: r.tags || [], visible: r.visible }),
    to: x => ({ id: x.id, year: x.year, title: x.title, authors: x.authors ?? null, venue: x.venue, type: x.type ?? 'Artículo', date: x.date ?? null, status: x.status ?? 'Publicado', link: x.link ?? null, citation: x.citation ?? null, tags: x.tags || [], visible: x.visible !== false })
  },
  projects: {
    from: r => ({ id: r.id, title: r.title, slug: r.slug, category: r.category, categoryLabel: r.category_label, url: r.url, desc: r.description, tags: r.tags || [], badge: r.badge, icon: r.icon, status: r.status, thumb: r.thumb, visible: r.visible }),
    to: x => ({ id: x.id, title: x.title, slug: x.slug ?? null, category: x.category, category_label: x.categoryLabel ?? null, url: x.url ?? null, description: x.desc ?? null, tags: x.tags || [], badge: x.badge ?? null, icon: x.icon ?? null, status: x.status ?? null, thumb: x.thumb ?? null, visible: x.visible !== false })
  },
  books: {
    from: r => ({ id: r.id, type: r.type, title: r.title, authors: r.authors, editor: r.editor, date: r.date, year: r.year, pages: r.pages, isbn: r.isbn, status: r.status, link: r.link, desc: r.description, citation: r.citation, cover: r.cover, visible: r.visible }),
    to: x => ({ id: x.id, type: x.type, title: x.title, authors: x.authors ?? null, editor: x.editor ?? null, date: x.date ?? null, year: x.year ?? null, pages: x.pages ?? null, isbn: x.isbn ?? null, status: x.status ?? 'Publicado', link: x.link ?? null, description: x.desc ?? null, citation: x.citation ?? null, cover: x.cover ?? null, visible: x.visible !== false })
  }
};
const knownIds = { articles: new Set(), projects: new Set(), books: new Set() };

// Lee una tabla ordenada. Si Supabase no responde, usa la copia estática de data/*.json
async function fetchTable(table) {
  try {
    const { data, error } = await sb.from(table).select('*').order('position', { ascending: true });
    if (error) throw error;
    knownIds[table] = new Set(data.map(r => r.id));
    return data.map(DB[table].from);
  } catch (err) {
    console.warn(`Supabase no disponible para ${table}, usando data/${table}.json`, err);
    const res = await fetch(`data/${table}.json`);
    const list = res.ok ? await res.json() : [];
    return list.filter(x => x.visible !== false);
  }
}

// Guarda la lista completa: actualiza/crea filas (con su orden) y borra las eliminadas
async function syncTable(table, list) {
  if (!isAdminLoggedIn) return false;
  const now = new Date().toISOString();
  const rows = list.map((x, i) => ({ ...DB[table].to(x), position: i, updated_at: now }));
  const currentIds = new Set(rows.map(r => r.id));
  const removed = [...knownIds[table]].filter(id => !currentIds.has(id));
  try {
    if (rows.length) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    if (removed.length) {
      const { error } = await sb.from(table).delete().in('id', removed);
      if (error) throw error;
    }
    knownIds[table] = currentIds;
    return true;
  } catch (err) {
    console.error(`Error guardando ${table}`, err);
    alert('No se pudo guardar en la base de datos: ' + (err.message || err) + '\nSi la sesión expiró, vuelva a ingresar.');
    return false;
  }
}

// Sube una imagen al bucket "media" y devuelve su URL pública
async function uploadImage(file, folder) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

async function loadAvatar() {
  try {
    const { data } = await sb.from('site_settings').select('value').eq('key', 'avatar_url').maybeSingle();
    if (data && data.value) setAvatarSrc(data.value);
  } catch (e) { /* se mantiene la foto por defecto */ }
}

function setAvatarSrc(src) {
  const big = document.getElementById('avatar-img');
  const small = document.querySelector('.nav-brand img');
  if (big) big.src = src;
  if (small) small.src = src;
}

// DOM Elements
const pubListEl = document.getElementById('pub-list');
const tagPillsEl = document.getElementById('tag-pills');
const searchEl = document.getElementById('search');
const pubCountMetaEl = document.getElementById('pub-count-meta');
const projectsGridEl = document.getElementById('projects-grid');
const projSearchEl = document.getElementById('proj-search');
const projCountMetaEl = document.getElementById('proj-count-meta');
const booksListEl = document.getElementById('books-list');
const chaptersListEl = document.getElementById('chapters-list');
const booksCountMetaEl = document.getElementById('books-count-meta');
const chaptersCountMetaEl = document.getElementById('chapters-count-meta');
const adminModal = document.getElementById('admin-modal');
const adminLoginBox = document.getElementById('admin-login-box');
const adminDashboardBox = document.getElementById('admin-dashboard-box');

// Fetch Books & Chapters
async function loadBooks() {
  books = await fetchTable('books');
  renderBooks();
  if (isAdminLoggedIn) renderAdminBooksTable();
}

async function saveBooksToServer() {
  await syncTable('books', books);
  renderBooks();
}

// Render Books & Chapters
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

function bookCover(b) {
  return b.cover || (String(b.title || '').includes('1918') ? 'assets/libro_eliva.svg' : 'assets/libro_edunpaz.svg');
}

function renderBooks() {
  if (!booksListEl || !chaptersListEl) return;

  const visibleBooks = books.filter(b => b.visible !== false && b.type === 'Libro');
  const visibleChapters = books.filter(b => b.visible !== false && b.type === 'Capítulo de libro');

  if (booksCountMetaEl) booksCountMetaEl.textContent = plural(visibleBooks.length, 'libro', 'libros');
  if (chaptersCountMetaEl) chaptersCountMetaEl.textContent = plural(visibleChapters.length, 'capítulo', 'capítulos');

  booksListEl.innerHTML = visibleBooks.map(b => {
    const paras = String(b.desc || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const first = paras[0] ? `<p>${esc(paras[0])}</p>` : '';
    const rest = paras.slice(1).map(p => `<p>${esc(p)}</p>`).join('');
    const facts = [
      ['Editorial', b.editor],
      ['Año', b.year || b.date],
      ['Extensión', b.pages],
      ['ISBN', b.isbn],
      ['Estado', b.status || 'Publicado']
    ].filter(([, v]) => v);
    const linkLabel = b.link && /\.pdf($|\?)/i.test(b.link) ? 'Descargar el libro (PDF)' : 'Ver el libro';

    return `
      <article class="book" id="book-card-${esc(b.id)}">
        <div class="book-cover">
          <img id="book-img-${esc(b.id)}" src="${esc(bookCover(b))}" alt="Tapa de ${esc(b.title)}" loading="lazy">
        </div>
        <div class="book-body">
          <h3 class="book-title">${esc(b.title)}</h3>
          <p class="book-authors">${esc(b.authors)}</p>
          <div class="book-desc">
            ${first}
            ${rest ? `<details class="more"><summary>Leer la sinopsis completa</summary>${rest}</details>` : ''}
          </div>
          <dl class="book-facts">
            ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
          </dl>
          ${b.link ? `
            <a class="btn-solid" href="${esc(b.link)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              ${linkLabel}
            </a>` : ''}
        </div>
      </article>
    `;
  }).join('');

  chaptersListEl.innerHTML = visibleChapters.map(c => `
    <article class="chapter">
      <p class="chapter-in">En <em>${esc(c.editor)}</em>${c.year ? `, ${esc(c.year)}` : ''}</p>
      <h4 class="chapter-title">${esc(c.title)}</h4>
      ${c.desc ? `<p class="chapter-desc">${esc(c.desc)}</p>` : ''}
      ${c.citation ? `<details class="more"><summary>Cómo citarlo</summary><p class="chapter-citation">${esc(c.citation)}</p></details>` : ''}
      <div class="chapter-links">
        ${c.link ? `<a class="text-link" href="${esc(c.link)}" target="_blank" rel="noopener">${/\.pdf($|\?)/i.test(c.link) ? 'Leer el libro completo (PDF)' : 'Leer el capítulo'}</a>` : ''}
        ${c.id === 'chap-iaec24' ? `<a class="text-link" href="https://iies.aduba.org.ar/2026/02/13/lanzamiento-del-libro-dialogo-interamericano-sobre-inteligencia-artificial-en-educacion-cientifica/" target="_blank" rel="noopener">Nota de lanzamiento (IIES, UBA)</a>` : ''}
      </div>
    </article>
  `).join('');
}

// Cover Upload Trigger
window.triggerBookCoverUpload = function(bookId) {
  if (!isAdminLoggedIn) return;
  targetBookCoverId = bookId;
  const input = document.getElementById('book-cover-file-input');
  if (input) input.click();
};

// Fetch Projects
async function loadProjects() {
  projects = await fetchTable('projects');
  renderProjects();
  if (isAdminLoggedIn) renderAdminProjectsTable();
}

async function saveProjectsToServer() {
  await syncTable('projects', projects);
  renderProjects();
}

// Fetch Articles
async function loadArticles() {
  articles = await fetchTable('articles');
  renderTags();
  renderArticles();
  if (isAdminLoggedIn) renderAdminTable();
}

async function saveArticlesToServer() {
  await syncTable('articles', articles);
  renderArticles();
  renderTags();
}

// Render Projects
function renderProjects(category = currentProjectCategory) {
  currentProjectCategory = category;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const on = btn.dataset.tab === category;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  const visibleProjects = projects.filter(p => p.visible !== false);
  const counts = {
    todos: visibleProjects.length,
    programacion: visibleProjects.filter(p => p.category === 'programacion').length,
    investigacion: visibleProjects.filter(p => p.category === 'investigacion').length,
    'en-desarrollo': visibleProjects.filter(p => p.category === 'en-desarrollo').length
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById('tab-count-' + k);
    if (el) el.textContent = v;
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${k}"]`);
    if (tabBtn && k !== 'todos') tabBtn.hidden = v === 0 && currentProjectCategory !== k;
  });

  let list = category === 'todos' ? visibleProjects : visibleProjects.filter(p => p.category === category);
  const term = (projectSearchTerm || '').trim().toLowerCase();
  if (term) {
    list = list.filter(p =>
      (p.title + ' ' + (p.desc || '') + ' ' + (p.tags ? p.tags.join(' ') : '') + ' ' + (p.url || '')).toLowerCase().includes(term)
    );
  }

  if (projCountMetaEl) projCountMetaEl.textContent = plural(visibleProjects.length, 'proyecto', 'proyectos');

  if (list.length === 0) {
    projectsGridEl.innerHTML = `<p class="empty">Ningún proyecto coincide con “${esc(projectSearchTerm || '')}”. Probá con otra palabra o elegí “Todos”.</p>`;
    return;
  }

  projectsGridEl.innerHTML = list.map(p => {
    const domain = p.url ? p.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const desc = String(p.desc || '').replace(/\s*\n+\s*/g, ' ');
    const tag = p.url ? 'a' : 'div';
    const attrs = p.url ? `href="${esc(p.url)}" target="_blank" rel="noopener"` : '';
    return `
      <${tag} class="project" ${attrs}>
        ${p.thumb ? `<img class="project-thumb" src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}
        <span class="project-cat">${esc(p.categoryLabel || p.category)}${p.badge ? ` <span class="project-badge">${esc(p.badge)}</span>` : ''}</span>
        <h3 class="project-title">${esc(p.title)}</h3>
        <p class="project-desc">${esc(desc)}</p>
        ${domain ? `<span class="project-domain">${esc(domain)}</span>` : ''}
      </${tag}>
    `;
  }).join('');
}

// Topic map (mapa de temas) — también funciona como filtro de publicaciones
function topicColorIndex(tag, ordered) {
  return (ordered.indexOf(tag) % 7) + 1;
}

function renderTags() {
  const visibleArticles = articles.filter(a => a.visible !== false);
  const tagCounts = {};
  visibleArticles.forEach(a => (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b));
  window.__topicOrder = tags;

  const anyActive = activeTags.size > 0;
  tagPillsEl.classList.toggle('has-active', anyActive);
  tagPillsEl.innerHTML = tags.map(t => {
    const on = activeTags.has(t);
    return `
      <button type="button" class="topic-seg${on ? ' active' : ''}" data-tag="${esc(t)}" aria-pressed="${on}"
        style="--w:${tagCounts[t]}; --pct:${Math.round(tagCounts[t] / tagCounts[tags[0]] * 100)}; --c: var(--t${topicColorIndex(t, tags)})">
        <span class="topic-count">${tagCounts[t]}</span>
        <span class="topic-name">${esc(t)}</span>
      </button>`;
  }).join('');

  tagPillsEl.querySelectorAll('.topic-seg').forEach(btn => {
    btn.onclick = () => {
      const t = btn.dataset.tag;
      const wasOn = activeTags.has(t);
      activeTags.clear();
      if (!wasOn) activeTags.add(t);
      syncPills();
      renderArticles();
      if (!wasOn) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('publicaciones').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    };
  });
}

function syncPills() {
  renderTags();
}

// Render Articles
function renderArticles() {
  const term = searchTerm.trim().toLowerCase();
  const visible = articles.filter(a => a.visible !== false);

  const filtered = visible.filter(a => {
    const matchSearch = !term || (a.title + ' ' + (a.authors || '') + ' ' + (a.venue || '')).toLowerCase().includes(term);
    const matchTags = activeTags.size === 0 || (a.tags && a.tags.some(t => activeTags.has(t)));
    return matchSearch && matchTags;
  });

  const yearsAll = visible.map(a => a.year).filter(Boolean);
  if (pubCountMetaEl) {
    pubCountMetaEl.textContent = yearsAll.length
      ? `${plural(visible.length, 'publicación', 'publicaciones')} entre ${Math.min(...yearsAll)} y ${Math.max(...yearsAll)}`
      : '';
  }

  const filterMeta = document.getElementById('pub-filter-meta');
  const clearBtn = document.getElementById('clear-topic');
  const topic = [...activeTags][0];
  if (filterMeta) {
    filterMeta.textContent = (topic || term)
      ? `${plural(filtered.length, 'resultado', 'resultados')}${topic ? ` en “${topic}”` : ''}`
      : plural(visible.length, 'publicación', 'publicaciones');
  }
  if (clearBtn) clearBtn.hidden = !topic;

  renderLatest(visible);

  if (filtered.length === 0) {
    pubListEl.innerHTML = `<p class="empty">Ninguna publicación coincide con esa búsqueda. Probá con otra palabra${topic ? ' o mirá todos los temas' : ''}.</p>`;
    return;
  }

  const order = window.__topicOrder || [];
  const years = [...new Set(filtered.map(a => a.year))].sort((a, b) => b - a);

  pubListEl.innerHTML = years.map(year => {
    const items = filtered.filter(a => a.year === year);
    return `
      <div class="year-group">
        <div class="year-head"><span class="num">${esc(year)}</span><span class="count">${plural(items.length, 'trabajo', 'trabajos')}</span></div>
        <ol class="year-items">
          ${items.map(p => {
            const title = p.link
              ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
              : esc(p.title);
            const status = `<span class="status-pill ${statusClass(p.status)}">${esc(p.status || 'Publicado')}</span>`;
            const dots = (p.tags || []).map(t => `<span class="dot" style="--c: var(--t${order.includes(t) ? topicColorIndex(t, order) : 1})" title="${esc(t)}"></span>`).join('');
            return `
              <li class="pub">
                <div class="pub-title">${title}${status}</div>
                <div class="pub-meta">
                  <span class="pub-dots" aria-hidden="true">${dots}</span>
                  <span class="venue">${esc(p.venue)}</span>
                  <span class="pub-topics">${esc((p.tags || []).join(', '))}</span>
                </div>
                ${p.citation ? `<details class="more"><summary>Cómo citarlo</summary><p class="pub-citation">${esc(p.citation)}</p></details>` : ''}
              </li>`;
          }).join('')}
        </ol>
      </div>`;
  }).join('');
}

// "Lo último" en la portada
function renderLatest(visible) {
  const el = document.getElementById('hero-latest');
  if (!el) return;
  if (!visible.length) { el.hidden = true; return; }
  const maxYear = Math.max(...visible.map(a => a.year || 0));
  const latest = visible.find(a => a.year === maxYear);
  el.href = latest.link || '#publicaciones';
  if (latest.link) { el.target = '_blank'; el.rel = 'noopener'; } else { el.removeAttribute('target'); }
  const status = latest.status && latest.status !== 'Publicado' ? ` (${latest.status.toLowerCase()})` : '';
  el.innerHTML = `
    <span class="hl-label">Mi trabajo más reciente${esc(status)}</span>
    <span class="hl-title">${esc(latest.title)}</span>
    <span class="hl-venue">${esc(latest.venue)}, ${esc(latest.year)}</span>`;
  el.hidden = false;
}

// Admin Modal & Dashboard
function openAdminModal() {
  adminModal.style.display = 'flex';
  if (isAdminLoggedIn) {
    adminLoginBox.style.display = 'none';
    adminDashboardBox.style.display = 'block';
    renderAdminTable();
    renderAdminProjectsTable();
  } else {
    adminLoginBox.style.display = 'block';
    adminDashboardBox.style.display = 'none';
  }
}

function closeAdminModal() {
  adminModal.style.display = 'none';
}

function switchDashTab(tab) {
  currentDashTab = tab;
  const btnArt = document.getElementById('dash-tab-articles');
  const btnProj = document.getElementById('dash-tab-projects');
  const btnBooks = document.getElementById('dash-tab-books');
  const viewArt = document.getElementById('dash-articles-view');
  const viewProj = document.getElementById('dash-projects-view');
  const viewBooks = document.getElementById('dash-books-view');

  btnArt.classList.toggle('active', tab === 'articles');
  btnProj.classList.toggle('active', tab === 'projects');
  if (btnBooks) btnBooks.classList.toggle('active', tab === 'books');

  viewArt.style.display = tab === 'articles' ? 'block' : 'none';
  viewProj.style.display = tab === 'projects' ? 'block' : 'none';
  if (viewBooks) viewBooks.style.display = tab === 'books' ? 'block' : 'none';

  if (tab === 'articles') renderAdminTable();
  else if (tab === 'projects') renderAdminProjectsTable();
  else if (tab === 'books') renderAdminBooksTable();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn = e.target.querySelector('button[type="submit"]');
  errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Ingresando…'; }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (btn) { btn.disabled = false; btn.textContent = 'Ingresar al Dashboard'; }

  if (error || !data.user) {
    errEl.textContent = 'Credenciales incorrectas. Verifique email y contraseña.';
    errEl.style.display = 'block';
    return;
  }
  if ((data.user.email || '').toLowerCase() !== window.ADMIN_EMAIL.toLowerCase()) {
    await sb.auth.signOut();
    errEl.textContent = 'Este usuario no tiene permisos de administrador.';
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('login-pass').value = '';
  await enterAdminMode(data.user.email);
}

async function enterAdminMode(email) {
  isAdminLoggedIn = true;
  const who = document.getElementById('admin-session-label');
  if (who) who.textContent = 'Sesión activa: ' + email;
  // Como admin se cargan también los elementos ocultos
  await Promise.all([loadArticles(), loadProjects(), loadBooks()]);
  adminLoginBox.style.display = 'none';
  adminDashboardBox.style.display = 'block';
  switchDashTab(currentDashTab);
}

async function handleLogout() {
  await sb.auth.signOut();
  isAdminLoggedIn = false;
  adminDashboardBox.style.display = 'none';
  adminLoginBox.style.display = 'block';
  closeAdminModal();
  await Promise.all([loadArticles(), loadProjects(), loadBooks()]);
}

async function restoreSession() {
  const { data } = await sb.auth.getSession();
  const email = data && data.session && data.session.user && data.session.user.email;
  if (email && email.toLowerCase() === window.ADMIN_EMAIL.toLowerCase()) {
    await enterAdminMode(email);
  }
}

let currentDashProjFilter = 'todos';

// Drag and Drop Helper for Admin Tables
function makeTableDraggable(tbody, onReorder) {
  let draggedRow = null;
  let srcIndex = null;

  tbody.querySelectorAll('tr[data-index]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      draggedRow = row;
      srcIndex = parseInt(row.dataset.index, 10);
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', srcIndex);
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!draggedRow || draggedRow === row) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      row.classList.toggle('drag-over-bottom', insertAfter);
      row.classList.toggle('drag-over-top', !insertAfter);
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      if (!draggedRow || draggedRow === row) return;
      let targetIndex = parseInt(row.dataset.index, 10);
      const rect = row.getBoundingClientRect();
      const insertAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      if (insertAfter && targetIndex < srcIndex) targetIndex++;
      else if (!insertAfter && targetIndex > srcIndex) targetIndex--;
      onReorder(srcIndex, targetIndex);
    });

    row.addEventListener('dragend', () => {
      if (draggedRow) draggedRow.classList.remove('is-dragging');
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
      draggedRow = null;
      srcIndex = null;
    });
  });
}

function renderAdminTable() {
  const tbody = document.getElementById('admin-table-body');
  document.getElementById('admin-stats').textContent = 
    `Publicaciones: ${articles.length} (Visibles: ${articles.filter(a => a.visible !== false).length}) | Proyectos: ${projects.length} | Libros: ${books.length}`;

  tbody.innerHTML = articles.map((a, i) => `
    <tr draggable="true" data-index="${i}">
      <td style="text-align:center;">
        <span class="drag-handle" title="Arrastrar y soltar para mover">⋮⋮</span>
      </td>
      <td style="text-align:center;">
        <input type="checkbox" ${a.visible !== false ? 'checked' : ''} onchange="toggleArticleVisibility(${i})">
      </td>
      <td><strong>${esc(a.title)}</strong></td>
      <td>${esc(a.venue)}</td>
      <td class="mono">${esc(a.year)}</td>
      <td><span class="status-pill ${statusClass(a.status)}">${esc(a.status || 'Publicado')}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-sm btn-edit" onclick="editArticle(${i})">Editar</button>
          <button class="btn-sm btn-delete" onclick="deleteArticle(${i})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');

  makeTableDraggable(tbody, (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= articles.length || to >= articles.length) return;
    const [moved] = articles.splice(from, 1);
    articles.splice(to, 0, moved);
    saveArticlesToServer();
    renderAdminTable();
  });
}

window.toggleArticleVisibility = function(index) {
  articles[index].visible = !(articles[index].visible !== false);
  saveArticlesToServer();
  renderAdminTable();
};

window.editArticle = function(index) {
  const a = articles[index];
  if (!a) return;
  document.getElementById('edit-art-index').value = index;
  document.getElementById('edit-title').value = a.title || '';
  document.getElementById('edit-venue').value = a.venue || '';
  document.getElementById('edit-year').value = a.year || 2026;
  document.getElementById('edit-tags').value = (a.tags || []).join(', ');
  document.getElementById('edit-status').value = a.status || 'Publicado';
  document.getElementById('edit-link').value = a.link || '';

  const box = document.getElementById('edit-article-box');
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function handleSaveEditArticle(e) {
  e.preventDefault();
  const index = parseInt(document.getElementById('edit-art-index').value, 10);
  if (isNaN(index) || !articles[index]) return;

  const title = document.getElementById('edit-title').value.trim();
  const venue = document.getElementById('edit-venue').value.trim();
  const year = parseInt(document.getElementById('edit-year').value.trim(), 10);
  const tags = document.getElementById('edit-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  const status = document.getElementById('edit-status').value;
  const link = document.getElementById('edit-link').value.trim() || null;

  if (!title || !venue || !year) {
    alert('Complete título, revista y año');
    return;
  }

  articles[index] = {
    ...articles[index],
    title,
    venue,
    year,
    tags,
    status,
    link
  };

  saveArticlesToServer();
  renderAdminTable();
  document.getElementById('edit-article-box').style.display = 'none';
  alert('Publicación modificada exitosamente.');
}

window.deleteArticle = function(index) {
  if (confirm(`¿Eliminar "${articles[index].title}"?`)) {
    articles.splice(index, 1);
    saveArticlesToServer();
    renderAdminTable();
  }
};

function handleAddArticle(e) {
  e.preventDefault();
  const title = document.getElementById('new-title').value.trim();
  const venue = document.getElementById('new-venue').value.trim();
  const year = parseInt(document.getElementById('new-year').value.trim(), 10);
  const keywords = document.getElementById('new-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  const status = document.getElementById('new-status').value;
  const link = document.getElementById('new-link').value.trim() || null;

  if (!title || !venue || !year) {
    alert('Por favor complete título, revista y año');
    return;
  }

  const newArticle = {
    id: 'pub-' + Date.now(),
    year,
    title,
    venue,
    authors: 'Guerschberg',
    type: 'Artículo',
    date: year.toString(),
    status,
    link,
    tags: keywords.length ? keywords : ['Tecnología en educación superior'],
    visible: true
  };

  articles.unshift(newArticle);
  saveArticlesToServer();
  renderAdminTable();
  e.target.reset();
  alert('Publicación agregada con éxito.');
}

// Admin Projects Management
function renderAdminProjectsTable() {
  const tbody = document.getElementById('admin-projects-table-body');
  if (!tbody) return;

  let list = projects;
  if (currentDashProjFilter !== 'todos') {
    list = projects.filter(p => p.category === currentDashProjFilter);
  }

  // Update filter buttons active style
  document.querySelectorAll('.dash-proj-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === currentDashProjFilter);
  });

  tbody.innerHTML = list.map((p) => {
    const realIndex = projects.findIndex(item => item.id === p.id);
    const domain = p.url ? p.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    return `
      <tr draggable="true" data-index="${realIndex}">
        <td style="text-align:center;">
          <span class="drag-handle" title="Arrastrar y soltar para mover">⋮⋮</span>
        </td>
        <td style="text-align:center;">
          <input type="checkbox" ${p.visible !== false ? 'checked' : ''} onchange="toggleProjectVisibility(${realIndex})">
        </td>
        <td>
          <strong>${esc(p.title)}</strong>
          <div style="font-size:0.78rem; color:var(--ink-faint); margin-top:2px;">${esc((p.desc || '').substring(0, 75))}...</div>
        </td>
        <td><span class="status-pill">${esc(p.categoryLabel || p.category)}</span></td>
        <td><a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-size:0.8rem; font-family:'IBM Plex Mono', monospace;">${esc(domain)}</a></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-edit" onclick="editProject(${realIndex})">Editar</button>
            <button class="btn-sm btn-delete" onclick="deleteProject(${realIndex})">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  makeTableDraggable(tbody, (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= projects.length || to >= projects.length) return;
    const [moved] = projects.splice(from, 1);
    projects.splice(to, 0, moved);
    saveProjectsToServer();
    renderAdminProjectsTable();
  });
}

window.toggleProjectVisibility = function(index) {
  projects[index].visible = !(projects[index].visible !== false);
  saveProjectsToServer();
  renderAdminProjectsTable();
};

window.editProject = function(index) {
  const p = projects[index];
  if (!p) return;

  document.getElementById('edit-proj-index').value = index;
  document.getElementById('edit-proj-title').value = p.title || '';
  document.getElementById('edit-proj-cat').value = p.category || 'programacion';
  document.getElementById('edit-proj-url').value = p.url || '';
  document.getElementById('edit-proj-desc').value = p.desc || '';
  document.getElementById('edit-proj-tags').value = (p.tags || []).join(', ');

  const box = document.getElementById('edit-project-box');
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function handleSaveEditProject(e) {
  e.preventDefault();
  const index = parseInt(document.getElementById('edit-proj-index').value, 10);
  if (isNaN(index) || !projects[index]) return;

  const title = document.getElementById('edit-proj-title').value.trim();
  const category = document.getElementById('edit-proj-cat').value;
  const url = document.getElementById('edit-proj-url').value.trim();
  const desc = document.getElementById('edit-proj-desc').value.trim();
  const tags = document.getElementById('edit-proj-tags').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!title || !url || !desc) {
    alert('Complete título, enlace y reseña');
    return;
  }

  const categoryLabels = {
    'programacion': 'Programación',
    'investigacion': 'Investigación',
    'en-desarrollo': 'En desarrollo'
  };

  projects[index] = {
    ...projects[index],
    title,
    category,
    categoryLabel: categoryLabels[category] || category,
    url,
    desc,
    tags
  };

  saveProjectsToServer();
  renderAdminProjectsTable();
  document.getElementById('edit-project-box').style.display = 'none';
  alert('Proyecto modificado exitosamente.');
}

window.deleteProject = function(index) {
  if (confirm(`¿Eliminar el proyecto "${projects[index].title}"?`)) {
    projects.splice(index, 1);
    saveProjectsToServer();
    renderAdminProjectsTable();
  }
};

function handleAddProject(e) {
  e.preventDefault();
  const title = document.getElementById('new-proj-title').value.trim();
  const category = document.getElementById('new-proj-cat').value;
  const url = document.getElementById('new-proj-url').value.trim();
  const desc = document.getElementById('new-proj-desc').value.trim();
  const tags = document.getElementById('new-proj-tags').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!title || !url || !desc) {
    alert('Por favor complete título, enlace y reseña');
    return;
  }

  const categoryLabels = {
    'programacion': 'Programación',
    'investigacion': 'Investigación',
    'en-desarrollo': 'En desarrollo'
  };

  const newProject = {
    id: 'proj-' + Date.now(),
    category,
    categoryLabel: categoryLabels[category] || category,
    title,
    url,
    desc,
    tags: tags.length ? tags : ['Web App'],
    badge: 'Nuevo',
    visible: true
  };

  projects.unshift(newProject);
  saveProjectsToServer();
  renderAdminProjectsTable();
  e.target.reset();
  alert('Proyecto agregado exitosamente.');
}

// Avatar upload and persistence
const dashboardPhotoInput = document.getElementById('dashboard-photo-input');

function setupAvatarHandlers() {
  try { localStorage.removeItem('user_avatar'); } catch (e) {}
  if (!dashboardPhotoInput) return;
  dashboardPhotoInput.onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !isAdminLoggedIn) return;
    try {
      const url = await uploadImage(file, 'avatar');
      const { error } = await sb.from('site_settings').upsert({ key: 'avatar_url', value: url, updated_at: new Date().toISOString() });
      if (error) throw error;
      setAvatarSrc(url);
      alert('Foto actualizada exitosamente.');
    } catch (err) {
      alert('No se pudo subir la foto: ' + (err.message || err));
    }
  };
}

// Initial Listeners
document.getElementById('admin-btn').onclick = openAdminModal;
document.getElementById('close-modal-btn').onclick = closeAdminModal;
document.getElementById('login-form').onsubmit = handleLogin;
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.onclick = handleLogout;
document.getElementById('add-article-form').onsubmit = handleAddArticle;
document.getElementById('add-project-form').onsubmit = handleAddProject;

const editProjForm = document.getElementById('edit-project-form');
if (editProjForm) editProjForm.onsubmit = handleSaveEditProject;

const cancelEditProjBtn = document.getElementById('cancel-edit-proj-btn');
if (cancelEditProjBtn) {
  cancelEditProjBtn.onclick = () => {
    document.getElementById('edit-project-box').style.display = 'none';
  };
}

const editArtForm = document.getElementById('edit-article-form');
if (editArtForm) editArtForm.onsubmit = handleSaveEditArticle;

const cancelEditArtBtn = document.getElementById('cancel-edit-art-btn');
if (cancelEditArtBtn) {
  cancelEditArtBtn.onclick = () => {
    document.getElementById('edit-article-box').style.display = 'none';
  };
}

// Batch Visibility Controls for Articles
const btnArtShowAll = document.getElementById('btn-art-show-all');
if (btnArtShowAll) {
  btnArtShowAll.onclick = () => {
    articles.forEach(a => a.visible = true);
    saveArticlesToServer();
    renderAdminTable();
  };
}

const btnArtHideAll = document.getElementById('btn-art-hide-all');
if (btnArtHideAll) {
  btnArtHideAll.onclick = () => {
    articles.forEach(a => a.visible = false);
    saveArticlesToServer();
    renderAdminTable();
  };
}

// Batch Visibility Controls for Projects
const btnProjShowAll = document.getElementById('btn-proj-show-all');
if (btnProjShowAll) {
  btnProjShowAll.onclick = () => {
    projects.forEach(p => {
      if (currentDashProjFilter === 'todos' || p.category === currentDashProjFilter) {
        p.visible = true;
      }
    });
    saveProjectsToServer();
    renderAdminProjectsTable();
  };
}

const btnProjHideAll = document.getElementById('btn-proj-hide-all');
if (btnProjHideAll) {
  btnProjHideAll.onclick = () => {
    projects.forEach(p => {
      if (currentDashProjFilter === 'todos' || p.category === currentDashProjFilter) {
        p.visible = false;
      }
    });
    saveProjectsToServer();
    renderAdminProjectsTable();
  };
}

// Dashboard Projects Category Filter
document.querySelectorAll('.dash-proj-filter').forEach(btn => {
  btn.onclick = () => {
    currentDashProjFilter = btn.dataset.cat;
    renderAdminProjectsTable();
  };
});

// Admin Books & Chapters Management
function renderAdminBooksTable() {
  const tbody = document.getElementById('admin-books-table-body');
  if (!tbody) return;

  tbody.innerHTML = books.map((b, i) => {
    const coverThumb = b.cover || (b.title.includes('1918') ? 'assets/libro_eliva.svg' : 'assets/libro_edunpaz.svg');
    return `
      <tr draggable="true" data-index="${i}">
        <td style="text-align:center;">
          <span class="drag-handle" title="Arrastrar y soltar para mover">⋮⋮</span>
        </td>
        <td style="text-align:center;">
          <input type="checkbox" ${b.visible !== false ? 'checked' : ''} onchange="toggleBookVisibility(${i})">
        </td>
        <td>
          <strong>${esc(b.title)}</strong>
          <div style="font-size:0.78rem; color:var(--ink-faint); margin-top:2px;">${esc(b.authors)}</div>
        </td>
        <td><span class="status-pill">${esc(b.type)}</span></td>
        <td>${esc(b.editor)}</td>
        <td class="mono">${esc(b.year)}</td>
        <td style="text-align:center;">
          <img src="${esc(coverThumb)}" alt="Portada" style="width:28px; height:38px; object-fit:cover; border-radius:2px; cursor:pointer; border:1px solid var(--line-strong);" onclick="triggerBookCoverUpload('${esc(b.id)}')" title="Clic para subir o cambiar foto">
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-edit" onclick="editBook(${i})">Editar</button>
            <button class="btn-sm btn-delete" onclick="deleteBook(${i})">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  makeTableDraggable(tbody, (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= books.length || to >= books.length) return;
    const [moved] = books.splice(from, 1);
    books.splice(to, 0, moved);
    saveBooksToServer();
    renderAdminBooksTable();
  });
}

window.toggleBookVisibility = function(index) {
  books[index].visible = !(books[index].visible !== false);
  saveBooksToServer();
  renderAdminBooksTable();
};

window.editBook = function(index) {
  const b = books[index];
  if (!b) return;

  document.getElementById('edit-book-index').value = index;
  document.getElementById('edit-book-type').value = b.type || 'Libro';
  document.getElementById('edit-book-title').value = b.title || '';
  document.getElementById('edit-book-authors').value = b.authors || '';
  document.getElementById('edit-book-editor').value = b.editor || '';
  document.getElementById('edit-book-year').value = b.year || 2025;
  document.getElementById('edit-book-pages').value = b.pages || '';
  document.getElementById('edit-book-isbn').value = b.isbn || '';
  document.getElementById('edit-book-status').value = b.status || 'Publicado';
  document.getElementById('edit-book-link').value = b.link || '';
  document.getElementById('edit-book-desc').value = b.desc || '';
  document.getElementById('edit-book-citation').value = b.citation || '';

  const box = document.getElementById('edit-book-box');
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function handleSaveEditBook(e) {
  e.preventDefault();
  const index = parseInt(document.getElementById('edit-book-index').value, 10);
  if (isNaN(index) || !books[index]) return;

  const type = document.getElementById('edit-book-type').value;
  const title = document.getElementById('edit-book-title').value.trim();
  const authors = document.getElementById('edit-book-authors').value.trim();
  const editor = document.getElementById('edit-book-editor').value.trim();
  const year = parseInt(document.getElementById('edit-book-year').value.trim(), 10);
  const pages = document.getElementById('edit-book-pages').value.trim() || null;
  const isbn = document.getElementById('edit-book-isbn').value.trim() || null;
  const status = document.getElementById('edit-book-status').value;
  const link = document.getElementById('edit-book-link').value.trim() || null;
  const desc = document.getElementById('edit-book-desc').value.trim();
  const citation = document.getElementById('edit-book-citation').value.trim() || null;

  books[index] = {
    ...books[index],
    type,
    title,
    authors,
    editor,
    year,
    pages,
    isbn,
    status,
    link,
    desc,
    citation
  };

  saveBooksToServer();
  renderAdminBooksTable();
  document.getElementById('edit-book-box').style.display = 'none';
  alert('Obra modificada exitosamente.');
}

window.deleteBook = function(index) {
  if (confirm(`¿Eliminar "${books[index].title}"?`)) {
    books.splice(index, 1);
    saveBooksToServer();
    renderAdminBooksTable();
  }
};

function handleAddBook(e) {
  e.preventDefault();
  const type = document.getElementById('new-book-type').value;
  const title = document.getElementById('new-book-title').value.trim();
  const authors = document.getElementById('new-book-authors').value.trim();
  const editor = document.getElementById('new-book-editor').value.trim();
  const year = parseInt(document.getElementById('new-book-year').value.trim(), 10);
  const pages = document.getElementById('new-book-pages').value.trim() || null;
  const isbn = document.getElementById('new-book-isbn').value.trim() || null;
  const status = document.getElementById('new-book-status').value;
  const link = document.getElementById('new-book-link').value.trim() || null;
  const desc = document.getElementById('new-book-desc').value.trim();
  const citation = document.getElementById('new-book-citation').value.trim() || null;

  const newBook = {
    id: 'book-' + Date.now(),
    type,
    title,
    authors,
    editor,
    year,
    pages,
    isbn,
    status,
    link,
    desc,
    citation,
    visible: true
  };

  books.unshift(newBook);
  saveBooksToServer();
  renderAdminBooksTable();
  e.target.reset();
  alert('Obra agregada exitosamente.');
}

// Book Cover Upload Handler
function setupBookCoverUploadHandler() {
  const input = document.getElementById('book-cover-file-input');
  if (!input) return;

  input.onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !targetBookCoverId || !isAdminLoggedIn) return;
    const bIndex = books.findIndex(b => b.id === targetBookCoverId);
    if (bIndex === -1) return;
    try {
      books[bIndex].cover = await uploadImage(file, 'covers');
      await saveBooksToServer();
      renderAdminBooksTable();
      alert('Portada de libro actualizada con éxito.');
    } catch (err) {
      alert('No se pudo subir la portada: ' + (err.message || err));
    }
  };
}

document.getElementById('dash-tab-articles').onclick = () => switchDashTab('articles');
document.getElementById('dash-tab-projects').onclick = () => switchDashTab('projects');
const dashTabBooksBtn = document.getElementById('dash-tab-books');
if (dashTabBooksBtn) dashTabBooksBtn.onclick = () => switchDashTab('books');

const editBookForm = document.getElementById('edit-book-form');
if (editBookForm) editBookForm.onsubmit = handleSaveEditBook;

const cancelEditBookBtn = document.getElementById('cancel-edit-book-btn');
if (cancelEditBookBtn) {
  cancelEditBookBtn.onclick = () => {
    document.getElementById('edit-book-box').style.display = 'none';
  };
}

const addBookForm = document.getElementById('add-book-form');
if (addBookForm) addBookForm.onsubmit = handleAddBook;

searchEl.addEventListener('input', e => { searchTerm = e.target.value; renderArticles(); });
const clearTopicBtn = document.getElementById('clear-topic');
if (clearTopicBtn) clearTopicBtn.onclick = () => { activeTags.clear(); syncPills(); renderArticles(); };

if (projSearchEl) {
  projSearchEl.addEventListener('input', e => {
    projectSearchTerm = e.target.value;
    renderProjects();
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => renderProjects(btn.dataset.tab);
});

// Load on start
setupAvatarHandlers();
setupBookCoverUploadHandler();
loadAvatar();
loadArticles();
loadProjects();
loadBooks();
restoreSession();

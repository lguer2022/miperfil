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
function renderBooks() {
  if (!booksListEl || !chaptersListEl) return;

  const visibleBooks = books.filter(b => b.visible !== false && b.type === 'Libro');
  const visibleChapters = books.filter(b => b.visible !== false && b.type === 'Capítulo de libro');

  if (booksCountMetaEl) booksCountMetaEl.textContent = `${visibleBooks.length} libros publicados`;
  if (chaptersCountMetaEl) chaptersCountMetaEl.textContent = `${visibleChapters.length} capítulos`;

  // Render books
  booksListEl.innerHTML = visibleBooks.map(b => {
    const coverSrc = b.cover || (b.title.includes('1918') ? 'assets/libro_eliva.svg' : 'assets/libro_edunpaz.svg');
    const descParagraphs = (b.desc || '').split('\n\n').map(p => `<p class="book-desc">${esc(p)}</p>`).join('');

    return `
      <div class="book-card" id="book-card-${esc(b.id)}">
        <div class="book-cover-wrapper">
          <img class="book-cover-3d" id="book-img-${esc(b.id)}" src="${esc(coverSrc)}" alt="Portada de ${esc(b.title)}">
        </div>
        <div>
          <h3 class="book-title">${esc(b.title)}</h3>
          <p class="book-authors">${esc(b.authors)}</p>
          <p class="book-editorial">${esc(b.editor)}</p>

          <div class="book-biblio-box">
            ${b.isbn ? `<div class="book-biblio-item"><span class="book-biblio-label">ISBN</span><span class="book-biblio-val mono">${esc(b.isbn)}</span></div>` : ''}
            ${b.pages ? `<div class="book-biblio-item"><span class="book-biblio-label">Extensión</span><span class="book-biblio-val">${esc(b.pages)}</span></div>` : ''}
            ${b.date ? `<div class="book-biblio-item"><span class="book-biblio-label">Fecha</span><span class="book-biblio-val">${esc(b.date)}</span></div>` : ''}
            <div class="book-biblio-item"><span class="book-biblio-label">Estado</span><span class="book-biblio-val"><span class="status-pill" style="margin:0;">${esc(b.status || 'Publicado')}</span></span></div>
          </div>

          ${descParagraphs}

          ${b.link ? `
            <div style="margin-top:18px;">
              <a class="btn-primary" href="${esc(b.link)}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Descargar libro en acceso abierto (EDUNPAZ)
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Render chapters
  chaptersListEl.innerHTML = visibleChapters.map(c => `
    <div class="chapter-card">
      <span class="chapter-type">${esc(c.type)}</span>
      <h4 class="chapter-title">${esc(c.title)}</h4>
      <div class="chapter-editor">${esc(c.editor)} (${esc(c.year)})</div>
      ${c.citation ? `<div class="chapter-citation">${esc(c.citation)}</div>` : ''}
      <p class="chapter-desc">${esc(c.desc)}</p>
      <div style="margin-top:auto; padding-top:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span class="status-pill" style="margin:0;">${esc(c.status || 'Publicado')}</span>
        <div style="display:flex; gap:8px; align-items:center;">
          ${c.id === 'chap-iaec24' ? `
            <a class="project-link" href="https://iies.aduba.org.ar/2026/02/13/lanzamiento-del-libro-dialogo-interamericano-sobre-inteligencia-artificial-en-educacion-cientifica/" target="_blank" rel="noopener" style="font-size:0.8rem;" title="Ver nota de lanzamiento oficial UBA - IIES">Info IIES ↗</a>
          ` : ''}
          ${c.link ? `
            <a class="btn-sm" style="background:var(--navy); color:#ffffff; font-weight:500; text-decoration:none; padding:5px 12px; border-radius:3px; font-size:0.82rem;" href="${esc(c.link)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 1-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              ${c.link.includes('.pdf') ? 'Leer libro completo (PDF) ↗' : 'Acceder al capítulo (DOI) ↗'}
            </a>
          ` : ''}
        </div>
      </div>
    </div>
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

  // Update tabs active state
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === category);
  });

  const visibleProjects = projects.filter(p => p.visible !== false);

  // Update counts on tabs
  const countTodos = visibleProjects.length;
  const countProg = visibleProjects.filter(p => p.category === 'programacion').length;
  const countInv = visibleProjects.filter(p => p.category === 'investigacion').length;
  const countDes = visibleProjects.filter(p => p.category === 'en-desarrollo').length;

  const countTodosEl = document.getElementById('tab-count-todos');
  const countProgEl = document.getElementById('tab-count-programacion');
  const countInvEl = document.getElementById('tab-count-investigacion');
  const countDesEl = document.getElementById('tab-count-en-desarrollo');

  if (countTodosEl) countTodosEl.textContent = countTodos;
  if (countProgEl) countProgEl.textContent = countProg;
  if (countInvEl) countInvEl.textContent = countInv;
  if (countDesEl) countDesEl.textContent = countDes;

  // Filter by category
  let list = category === 'todos' 
    ? visibleProjects 
    : visibleProjects.filter(p => p.category === category);

  // Filter by search keyword
  const term = (projectSearchTerm || '').trim().toLowerCase();
  if (term) {
    list = list.filter(p => 
      (p.title + ' ' + (p.desc || '') + ' ' + (p.tags ? p.tags.join(' ') : '') + ' ' + (p.url || '')).toLowerCase().includes(term)
    );
  }

  if (projCountMetaEl) {
    projCountMetaEl.textContent = `${list.length} proyectos mostrados`;
  }

  if (list.length === 0) {
    projectsGridEl.innerHTML = `
      <div style="grid-column: 1/-1; padding: 36px 0; text-align: center; color: var(--ink-faint);">
        No se encontraron proyectos en esta categoría con el criterio de búsqueda.
      </div>
    `;
    return;
  }

  projectsGridEl.innerHTML = list.map(p => {
    const domain = p.url ? p.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const tagsHtml = (p.tags || []).map(t => `<span>${esc(t)}</span>`).join('');
    
    // Choose thumbnail or mockup illustration
    const thumbHtml = p.thumb 
      ? `<img class="project-thumb" src="${esc(p.thumb)}" alt="${esc(p.title)}" loading="lazy">`
      : `
        <div class="project-card-header">
          <div class="browser-dots">
            <span class="dot-red"></span>
            <span class="dot-yellow"></span>
            <span class="dot-green"></span>
          </div>
          <span>${esc(domain)}</span>
        </div>
      `;

    return `
      <div class="project-card">
        ${thumbHtml}
        <div class="project-content">
          <div class="project-meta-row">
            <span class="project-category">${esc(p.categoryLabel || p.category)}</span>
            ${p.badge ? `<span class="project-badge">${esc(p.badge)}</span>` : ''}
          </div>
          <h3 class="project-title">${esc(p.title)}</h3>
          <p class="project-desc">${esc(p.desc)}</p>
          ${tagsHtml ? `<div class="project-tags">${tagsHtml}</div>` : ''}
          <div class="project-footer">
            <a class="project-link" href="${esc(p.url)}" target="_blank" rel="noopener">
              Abrir aplicación
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </a>
            <span class="mono" style="font-size:0.75rem; color:var(--ink-faint);">${esc(domain)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Tags
function renderTags() {
  const visibleArticles = articles.filter(a => a.visible !== false);
  const tagCounts = {};
  visibleArticles.forEach(a => {
    (a.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const tags = Object.keys(tagCounts).sort((a,b) => tagCounts[b] - tagCounts[a]);

  tagPillsEl.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'tag-pill ' + (activeTags.size === 0 ? 'active' : '');
  allBtn.textContent = 'Todas';
  allBtn.onclick = () => { activeTags.clear(); syncPills(); renderArticles(); };
  tagPillsEl.appendChild(allBtn);

  tags.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill ' + (activeTags.has(t) ? 'active' : '');
    btn.textContent = `${t} (${tagCounts[t]})`;
    btn.onclick = () => {
      if (activeTags.has(t)) activeTags.delete(t);
      else activeTags.add(t);
      syncPills();
      renderArticles();
    };
    tagPillsEl.appendChild(btn);
  });
}

function syncPills() {
  // Redibuja las etiquetas para que la seleccionada quede resaltada
  renderTags();
}

// Render Articles
function renderArticles() {
  const term = searchTerm.trim().toLowerCase();
  const visible = articles.filter(a => a.visible !== false);

  const filtered = visible.filter(a => {
    const matchSearch = !term || 
      (a.title + ' ' + (a.authors||'') + ' ' + (a.venue||'')).toLowerCase().includes(term);
    const matchTags = activeTags.size === 0 || 
      (a.tags && a.tags.some(t => activeTags.has(t)));
    return matchSearch && matchTags;
  });

  pubCountMetaEl.textContent = `${visible.length} publicaciones visibles`;

  if (filtered.length === 0) {
    pubListEl.innerHTML = `<div style="padding:28px 0; color:var(--ink-faint);">No se encontraron publicaciones con ese criterio.</div>`;
    return;
  }

  const years = [...new Set(filtered.map(a => a.year))].sort((a,b) => b - a);

  pubListEl.innerHTML = years.map(year => {
    const items = filtered.filter(a => a.year === year);
    return `
      <div class="year-group">
        <div class="year-head">
          <span class="num mono">${year}</span>
          <span class="line"></span>
          <span class="count mono">${items.length} ${items.length === 1 ? 'publicación' : 'publicaciones'}</span>
        </div>
        ${items.map((p, idx) => {
          const statusBadge = p.status ? `<span class="status-pill">${esc(p.status)}</span>` : '';
          const titleHtml = p.link 
            ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
            : esc(p.title);
          const tagsHtml = (p.tags || []).map(t => `<span>${esc(t)}</span>`).join('');
          return `
            <div class="pub">
              <span class="idx mono">${idx + 1}.</span>
              <div class="pub-body">
                <div class="pub-title">${titleHtml}${statusBadge}</div>
                <div class="pub-meta">
                  <span class="type">${esc(p.type || 'Artículo')}</span>
                  <span class="dot">·</span>
                  <span class="venue">${esc(p.venue)}</span>
                  ${p.date ? `<span class="dot">·</span>${esc(p.date)}` : ''}
                </div>
                ${p.citation ? `<div style="margin-top:4px; font-size:0.8rem; color:var(--ink-faint);">${esc(p.citation)}</div>` : ''}
                <div class="pub-tags">${tagsHtml}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
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
      <td><span class="status-pill">${esc(a.status || 'Publicado')}</span></td>
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

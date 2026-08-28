// =========== STATE ===========
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'date-desc';
let currentPage = 1;
const ITEMS_PER_PAGE = 9;
let ALL_PROJECTS = []; // Holds normalized live database items
const PROJECT_DETAIL_CACHE = new Map();
let activeModalProjectId = '';
let modalReturnFocus = null;
const siteI18n = window.SiteI18n;
const isEnglish = () => siteI18n?.isEnglish() === true;
const ui = (zh, en) => siteI18n?.t(zh, en) || zh;
const locale = () => siteI18n?.locale() || 'zh-CN';
const displayCategory = value => siteI18n?.category(value) || value;
const displayTag = value => siteI18n?.tag(value) || value;
const caseHref = id => siteI18n?.withLanguage(`case.html?id=${encodeURIComponent(id)}`) || `case.html?id=${encodeURIComponent(id)}`;

const PROJECT_CATEGORY_STYLES = {
  'AI工具': { icon: '🤖', color: '#8b5cf6' },
  'Micro SaaS': { icon: '⚡', color: '#3b82f6' },
  '内容创业': { icon: '✍️', color: '#ec4899' },
  '电商品牌': { icon: '🛒', color: '#f59e0b' },
  '服务类': { icon: '🤝', color: '#6366f1' },
  '知识付费': { icon: '🎓', color: '#a855f7' },
  '本地生意': { icon: '📍', color: '#ef4444' },
  '无代码': { icon: '🔧', color: '#10b981' }
};

const CATEGORY_ALIASES = {
  'AI工具': 'AI工具',
  'AI Tools': 'AI工具',
  'SaaS': 'Micro SaaS',
  'Micro-SaaS': 'Micro SaaS',
  'Micro SaaS': 'Micro SaaS',
  '内容/媒体': '内容创业',
  '内容创业': '内容创业',
  '电商/DTC': '电商品牌',
  '电商品牌': '电商品牌',
  '电商': '电商品牌',
  'DTC': '电商品牌',
  'B2B服务': '服务类',
  '服务类': '服务类',
  '知识付费': '知识付费',
  '在线教育': '知识付费',
  '本地生活': '本地生意',
  '本地服务': '本地生意',
  '本地生意': '本地生意',
  '无代码': '无代码',
  '低代码': '无代码'
};

// =========== INIT ===========
document.addEventListener('DOMContentLoaded', () => {
  // 0. Initialize the login-free local favorites and history library.
  setupLocalLibrary();
  readPageStateFromUrl();

  // 1. Initial render of static featured items
  renderFeatured();
  renderCategoryPills();
  
  // 2. Fetch the database shipped with this exact deployment. Keeping code
  // and data in one immutable artifact avoids mixed GitHub/Cloudflare versions.
  fetch('data/projects_index.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      ALL_PROJECTS = data.map(p => normalizeProject(p));
      renderLocalFavorites();
      renderLocalHistory();
      
      // Update dynamic total stats
      const totalCount = ALL_PROJECTS.length;
      const heroBadge = document.querySelector('.hero-badge');
      if (heroBadge) {
        const template = isEnglish() ? heroBadge.dataset.enTemplate : heroBadge.dataset.zhTemplate;
        heroBadge.innerHTML = `<span class="badge-dot"></span>${template.replace('{count}', `<span id="hero-badge-total">${totalCount.toLocaleString(locale())}+</span>`)}`;
      }
      
      const heroTotalNum = document.getElementById('hero-total-number');
      if (heroTotalNum) {
        heroTotalNum.setAttribute('data-target', totalCount);
        countUpStats(); // Re-trigger smooth stats animation
      }
      
      const totalDbCount = document.getElementById('totalDbCount');
      if (totalDbCount) totalDbCount.innerText = totalCount.toLocaleString(locale()) + (isEnglish() ? '' : '个');
      
      // Initial render for the main projects list
      renderProjects();
    })
    .catch(err => {
      console.warn('[WARN] Failed to fetch deployment database; using curated fallback.', err);
      ALL_PROJECTS = PROJECTS.map(p => normalizeProject(p));
      renderProjects();
    });

  setupSearch();
  setupFilters();
  setupSort();
  setupModal();
  setupSubscribe();
  setupScrollAnimations();
  setupHeader();
  setupMobileMenu();
  setupAiAdvisor(); // Init chatbot listeners
  document.querySelectorAll('.panel-suggestions button').forEach(button => {
    button.addEventListener('click', () => sendSuggestion(isEnglish() ? button.dataset.suggestionEn : button.dataset.suggestionZh));
  });
});

// =========== RENDER FEATURED ===========
function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  const featured = PROJECTS.filter(p => p.featured).map(normalizeProject);
  grid.innerHTML = featured.map(p => createProjectCard(p, true)).join('');
  bindProjectCards(grid);
}

// =========== RENDER PROJECTS ===========
function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('emptyState');
  
  const projectsSection = document.getElementById('projects');
  const categoriesSection = document.getElementById('categories');

  if (!ALL_PROJECTS || ALL_PROJECTS.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    renderPagination(0, 1);
    return;
  }

  let filtered = ALL_PROJECTS.filter(p => {
    const matchFilter = currentFilter === 'all' || p.category.includes(currentFilter) || p.tags.includes(currentFilter);
    const q = currentSearch.toLowerCase();
    const matchSearch = !q || 
      p.name.toLowerCase().includes(q) || 
      p.nameEn.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) || 
      String(p.summaryZh || '').toLowerCase().includes(q) ||
      String(p.summaryEn || '').toLowerCase().includes(q) ||
      p.category.some(c => c.toLowerCase().includes(q)) || 
      p.tags.some(t => t.toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });

  // Sort
  filtered = sortProjects(filtered, currentSort);
  window.LAST_FILTERED_COUNT = filtered.length;

  // Sync category pills active state
  renderCategoryPills();

  // Toggle other sections when search is active
  if (currentSearch && currentSearch.trim().length > 0) {
    if (projectsSection) projectsSection.style.display = 'none';
  } else {
    if (projectsSection) projectsSection.style.display = 'block';
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    renderPagination(0, 1);
  } else {
    empty.style.display = 'none';
    
    // Pagination (3x3 = 9 items per page)
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    grid.innerHTML = pageItems.map(p => createProjectCard(p, false)).join('');
    bindProjectCards(grid);
    
    renderPagination(filtered.length, totalPages);

    // Smooth micro-animation entrance
    setTimeout(() => {
      grid.querySelectorAll('.project-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 15);
      });
    }, 10);
  }
  syncPageStateToUrl();
}

function renderPagination(totalItems, totalPages) {
  const wrapper = document.getElementById('paginationWrapper');
  if (!wrapper) return;

  if (totalItems === 0 || totalPages <= 1) {
    wrapper.style.display = 'none';
    wrapper.innerHTML = '';
    return;
  }

  wrapper.style.display = 'flex';

  let pageNumsHtml = '';
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    pageNumsHtml += `<button class="page-num" aria-label="${ui('第 1 页', 'Page 1')}" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) pageNumsHtml += `<span class="page-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumsHtml += `<button class="page-num ${i === currentPage ? 'active' : ''}" ${i === currentPage ? 'aria-current="page"' : ''} aria-label="${ui(`第 ${i} 页`, `Page ${i}`)}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pageNumsHtml += `<span class="page-ellipsis">...</span>`;
    pageNumsHtml += `<button class="page-num" aria-label="${ui(`第 ${totalPages} 页`, `Page ${totalPages}`)}" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  const prevDisabled = currentPage === 1 ? 'disabled' : '';
  const nextDisabled = currentPage === totalPages ? 'disabled' : '';

  wrapper.innerHTML = `
    <div class="pagination-info">
      ${isEnglish() ? `<strong>${totalItems.toLocaleString(locale())}</strong> businesses · Page ${currentPage} of ${totalPages}` : `共 <strong>${totalItems.toLocaleString(locale())}</strong> 个项目 · 第 ${currentPage} / ${totalPages} 页`}
    </div>
    <div class="pagination-buttons">
      <button class="page-nav-btn" ${prevDisabled} onclick="goToPage(${currentPage - 1})">${ui('← 上一页', '← Previous')}</button>
      ${pageNumsHtml}
      <button class="page-nav-btn" ${nextDisabled} onclick="goToPage(${currentPage + 1})">${ui('下一页 →', 'Next →')}</button>
    </div>
  `;
}

window.goToPage = function(page) {
  if (page < 1) return;
  const totalPages = Math.ceil((window.LAST_FILTERED_COUNT || ALL_PROJECTS.length) / ITEMS_PER_PAGE) || 1;
  if (page > totalPages) return;
  currentPage = page;
  renderProjects();
  const projectsSection = document.getElementById('all-projects');
  if (projectsSection) {
    projectsSection.scrollIntoView({ behavior: 'smooth' });
  }
};

function sortProjects(projects, sort) {
  return [...projects].sort((a, b) => {
    switch (sort) {
      case 'date-desc': return (b.dateVal || 0) - (a.dateVal || 0);
      case 'revenue-desc': return b.revenue - a.revenue;
      case 'revenue-asc': return a.revenue - b.revenue;
      case 'startup-asc': return a.startupCost - b.startupCost;
      case 'days-asc': return a.startupDays - b.startupDays;
      case 'score-desc': return b.replicabilityScore - a.replicabilityScore;
      default: return 0;
    }
  });
}

function bindProjectCards(grid) {
  grid.querySelectorAll('.project-card').forEach(card => {
    const open = () => openModal(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

// =========== CREATE CARD ===========
function createProjectCard(p, featured) {
  const stars = '★'.repeat(Math.round(p.replicabilityScore / 2)) + '☆'.repeat(5 - Math.round(p.replicabilityScore / 2));
  const categoryName = classifyProjectCategory(p);
  const categoryStyle = PROJECT_CATEGORY_STYLES[categoryName];
  const emojiAlpha = hexToRgba(categoryStyle.color, 0.1);
  const isFav = isProjectFavorited(p.id);
  const favIcon = isFav ? '⭐' : '☆';
  const favActive = isFav ? 'active' : '';

  return `
    <article class="project-card fade-in" data-id="${p.id}" style="--card-color:${categoryStyle.color}"
      tabindex="0" aria-label="${ui(`查看${p.name}的项目介绍与商业逻辑`, `View the ${p.name} business case`)}">
      <button class="card-fav-btn ${favActive}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')" title="${isFav ? ui('已收藏', 'Saved') : ui('加入收藏', 'Save')}">
        ${favIcon}
      </button>
      ${featured ? `<span class="featured-badge">${ui('精选', 'Featured')}</span>` : ''}
      <div class="card-header">
        <div class="card-emoji" style="background:${emojiAlpha}" title="${displayCategory(categoryName)}" aria-label="${displayCategory(categoryName)}">${categoryStyle.icon}</div>
        <div class="card-title-group">
          <div class="card-name">${p.name}</div>
        </div>
      </div>
      <div class="card-tags">
        ${p.category.slice(0,2).map(c => `<span class="card-tag">${displayCategory(c)}</span>`).join('')}
        ${p.tags.slice(0,1).map(t => `<span class="card-tag">${displayTag(t)}</span>`).join('')}
      </div>
      <p class="card-summary">${p.summary}</p>
      <div class="card-metrics">
        <div class="metric-item">
          <span class="metric-value gold">${p.revenueDisplay}</span>
          <span class="metric-label">${ui('月营收', 'Monthly revenue')}</span>
        </div>
        <div class="metric-item">
          <span class="metric-value blue">$${formatNum(p.startupCost)}</span>
          <span class="metric-label">${ui('启动成本', 'Startup cost')}</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">${p.startupDays}${ui('天', ' days')}</span>
          <span class="metric-label">${ui('首次盈利', 'Time to revenue')}</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="score-badge">
          <span class="score-stars">${stars}</span>
          <span>${ui('可复制', 'Replicability')} ${p.replicabilityScore}/10</span>
        </div>
        <div class="card-detail-link">${ui('查看完整拆解', 'View deep dive')} <span class="card-arrow">→</span></div>
      </div>
    </article>
  `;
}

// =========== DB CATEGORY PILLS ===========
function renderCategoryPills() {
  const bar = document.getElementById('dbCategoryBar');
  if (!bar) return;

  const items = [
    { name: 'all', label: ui('✨ 全部', '✨ All'), icon: '' },
    ...CATEGORIES.map(c => ({ name: c.name, label: `${c.icon} ${displayCategory(c.name)}` }))
  ];

  bar.innerHTML = items.map(c => `
    <button class="db-category-pill ${currentFilter === c.name ? 'active' : ''}" data-filter="${c.name}">
      ${c.label}
    </button>
  `).join('');

  bar.querySelectorAll('.db-category-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.db-category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentSearch = '';
      currentPage = 1;

      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      if (document.getElementById('searchResultHint')) {
        document.getElementById('searchResultHint').style.display = 'none';
      }

      // Sync hero tags active state if present
      document.querySelectorAll('.filter-tag').forEach(t => {
        if (t.dataset.filter === currentFilter) t.classList.add('active');
        else t.classList.remove('active');
      });

      renderProjects();
    });
  });
}

// =========== SEARCH ===========
function setupSearch() {
  const input = document.getElementById('searchInput');
  const hint = document.getElementById('searchResultHint');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      currentSearch = input.value.trim();
      currentFilter = 'all';
      currentPage = 1;
      document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      const allTag = document.querySelector('.filter-tag[data-filter="all"]');
      if (allTag) allTag.classList.add('active');
      renderProjects();
      
      // Show search result feedback
      if (currentSearch) {
        const q = currentSearch.toLowerCase();
        const count = ALL_PROJECTS.filter(p => {
          return p.name.toLowerCase().includes(q) || 
                 (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
                 p.summary.toLowerCase().includes(q) || 
                 String(p.summaryZh || '').toLowerCase().includes(q) ||
                 String(p.summaryEn || '').toLowerCase().includes(q) ||
                 p.category.some(c => c.toLowerCase().includes(q)) || 
                 p.tags.some(t => t.toLowerCase().includes(q));
        }).length;
        const safeQuery = escapeHtml(currentSearch);
        
        if (hint) {
          hint.style.display = 'block';
          if (count > 0) {
            hint.innerHTML = isEnglish() ? `🎯 Found <strong>${count}</strong> businesses matching “<strong>${safeQuery}</strong>” ↓` : `🎯 找到 <strong>${count}</strong> 个与 “<strong>${safeQuery}</strong>” 相关的项目（点击查看）↓`;
            hint.style.color = '#e67e22';
            hint.style.cursor = 'pointer';
            hint.onclick = () => {
              const projectsSection = document.getElementById('all-projects');
              if (projectsSection) {
                projectsSection.scrollIntoView({ behavior: 'smooth' });
              }
            };
          } else {
            hint.innerHTML = isEnglish() ? `😔 No businesses match “<strong>${safeQuery}</strong>”. Try another keyword.` : `😔 没有找到与 “<strong>${safeQuery}</strong>” 匹配的项目，试试其他关键词。`;
            hint.style.color = '#999';
            hint.style.cursor = 'default';
            hint.onclick = null;
          }
        }
      } else {
        if (hint) hint.style.display = 'none';
      }
    }, 250);
  });
}

// =========== FILTERS ===========
function setupFilters() {
  document.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentSearch = '';
      currentPage = 1;
      document.getElementById('searchInput').value = '';
      renderProjects();
    });
  });
}

// =========== SORT ===========
function setupSort() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
    currentPage = 1;
    renderProjects();
  });
}

function readPageStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  currentSearch = params.get('q') || '';
  currentFilter = params.get('category') || 'all';
  if (!['all', ...CATEGORIES.map(category => category.name)].includes(currentFilter)) currentFilter = 'all';
  currentSort = params.get('sort') || 'date-desc';
  currentPage = Math.max(1, Number(params.get('page')) || 1);
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  if (searchInput) searchInput.value = currentSearch;
  if (sortSelect && [...sortSelect.options].some(option => option.value === currentSort)) {
    sortSelect.value = currentSort;
  } else {
    currentSort = 'date-desc';
  }
}

function syncPageStateToUrl() {
  const params = new URLSearchParams(window.location.search);
  ['q', 'category', 'sort', 'page'].forEach(key => params.delete(key));
  if (currentSearch) params.set('q', currentSearch);
  if (currentFilter !== 'all') params.set('category', currentFilter);
  if (currentSort !== 'date-desc') params.set('sort', currentSort);
  if (currentPage > 1) params.set('page', String(currentPage));
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

// =========== MODAL ===========
function setupModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

async function loadProjectDetail(project) {
  if (PROJECT_DETAIL_CACHE.has(project.id)) return PROJECT_DETAIL_CACHE.get(project.id);
  try {
    const response = await fetch(`data/case_articles/${encodeURIComponent(project.id)}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawArticle = await response.json();
    const article = isEnglish() && rawArticle.translations?.en
      ? { ...rawArticle, ...rawArticle.translations.en }
      : rawArticle;
    const source = rawArticle.project || {};
    const sections = Array.isArray(article.sections) ? article.sections : [];
    const sectionText = pattern => {
      const section = sections.find(item => pattern.test(`${item.kicker || ''} ${item.heading || ''}`));
      return Array.isArray(section?.paragraphs) ? section.paragraphs.join('\n\n') : '';
    };
    const launchSection = sections.find(item => /验证|启动|落地|launch|validation|start/i.test(`${item.kicker || ''} ${item.heading || ''}`));
    const detailed = {
      ...project,
      website: rawArticle.website || source.website || project.website,
      insight: article.opening || source.description || project.insight,
      businessModel: source.businessModel || sectionText(/商业模式|钱从哪里|定价|business model|pricing|revenue/i) || project.businessModel,
      productArch: sectionText(/产品|交付|架构|product|delivery/i) || project.productArch,
      businessLoop: sectionText(/增长|获客|闭环|growth|acquisition|retention/i) || project.businessLoop,
      getStartedPath: Array.isArray(launchSection?.paragraphs) && launchSection.paragraphs.length
        ? launchSection.paragraphs.slice(0, 3)
        : project.getStartedPath,
      chinaOpportunity: source.chinaOpportunity || sectionText(/中国|本土|市场|local|market/i) || project.chinaOpportunity
    };
    PROJECT_DETAIL_CACHE.set(project.id, detailed);
    return detailed;
  } catch (error) {
    console.warn(`[WARN] Detail unavailable for ${project.id}; using index summary.`, error);
    return project;
  }
}

async function openModal(id) {
  const project = ALL_PROJECTS.find(x => x.id === id) || PROJECTS.find(x => x.id === id);
  if (!project) return;

  recordProjectHistory(project);
  activeModalProjectId = id;
  modalReturnFocus = document.activeElement;
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modalContent').innerHTML = `<div class="modal-loading" role="status">${ui('正在加载完整拆解…', 'Loading the complete case…')}</div>`;
  document.getElementById('modalClose').focus();
  const detailed = await loadProjectDetail(project);
  if (activeModalProjectId === id && overlay.classList.contains('open')) renderProjectModal(detailed);
}

function renderProjectModal(p) {
  const content = document.getElementById('modalContent');
  const emojiAlpha = hexToRgba(p.heroColor, 0.08);
  const isFav = isProjectFavorited(p.id);
  const favText = isFav ? ui('⭐ 已收藏', '⭐ Saved') : ui('☆ 收藏案例', '☆ Save case');
  const repPct = Math.min(100, Math.max(0, Number(p.replicabilityScore) || 0) * 10);
  const modalInsight = isEnglish() ? p.summary : p.insight;
  const modalBusinessModel = isEnglish() ? 'See the complete editorial case study for the offer, pricing logic, acquisition channels, operating model, and major risks.' : p.businessModel;
  const modalArch = isEnglish() ? 'Customer need ➔ focused product experience ➔ measurable outcome ➔ payment ➔ retained value' : (p.productArch || '暂无产品架构数据');
  const modalLoop = isEnglish() ? 'Discovery ➔ useful first result ➔ paid conversion ➔ repeat use ➔ referrals and expansion' : (p.businessLoop || '暂无商业闭环数据');

  content.innerHTML = `
    <div class="modal-hero" style="background:linear-gradient(135deg, ${hexToRgba(p.heroColor,0.02)}, transparent)">
      <div class="modal-emoji-wrap" style="background:${emojiAlpha}">${p.heroEmoji}</div>
      <h2 class="modal-name">${p.name}</h2>
      <div class="modal-tags-row" style="margin-bottom:16px">
        ${[...p.category.map(displayCategory), ...p.tags.map(displayTag)].map(t => `<span class="modal-tag">${t}</span>`).join('')}
      </div>
      <p class="modal-summary">${p.summary}</p>
      <div class="modal-links-row" style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="modal-fav-btn" onclick="toggleFavorite('${p.id}'); this.innerText = isProjectFavorited('${p.id}') ? '${ui('⭐ 已收藏', '⭐ Saved')}' : '${ui('☆ 收藏案例', '☆ Save case')}';" style="background:rgba(230, 126, 34, 0.1);color:var(--primary);border:1px solid rgba(230, 126, 34, 0.3);padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
          ${favText}
        </button>
        <a href="${caseHref(p.id)}" class="modal-link-btn modal-source-link">${ui('📖 案例详情', '📖 Full case study')}</a>
        ${p.website ? `<a href="${p.website}" target="_blank" rel="noopener noreferrer" class="modal-link-btn" style="background:var(--accent-blue);color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">${ui('🌐 官网链接', '🌐 Website')}</a>` : ''}
        ${p.twitter_url ? `<a href="${p.twitter_url}" target="_blank" rel="noopener noreferrer" class="modal-link-btn" style="background:#0f172a;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">${ui('🐦 官方 X', '🐦 Official X')}</a>` : ''}
        ${p.github_url ? `<a href="${p.github_url}" target="_blank" rel="noopener noreferrer" class="modal-link-btn" style="background:#334155;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">${ui('🐙 GitHub 开源', '🐙 GitHub')}</a>` : ''}
      </div>
    </div>
    <div class="modal-metrics">
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:${p.heroColor}">${p.revenueDisplay}</span>
        <span class="modal-metric-label">${ui('月营收 (MRR)', 'Monthly revenue')}</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-blue)">$${formatNum(p.startupCost)}</span>
        <span class="modal-metric-label">${ui('启动成本', 'Startup cost')}</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-emerald)">${p.startupDays}${ui('天', ' days')}</span>
        <span class="modal-metric-label">${ui('首次盈利', 'Time to revenue')}</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-purple)">${p.teamSize}${ui('人', '')}</span>
        <span class="modal-metric-label">${ui('团队规模', 'Team size')}</span>
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <div class="modal-tabs">
      <button class="modal-tab-btn active" onclick="switchTab(event, 'basic-info')">${ui('📋 基础解读', '📋 Overview')}</button>
      <button class="modal-tab-btn" onclick="switchTab(event, 'architecture')">${ui('🏗️ 产品与闭环', '🏗️ Product & Loop')}</button>
      <button class="modal-tab-btn" onclick="switchTab(event, 'get-started')">${ui('🚀 快速上手', '🚀 Launch Path')}</button>
    </div>
    
    <div class="modal-body">
      <!-- Tab 1: 基础解读 -->
      <div id="basic-info" class="modal-tab-content active">
        <div class="modal-section">
          <div class="modal-section-title">${ui('💡 创意亮点剖析', '💡 Why it works')}</div>
          <div class="modal-section-content">${modalInsight}</div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('💰 商业模式与收费', '💰 Business model')}</div>
          <div class="modal-section-content">${modalBusinessModel}</div>
        </div>
      </div>
      
      <!-- Tab 2: 产品架构与商业闭环 -->
      <div id="architecture" class="modal-tab-content">
        <div class="modal-section">
          <div class="modal-section-title">${ui('🌐 系统与产品架构', '🌐 Product architecture')}</div>
          <div class="modal-section-content">
            <p>${ui('该项目的核心技术实现流程非常明确，以下是系统架构流向：', 'A compact view of how the product turns customer demand into a paid outcome:')}</p>
            <div class="arch-flow">
              ${modalArch}
            </div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('🔄 商业闭环运转逻辑', '🔄 Business loop')}</div>
          <div class="modal-section-content">
            <p>${ui('本项目的流量循环和交易闭环运转方式：', 'How acquisition, conversion, retention, and expansion reinforce one another:')}</p>
            <div class="loop-flow">
              ${modalLoop}
            </div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('📣 推荐营销获客渠道', '📣 Acquisition channels')}</div>
          <div class="modal-tags-row">
            ${p.marketingChannels.map(c => `<span class="modal-tag">📢 ${c}</span>`).join('')}
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('⚙️ 技术栈与依赖', '⚙️ Technology stack')}</div>
          <div class="modal-tags-row">
            ${p.techStack.map(t => `<span class="modal-tag">🔧 ${t}</span>`).join('')}
          </div>
        </div>
      </div>
      
      <!-- Tab 3: 快速上手与中国落地 -->
      <div id="get-started" class="modal-tab-content">
        <div class="modal-section">
          <div class="modal-section-title">${ui('🛠️ 3步模仿上手指南', '🛠️ Three-step launch path')}</div>
          <div class="modal-section-content">
            ${(isEnglish() ? ['Validate one narrow customer problem and define a measurable outcome.', 'Build the smallest reliable workflow and charge a small group of early adopters.', 'Use customer evidence to improve retention, then scale the strongest acquisition channel.'] : p.getStartedPath).map((step, idx) => `
              <div class="step-card">
                <div class="step-number">${idx + 1}</div>
                <div class="step-text">${step}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('🇨🇳 中国本土落地机会', '🌏 Market adaptation')}</div>
          <div class="modal-china-box modal-section-content">${isEnglish() ? 'Adapt the offer to local buying habits, payment methods, regulations, and distribution channels before scaling.' : p.chinaOpportunity}</div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">${ui('⭐ 综合可复制指数', '⭐ Replicability score')}</div>
          <div class="rep-bar">
            <div class="rep-track">
              <div class="rep-fill" style="width:${repPct}%;background:${p.heroColor}"></div>
            </div>
            <span class="rep-score">${p.replicabilityScore}/10</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function switchTab(event, tabId) {
  // Hide all tab contents
  const contents = document.querySelectorAll('.modal-tab-content');
  contents.forEach(content => content.classList.remove('active'));

  // Deactivate all tab buttons
  const buttons = document.querySelectorAll('.modal-tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  // Show target tab content & activate button
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  activeModalProjectId = '';
  if (modalReturnFocus instanceof HTMLElement) modalReturnFocus.focus();
  modalReturnFocus = null;
}

// =========== SUBSCRIBE ===========
function setupSubscribe() {
  document.getElementById('subscribeBtn').addEventListener('click', () => {
    document.getElementById('subscribeOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  document.getElementById('radarBtn').addEventListener('click', () => {
    document.getElementById('subscribeOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  document.getElementById('subscribeClose').addEventListener('click', () => {
    document.getElementById('subscribeOverlay').classList.remove('open');
    document.body.style.overflow = '';
  });

  document.getElementById('subscribeOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('subscribeOverlay')) {
      document.getElementById('subscribeOverlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  document.getElementById('subSubmit').addEventListener('click', () => {
    document.getElementById('subscribeOverlay').classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => {
      showToast(ui('订阅通道准备中，本站当前不会收集你的联系方式。', 'Subscriptions are being prepared; no contact details are being collected yet.'));
    }, 300);
  });
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,#e2a400,#ea580c);color:#ffffff;
    padding:14px 28px;border-radius:100px;font-weight:700;font-size:15px;
    z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.15);
    animation:fadeInUp 0.3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// =========== SCROLL ANIMATIONS ===========
function setupScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  setTimeout(() => {
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  }, 100);
}

// =========== COUNTER ANIMATION ===========
function countUpStats() {
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target);
    const duration = 1500;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = Math.floor(current).toLocaleString(locale());
    }, 16);
  });
}

// =========== HEADER SCROLL ===========
function setupHeader() {
  window.addEventListener('scroll', () => {
    const header = document.getElementById('site-header');
    if (window.scrollY > 60) {
      header.style.boxShadow = '0 4px 20px -2px rgba(0,0,0,0.03)';
    } else {
      header.style.boxShadow = 'none';
    }
  });
}

function setupMobileMenu() {
  const button = document.getElementById('mobileMenuBtn');
  const nav = document.querySelector('.main-nav');
  if (!button || !nav) return;

  const closeMenu = () => {
    nav.classList.remove('mobile-open');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '☰';
  };

  button.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('mobile-open');
    button.setAttribute('aria-expanded', String(isOpen));
    button.textContent = isOpen ? '✕' : '☰';
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });
}

// =========== UTILS ===========
function formatNum(n) {
  if (n >= 1000) return (n/1000).toFixed(0) + 'K';
  return n;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// =========== NORMALIZE LIVE DATABASE ITEMS ===========
function canonicalCategoryName(value) {
  return CATEGORY_ALIASES[String(value || '').trim()] || '';
}

function classifyProjectCategory(p) {
  const explicitPrimary = Array.isArray(p.category)
    ? canonicalCategoryName(p.category[0])
    : '';
  if (explicitPrimary) return explicitPrimary;

  const values = [
    p.niche,
    ...(Array.isArray(p.tags) ? p.tags : [])
  ].filter(Boolean);

  // Specific business forms take priority over generic AI/SaaS technology tags.
  const priority = ['无代码', '电商品牌', '知识付费', '本地生意', '内容创业', '服务类'];
  for (const target of priority) {
    if (values.some(value => canonicalCategoryName(value) === target)) return target;
  }
  if (values.some(value => canonicalCategoryName(value) === 'AI工具')) return 'AI工具';
  if (values.some(value => canonicalCategoryName(value) === 'Micro SaaS')) return 'Micro SaaS';

  const searchable = [
    ...values,
    p.nameZh,
    p.name,
    p.summary,
    p.businessModel
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');

  const keywordGroups = [
    ['无代码', /无代码|低代码|no[- ]?code|low[- ]?code/i],
    ['电商品牌', /电商|dtc|shopify|亚马逊|消费品牌|实体产品|订阅电商/i],
    ['知识付费', /知识付费|在线教育|教育|课程|培训|训练营|辅导|教练/i],
    ['本地生意', /本地生活|本地服务|线下门店|餐厅|健身房|维修|清洁服务/i],
    ['内容创业', /内容创业|自媒体|创作者|博客|播客|newsletter|媒体业务|个人ip/i],
    ['服务类', /b2b服务|企业服务|咨询|外包|代运营|代理机构|工作室|顾问服务/i]
  ];
  for (const [target, pattern] of keywordGroups) {
    if (pattern.test(searchable)) return target;
  }

  if (/人工智能|ai工具|生成式ai|大模型|gpt/i.test(searchable)) return 'AI工具';
  return 'Micro SaaS';
}

function normalizeProject(p) {
  if (p.nameEn && p.revenueDisplay && p.category) {
    return {
      ...p,
      nameZh: p.name,
      name: isEnglish() ? p.nameEn : p.name,
      summaryZh: p.summary,
      summary: isEnglish()
        ? (p.summaryEn || `A proven ${p.nameEn} business with a practical product, revenue model, and repeatable growth path.`)
        : p.summary
    };
  }

  const rawRevenue = siteI18n?.monthlyRevenue(p.revenue) || 0;
  const revenueDisplay = siteI18n?.monthlyRevenueDisplay(p.revenue) || p.revenue || ui('未披露', 'Not disclosed');

  let rawCost = 0;
  if (p.startupCost && typeof p.startupCost === 'string') {
    const costMatch = p.startupCost.replace(/,/g, '').match(/\$?(\d+)/);
    if (costMatch) {
      rawCost = parseInt(costMatch[1]);
    }
  }

  let rawDays = 30;
  if (p.timeToRevenue && typeof p.timeToRevenue === 'string') {
    const daysMatch = p.timeToRevenue.match(/(\d+)\s*(?:个)?月/);
    if (daysMatch) {
      rawDays = parseInt(daysMatch[1]) * 30;
    }
  }

  const primaryCategory = classifyProjectCategory(p);
  const category = [primaryCategory];
  const tags = p.tags || [];

  const cnTitle = getChineseName(p);
  const enTitle = (p.name && !/[\u4e00-\u9fff]/.test(p.name)) ? p.name : (p.slug ? p.slug.replace(/-/g, ' ').toUpperCase() : 'AI PROJECT');

  let dateVal = 0;
  if (p.scrapedAt) dateVal = new Date(p.scrapedAt).getTime() || 0;
  else if (p.updatedAt) dateVal = new Date(p.updatedAt).getTime() || 0;

  return {
    id: p.id || Math.random().toString(36).substr(2, 9),
    name: isEnglish() ? enTitle : cnTitle,
    nameZh: cnTitle,
    nameEn: enTitle,
    dateVal: dateVal,
    category: category,
    tags: tags,
    revenue: rawRevenue,
    revenueDisplay: revenueDisplay,
    startupCost: rawCost,
    startupDays: rawDays,
    replicabilityScore: p.replicabilityScore || 7,
    featured: p.featured || false,
    heroEmoji: PROJECT_CATEGORY_STYLES[primaryCategory].icon,
    heroColor: PROJECT_CATEGORY_STYLES[primaryCategory].color,
    summary: isEnglish()
      ? (siteI18n?.cleanEnglishDescription(p.summaryEn || p.metaDesc || p.description) || 'Explore the complete product, revenue model, growth loop, and launch path.')
      : (p.summary || p.description || '暂无项目介绍'),
    summaryZh: p.summary || p.description || '暂无项目介绍',
    summaryEn: siteI18n?.cleanEnglishDescription(p.summaryEn || p.metaDesc || p.description) || '',
    insight: p.insight || p.description || '暂无商业解读',
    businessModel: p.businessModel || '订阅付费/按量收费',
    productArch: p.productArch || '用户入口 ➔ AI运算 ➔ 支付结算',
    businessLoop: p.businessLoop || '【引流】线上SEO ➔ 【体验】免费额度 ➔ 【变现】订阅升级 ➔ 【留存】粘性数据',
    getStartedPath: p.getStartedPath || [
      '第一步：用1天跑通MVP模型，快速收集第一批国内用户反馈。',
      '第二步：选择开源低代码模板，1周内完成支付与用户系统集成。',
      '第三步：利用微信公众号/小红书引流，完成第一笔收费转化。'
    ],
    chinaOpportunity: p.chinaOpportunity || '国内在该垂直细分领域需求旺盛，适合快速复刻落地。',
    marketingChannels: p.tags ? p.tags.slice(0, 3) : ['社交媒体', '内容营销'],
    techStack: p.tags ? p.tags.slice(2, 5) : ['Node.js', 'LLM API'],
    teamSize: p.difficulty === '高' ? 3 : (p.difficulty === '中' ? 2 : 1)
  };
}

// =========== AI BUSINESS ADVISOR CHATBOT LOGIC ===========
function setupAiAdvisor() {
  const bubble = document.getElementById('aiAdvisorBubble');
  const panel = document.getElementById('aiAdvisorPanel');
  const closeBtn = document.getElementById('panelCloseBtn');
  const sendBtn = document.getElementById('sendAiMessageBtn');
  const input = document.getElementById('aiMessageInput');

  if (!bubble || !panel) return;

  bubble.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      input.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Send message
  let isSending = false;
  async function handleSend() {
    const text = input.value.trim();
    if (!text || isSending) return;
    isSending = true;
    input.disabled = true;
    sendBtn.disabled = true;
    
    appendMessage(text, 'user-msg');
    input.value = '';
    
    const matches = findBestMatches(text);
    const typingId = appendMessage(ui('🤖 Cloudflare AI 正在结合项目大盘生成建议...', '🤖 Cloudflare AI is analyzing the business database...'), 'bot-msg');

    try {
      const detailedMatches = await Promise.all(matches.map(loadProjectDetail));
      const reply = await requestAdvisorResponse(text, detailedMatches);
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      appendMessage(reply, 'bot-msg', matches);
    } catch (error) {
      console.warn('[WARN] Cloudflare AI unavailable; using local advisor fallback.', error);
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      appendMessage(generateAdvisorFallbackResponse(text, matches), 'bot-msg', matches);
    } finally {
      isSending = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSend();
  });
}

// Global Suggestion Trigger
window.sendSuggestion = function(text) {
  const panel = document.getElementById('aiAdvisorPanel');
  const input = document.getElementById('aiMessageInput');
  if (panel && input) {
    panel.classList.add('open');
    input.value = text;
    document.getElementById('sendAiMessageBtn').click();
  }
};

async function requestAdvisorResponse(query, matches) {
  const projects = matches.map(p => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    revenue: p.revenueDisplay,
    category: p.category,
    businessModel: p.businessModel,
    chinaOpportunity: p.chinaOpportunity,
    productArch: p.productArch,
    businessLoop: p.businessLoop
  }));

  const response = await fetch('/api/advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, projects, language: isEnglish() ? 'en' : 'zh' })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    throw new Error(payload.error || `Advisor request failed with status ${response.status}`);
  }
  return payload.answer.trim();
}

function getChineseName(p) {
  if (!p) return '';
  if (p.nameZh && /[\u4e00-\u9fff]/.test(p.nameZh)) {
    return p.nameZh;
  }
  if (p.name && /[\u4e00-\u9fff]/.test(p.name)) {
    return p.name;
  }
  if (p.summary) {
    const parts = p.summary.split(/[，；。：,;.:]/);
    if (parts[0] && parts[0].trim().length > 0) {
      let shortName = parts[0].trim();
      if (shortName.length > 20) {
        shortName = shortName.substring(0, 20) + '...';
      }
      return shortName;
    }
  }
  return p.nameEn || p.name || '出海项目';
}

function appendMessage(text, className, matches = []) {
  const messagesWrap = document.getElementById('panelMessages');
  const msg = document.createElement('div');
  const id = 'msg-' + Math.random().toString(36).substr(2, 9);
  msg.id = id;
  msg.className = `msg ${className}`;
  
  let html = escapeHtml(String(text))
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  
  if (matches && matches.length > 0) {
    html += `<div style="margin-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 6px; font-weight:700;">${ui('💡 关联大盘推荐项目（点击直达架构拆解）：', '💡 Related cases from the database:')}</div>`;
    matches.forEach(p => {
      html += `
        <a class="chat-project-link" href="javascript:void(0);" onclick="openModal('${p.id}')">
          ${p.heroEmoji} 【${displayCategory(p.category[0])}】${p.name} · ${ui('月入', 'Revenue')} ${p.revenueDisplay}
        </a>
      `;
    });
  }

  msg.innerHTML = html;
  messagesWrap.appendChild(msg);
  messagesWrap.scrollTop = messagesWrap.scrollHeight;
  return id;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function findBestMatches(query) {
  if (!ALL_PROJECTS || ALL_PROJECTS.length === 0) return [];
  const q = query.toLowerCase();
  
  const stopWords = ['我想', '做', '一个', '什么', '推荐', '有适合', '如何', '怎么', '的', '了', '吗', '？', '，', '。', '想做', '工具', '生意', '项目', '快速', '如何冷启动', '冷启动', '个人', '适合', '开发'];
  let cleanQuery = q;
  stopWords.forEach(w => {
    cleanQuery = cleanQuery.split(w).join(' ');
  });
  
  const tokens = cleanQuery.split(/[\s,./?#@!%^&*()_+\-=\[\]{};':"\\|<>，。？、！；：]+/).filter(t => t.trim().length > 0);
  if (tokens.length === 0) tokens.push(q);

  const scored = ALL_PROJECTS.map(p => {
    let score = 0;
    if (p.name.toLowerCase().includes(q)) score += 50;
    if (p.summary.toLowerCase().includes(q)) score += 20;

    tokens.forEach(tok => {
      if (p.name.toLowerCase().includes(tok)) score += 20;
      if (p.summary.toLowerCase().includes(tok)) score += 10;
      if (p.insight && p.insight.toLowerCase().includes(tok)) score += 5;
      if (p.category && p.category.some(c => c.toLowerCase().includes(tok))) score += 15;
      if (p.tags && p.tags.some(t => t.toLowerCase().includes(tok))) score += 12;
    });

    return { project: p, score: score };
  });

  const filtered = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  return filtered.slice(0, 3).map(s => s.project);
}

function generateAdvisorFallbackResponse(query, matches) {
  if (isEnglish()) {
    const reference = matches[0];
    return reference
      ? `Cloudflare AI is temporarily unavailable, so here is a database-backed starting point.\n\n**Closest case: ${reference.name}**\n${reference.summary}\n\n**Three-step test**\n1. Choose one narrow customer and one measurable outcome.\n2. Build the smallest paid workflow and recruit five early adopters.\n3. Measure activation, repeat use, and willingness to pay before investing in broader acquisition.`
      : 'Cloudflare AI is temporarily unavailable. Choose one narrow customer problem, build the smallest paid workflow, and validate willingness to pay with five early adopters before scaling acquisition.';
  }
  if (matches.length === 0) {
    return `当前 Cloudflare AI 免费额度暂时不可用，先为你提供本地项目库分析。

关于你提到的“${query}”，目前在项目大盘中没有完全重合的垂直案例，可以参考「AI工具」或「Micro-SaaS」路径：

1. **MVP 极速上线**：先用成熟组件和 Cloudflare Workers AI 做一个极简页面，验证核心需求。
2. **本土冷启动**：在中国市场利用小红书发布解决痛点的短视频或图文，引流私域微信群。
3. **闭环变现**：前期通过国内爱发电或直接微信扫码支付提供周卡/月卡，验证用户的真金白银付费意愿。`;
  }

  const p1 = matches[0];
  const cnName = getChineseName(p1);

  let reply = `当前 Cloudflare AI 免费额度暂时不可用，先为你提供本地项目库分析。\n\n`;
  reply += `🧠 **商业顾问分析报告：**\n根据你的想法，项目库匹配到案例 **${cnName}**（营收数据 **${p1.revenueDisplay}**）。\n\n`;
  reply += `💡 **核心商业逻辑**：\n该项目成功的关键在于 **${p1.summary}**。它以极低的团队成本（团队通常仅有 1 人），通过精细的流量获客，实现了超高利润率。\n\n`;
  reply += `🇨🇳 **中国本土落地冷启动方案**：\n`;
  reply += `1. **系统验证**：先使用 Cloudflare Workers AI 免费额度验证核心智能功能，再根据真实使用量决定是否扩容。\n`;
  reply += `2. **精准获客**：放弃高昂的搜索引擎竞价，转为在小红书、即刻或掘金等垂直社区发布“痛点实战解决方案”相关图文，自动引流私域粉丝。\n`;
  reply += `3. **支付闭环**：使用国内免签支付接口（如虎皮椒或面包多），在微信小程序内直接完成订阅转化，当天即可看到首笔现金流。`;

  return reply;
}

// =========== LOGIN-FREE LOCAL PROJECT LIBRARY ===========
const FAVORITES_KEY = 'ai_shengyi_favorites';
const HISTORY_KEY = 'ai_shengyi_history';

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function migrateLegacyLibraryData() {
  const favorites = new Set(readLocalArray(FAVORITES_KEY));
  const historyById = new Map(
    readLocalArray(HISTORY_KEY)
      .filter(item => item && item.id)
      .map(item => [item.id, item])
  );
  const legacyKeys = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;

    if (key.startsWith('ai_shengyi_fav_')) {
      readLocalArray(key).forEach(id => favorites.add(id));
      legacyKeys.push(key);
    }

    if (key.startsWith('ai_shengyi_hist_')) {
      readLocalArray(key).forEach(item => {
        if (!item || !item.id) return;
        const existing = historyById.get(item.id);
        if (!existing || Number(item.timestamp || 0) > Number(existing.timestamp || 0)) {
          historyById.set(item.id, item);
        }
      });
      legacyKeys.push(key);
    }
  }

  const history = [...historyById.values()]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 50);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

  legacyKeys.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem('ai_shengyi_user');
  localStorage.removeItem('ai_shengyi_analytics');
}

function isProjectFavorited(id) {
  const favs = readLocalArray(FAVORITES_KEY);
  return favs.includes(id);
}

function toggleFavorite(id) {
  let favs = readLocalArray(FAVORITES_KEY);
  
  if (favs.includes(id)) {
    favs = favs.filter(f => f !== id);
  } else {
    favs.push(id);
  }

  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  renderProjects();
  renderLocalFavorites();
}

function recordProjectHistory(project) {
  if (!project || !project.id) return;
  let history = readLocalArray(HISTORY_KEY);
  
  history = history.filter(h => h.id !== project.id);
  const now = new Date();
  const timeStr = isEnglish()
    ? now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  history.unshift({
    id: project.id,
    name: project.name,
    time: timeStr,
    timestamp: now.getTime()
  });

  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function setupLocalLibrary() {
  migrateLegacyLibraryData();

  const openBtn = document.getElementById('headerLibraryBtn');
  const overlay = document.getElementById('libraryOverlay');
  const closeBtn = document.getElementById('libraryClose');

  function openLibraryTab(tabName) {
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.querySelectorAll('.library-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.library-panel').forEach(panel => {
      panel.style.display = 'none';
    });
    const panelId = 'libraryPanel' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = 'block';
    if (tabName === 'favorites') renderLocalFavorites();
    if (tabName === 'history') renderLocalHistory();
  }

  if (openBtn) openBtn.addEventListener('click', () => openLibraryTab('favorites'));
  if (closeBtn) closeBtn.addEventListener('click', () => {
    if (overlay) overlay.style.display = 'none';
  });
  if (overlay) {
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.style.display = 'none';
    });
  }
  document.querySelectorAll('.library-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => openLibraryTab(btn.dataset.tab));
  });
}

function renderLocalFavorites() {
  const grid = document.getElementById('favGrid');
  const countEl = document.getElementById('favCount');
  if (!grid) return;

  const favIds = readLocalArray(FAVORITES_KEY);
  if (countEl) countEl.innerText = favIds.length;

  if (favIds.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1;">${ui('🌟 暂无收藏项目，浏览大盘点击卡片右上角 ⭐ 即可收藏案例！', '🌟 No saved cases yet. Select ⭐ on any business card to save it.')}</p>`;
    return;
  }

  const favProjects = ALL_PROJECTS.filter(p => favIds.includes(p.id));
  grid.innerHTML = favProjects.map(p => `
    <div class="fav-card" onclick="openModal('${p.id}')" style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;position:relative;">
      <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px;">${p.heroEmoji} ${p.name}</div>
      <div style="font-size:12px;color:var(--primary);font-weight:700;">${p.revenueDisplay} / ${ui('月', 'month')}</div>
      <button onclick="event.stopPropagation(); toggleFavorite('${p.id}')" style="margin-top:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">${ui('取消收藏', 'Remove')}</button>
    </div>
  `).join('');
}

function renderLocalHistory() {
  const timeline = document.getElementById('historyTimeline');
  const countEl = document.getElementById('historyCount');
  if (!timeline) return;

  const history = readLocalArray(HISTORY_KEY);
  if (countEl) countEl.innerText = history.length;

  if (history.length === 0) {
    timeline.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${ui('🕒 暂无浏览历史，点击任意案例弹窗开始探索吧！', '🕒 No browsing history yet. Open any case to start exploring.')}</p>`;
    return;
  }

  timeline.innerHTML = history.map(item => `
    <div class="history-item" onclick="openModal('${item.id}')">
      <div class="history-left">
        <strong>${item.name}</strong>
      </div>
      <div class="history-time" style="font-size:12px;color:var(--text-muted);">${item.time}</div>
    </div>
  `).join('');
}

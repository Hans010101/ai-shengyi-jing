const CASES_PER_PAGE = 24;
const CATEGORY_ICONS = {
  'AI工具': '🤖',
  'SaaS': '⚡',
  '电商/DTC': '🛒',
  '内容/媒体': '✍️',
  '开发者工具': '🔧',
  '营销工具': '📣',
  'B2B服务': '🤝',
  '健康/生活': '🌿',
  '游戏/娱乐': '🎮',
  '金融/支付': '💳',
  '其他': '💡'
};

let caseProjects = [];
let activeCategory = '全部';
let caseSearch = '';
let caseSort = 'latest';
let casePage = 1;

document.addEventListener('DOMContentLoaded', async () => {
  bindCaseDirectoryControls();
  readDirectoryStateFromUrl();
  try {
    const response = await fetch('data/projects_live.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = await response.json();
    caseProjects = projects.map(normalizeCaseProject).filter(project => project.id);
    document.getElementById('caseTotalCount').textContent = caseProjects.length.toLocaleString('zh-CN');
    renderCaseDirectory();
  } catch (error) {
    document.getElementById('caseResultSummary').textContent = '案例目录暂时无法加载，请稍后刷新。';
    document.getElementById('caseDirectoryEmpty').hidden = false;
    console.warn('[WARN] Case directory unavailable.', error);
  }
});

function bindCaseDirectoryControls() {
  const searchInput = document.getElementById('caseSearchInput');
  const clearButton = document.getElementById('caseSearchClear');
  const sortSelect = document.getElementById('caseSortSelect');

  searchInput.addEventListener('input', () => {
    caseSearch = searchInput.value.trim();
    casePage = 1;
    renderCaseDirectory();
  });
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    caseSearch = '';
    casePage = 1;
    searchInput.focus();
    renderCaseDirectory();
  });
  sortSelect.addEventListener('change', () => {
    caseSort = sortSelect.value;
    casePage = 1;
    renderCaseDirectory();
  });
}

function readDirectoryStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  activeCategory = params.get('category') || '全部';
  caseSearch = params.get('q') || '';
  document.getElementById('caseSearchInput').value = caseSearch;
}

function normalizeCaseProject(project) {
  return {
    id: String(project.id || ''),
    name: String(project.nameZh || project.name || '未命名案例'),
    summary: String(project.summary || '查看完整商业模式、增长闭环与落地路径。'),
    category: String(project.niche || '其他'),
    tags: Array.isArray(project.tags) ? project.tags.map(String) : [],
    revenue: String(project.revenue || '未披露'),
    revenueValue: parseRevenue(project.revenue),
    score: Number(project.replicabilityScore || 0),
    image: String(project.image || ''),
    updatedAt: Date.parse(project.updatedAt || project.scrapedAt || '') || 0
  };
}

function parseRevenue(value) {
  const match = String(value || '').replace(/,/g, '').match(/\$([\d.]+)\s*([KkMm]?)/);
  if (!match) return 0;
  const multiplier = match[2].toLowerCase() === 'm' ? 1000000 : match[2].toLowerCase() === 'k' ? 1000 : 1;
  return Number(match[1]) * multiplier;
}

function filteredCaseProjects() {
  const query = caseSearch.toLocaleLowerCase('zh-CN');
  const filtered = caseProjects.filter(project => {
    const categoryMatch = activeCategory === '全部' || project.category === activeCategory;
    const searchText = [project.name, project.summary, project.category, ...project.tags].join(' ').toLocaleLowerCase('zh-CN');
    return categoryMatch && (!query || searchText.includes(query));
  });

  return filtered.sort((a, b) => {
    if (caseSort === 'revenue') return b.revenueValue - a.revenueValue;
    if (caseSort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    return b.updatedAt - a.updatedAt || b.revenueValue - a.revenueValue;
  });
}

function renderCaseDirectory() {
  if (!caseProjects.length) return;
  const filtered = filteredCaseProjects();
  const totalPages = Math.max(1, Math.ceil(filtered.length / CASES_PER_PAGE));
  casePage = Math.min(casePage, totalPages);
  const start = (casePage - 1) * CASES_PER_PAGE;
  const visible = filtered.slice(start, start + CASES_PER_PAGE);

  renderCaseCategories();
  document.getElementById('caseDirectoryGrid').innerHTML = visible.map(caseCardHtml).join('');
  document.getElementById('caseDirectoryEmpty').hidden = filtered.length !== 0;
  document.getElementById('caseResultSummary').textContent = `${activeCategory === '全部' ? '全部分类' : activeCategory} · 共 ${filtered.length.toLocaleString('zh-CN')} 篇案例`;
  renderCasePagination(filtered.length, totalPages);
  syncDirectoryUrl();
}

function renderCaseCategories() {
  const counts = new Map();
  caseProjects.forEach(project => counts.set(project.category, (counts.get(project.category) || 0) + 1));
  const categories = ['全部', ...Object.keys(CATEGORY_ICONS).filter(category => counts.has(category))];
  const bar = document.getElementById('caseCategoryBar');
  bar.innerHTML = categories.map(category => {
    const count = category === '全部' ? caseProjects.length : counts.get(category);
    const icon = category === '全部' ? '✨' : CATEGORY_ICONS[category];
    return `<button type="button" class="case-category-pill${activeCategory === category ? ' active' : ''}" data-category="${escapeAttr(category)}" aria-pressed="${activeCategory === category}"><span>${icon} ${escapeHtml(category)}</span><small>${count.toLocaleString('zh-CN')}</small></button>`;
  }).join('');

  bar.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      casePage = 1;
      renderCaseDirectory();
      document.getElementById('directoryTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function caseCardHtml(project) {
  const icon = CATEGORY_ICONS[project.category] || '💡';
  const visual = project.image
    ? `<img src="${escapeAttr(project.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="case-card-placeholder" aria-hidden="true">${icon}</span>`;
  return `<article class="case-directory-card">
    <a class="case-card-visual" href="case.html?id=${encodeURIComponent(project.id)}" aria-label="查看${escapeAttr(project.name)}案例详情">${visual}<span>${escapeHtml(project.category)}</span></a>
    <div class="case-card-body">
      <div class="case-card-meta"><span>${icon} ${escapeHtml(project.category)}</span><span>可复制 ${project.score || '—'}/10</span></div>
      <h3><a href="case.html?id=${encodeURIComponent(project.id)}">${escapeHtml(project.name)}</a></h3>
      <p>${escapeHtml(project.summary)}</p>
      <div class="case-card-footer"><span><small>营收口径</small><strong>${escapeHtml(project.revenue)}</strong></span><a href="case.html?id=${encodeURIComponent(project.id)}">阅读案例详情 <b>→</b></a></div>
    </div>
  </article>`;
}

function renderCasePagination(totalItems, totalPages) {
  const nav = document.getElementById('casePagination');
  if (!totalItems || totalPages <= 1) {
    nav.innerHTML = '';
    return;
  }
  const pages = [];
  const start = Math.max(1, Math.min(casePage - 2, totalPages - 4));
  const end = Math.min(totalPages, Math.max(5, casePage + 2));
  for (let page = start; page <= end; page += 1) pages.push(page);
  nav.innerHTML = `<button type="button" data-page="${casePage - 1}" ${casePage === 1 ? 'disabled' : ''}>← 上一页</button>${pages.map(page => `<button type="button" data-page="${page}" class="${page === casePage ? 'active' : ''}" aria-current="${page === casePage ? 'page' : 'false'}">${page}</button>`).join('')}<button type="button" data-page="${casePage + 1}" ${casePage === totalPages ? 'disabled' : ''}>下一页 →</button>`;
  nav.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      casePage = Number(button.dataset.page);
      renderCaseDirectory();
      document.getElementById('directoryTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function syncDirectoryUrl() {
  const params = new URLSearchParams();
  if (activeCategory !== '全部') params.set('category', activeCategory);
  if (caseSearch) params.set('q', caseSearch);
  const suffix = params.toString() ? `?${params.toString()}` : window.location.pathname;
  window.history.replaceState(null, '', suffix);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

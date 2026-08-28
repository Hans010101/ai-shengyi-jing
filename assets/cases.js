const CASES_PER_PAGE = 24;
const directoryI18n = window.SiteI18n;
const directoryText = (zh, en) => directoryI18n?.t(zh, en) ?? zh;
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
    const response = await fetch('data/projects_index.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = await response.json();
    caseProjects = projects.map(normalizeCaseProject).filter(project => project.id);
    document.getElementById('caseTotalCount').textContent = caseProjects.length.toLocaleString(directoryI18n?.locale() || 'zh-CN');
    renderCaseDirectory();
  } catch (error) {
    document.getElementById('caseResultSummary').textContent = directoryText('案例目录暂时无法加载，请稍后刷新。', 'The case directory is temporarily unavailable. Please refresh shortly.');
    document.getElementById('caseDirectoryEmpty').hidden = false;
    console.warn('[WARN] Case directory unavailable.', error);
  }
});

function bindCaseDirectoryControls() {
  const searchInput = document.getElementById('caseSearchInput');
  const clearButton = document.getElementById('caseSearchClear');
  const sortSelect = document.getElementById('caseSortSelect');

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      caseSearch = searchInput.value.trim();
      casePage = 1;
      renderCaseDirectory();
    }, 150);
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
  caseSort = params.get('sort') || 'latest';
  casePage = Math.max(1, Number(params.get('page')) || 1);
  document.getElementById('caseSearchInput').value = caseSearch;
  const sortSelect = document.getElementById('caseSortSelect');
  if ([...sortSelect.options].some(option => option.value === caseSort)) sortSelect.value = caseSort;
  else caseSort = 'latest';
}

function normalizeCaseProject(project) {
  return {
    id: String(project.id || ''),
    name: directoryI18n?.projectName(project) || String(project.nameZh || project.name || '未命名案例'),
    nameZh: String(project.nameZh || ''),
    nameEn: String(project.name || ''),
    summary: directoryI18n?.projectSummary(project) || String(project.summary || '查看完整商业模式、增长闭环与落地路径。'),
    summaryZh: String(project.summary || ''),
    summaryEn: String(project.metaDesc || project.description || ''),
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
  return directoryI18n?.monthlyRevenue(value) || 0;
}

function filteredCaseProjects() {
  const query = caseSearch.toLocaleLowerCase(directoryI18n?.locale() || 'zh-CN');
  const filtered = caseProjects.filter(project => {
    const categoryMatch = activeCategory === '全部' || project.category === activeCategory;
    const searchText = [project.name, project.nameZh, project.nameEn, project.summary, project.summaryZh, project.summaryEn, project.category, ...project.tags].join(' ').toLocaleLowerCase(directoryI18n?.locale() || 'zh-CN');
    return categoryMatch && (!query || searchText.includes(query));
  });

  return filtered.sort((a, b) => {
    if (caseSort === 'revenue') return b.revenueValue - a.revenueValue;
    if (caseSort === 'name') return a.name.localeCompare(b.name, directoryI18n?.locale() || 'zh-CN');
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
  const categoryLabel = activeCategory === '全部' ? directoryText('全部分类', 'All categories') : (directoryI18n?.category(activeCategory) || activeCategory);
  document.getElementById('caseResultSummary').textContent = directoryText(`${categoryLabel} · 共 ${filtered.length.toLocaleString('zh-CN')} 篇案例`, `${categoryLabel} · ${filtered.length.toLocaleString('en-US')} case studies`);
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
    return `<button type="button" class="case-category-pill${activeCategory === category ? ' active' : ''}" data-category="${escapeAttr(category)}" aria-pressed="${activeCategory === category}"><span>${icon} ${escapeHtml(directoryI18n?.category(category) || category)}</span><small>${count.toLocaleString(directoryI18n?.locale() || 'zh-CN')}</small></button>`;
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
    ? `<img src="${escapeAttr(project.image)}" alt="${escapeAttr(project.name)}" loading="lazy" decoding="async" width="640" height="360" referrerpolicy="no-referrer">`
    : `<span class="case-card-placeholder" aria-hidden="true">${icon}</span>`;
  const href = directoryI18n?.withLanguage(`case.html?id=${encodeURIComponent(project.id)}`) || `case.html?id=${encodeURIComponent(project.id)}`;
  const category = directoryI18n?.category(project.category) || project.category;
  return `<article class="case-directory-card">
    <a class="case-card-visual" href="${escapeAttr(href)}" aria-label="${escapeAttr(directoryText(`查看${project.name}案例详情`, `Read the ${project.name} case study`))}">${visual}<span>${escapeHtml(category)}</span></a>
    <div class="case-card-body">
      <div class="case-card-meta"><span>${icon} ${escapeHtml(category)}</span><span>${directoryText('可复制', 'Replicability')} ${project.score || '—'}/10</span></div>
      <h3><a href="${escapeAttr(href)}">${escapeHtml(project.name)}</a></h3>
      <p>${escapeHtml(project.summary)}</p>
      <div class="case-card-footer"><span><small>${directoryText('营收口径', 'Revenue reference')}</small><strong>${escapeHtml(project.revenue)}</strong></span><a href="${escapeAttr(href)}">${directoryText('阅读案例详情', 'Read case study')} <b>→</b></a></div>
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
  nav.innerHTML = `<button type="button" data-page="${casePage - 1}" ${casePage === 1 ? 'disabled' : ''}>← ${directoryText('上一页', 'Previous')}</button>${pages.map(page => `<button type="button" data-page="${page}" class="${page === casePage ? 'active' : ''}" aria-current="${page === casePage ? 'page' : 'false'}">${page}</button>`).join('')}<button type="button" data-page="${casePage + 1}" ${casePage === totalPages ? 'disabled' : ''}>${directoryText('下一页', 'Next')} →</button>`;
  nav.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      casePage = Number(button.dataset.page);
      renderCaseDirectory();
      document.getElementById('directoryTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function syncDirectoryUrl() {
  const params = new URLSearchParams(window.location.search);
  ['category', 'q', 'sort', 'page'].forEach(key => params.delete(key));
  if (activeCategory !== '全部') params.set('category', activeCategory);
  if (caseSearch) params.set('q', caseSearch);
  if (caseSort !== 'latest') params.set('sort', caseSort);
  if (casePage > 1) params.set('page', String(casePage));
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

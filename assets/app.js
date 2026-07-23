// =========== STATE ===========
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'date-desc';
let currentPage = 1;
const ITEMS_PER_PAGE = 9;
let ALL_PROJECTS = []; // Holds normalized live database items

// =========== INIT ===========
document.addEventListener('DOMContentLoaded', () => {
  // 0. Init Auth, Analytics, Member & Admin listeners
  initAuthAndAnalytics();

  // 1. Initial render of static featured items
  renderFeatured();
  renderCategoryPills();
  
  // 2. Fetch live full database asynchronously
  // Use GitHub raw CDN (CORS open) as primary source; fallback to relative path for local dev
  const DATA_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'data/projects_live.json'
    : 'https://raw.githubusercontent.com/Hans010101/ai-shengyi-jing/main/data/projects_live.json';
  fetch(DATA_URL)
    .then(r => r.json())
    .then(data => {
      ALL_PROJECTS = data.map(p => normalizeProject(p));
      
      // Update dynamic total stats
      const totalCount = ALL_PROJECTS.length;
      const heroBadgeTotal = document.getElementById('hero-badge-total');
      if (heroBadgeTotal) heroBadgeTotal.innerText = totalCount.toLocaleString('zh-CN') + '+';
      
      const heroTotalNum = document.getElementById('hero-total-number');
      if (heroTotalNum) {
        heroTotalNum.setAttribute('data-target', totalCount);
        countUpStats(); // Re-trigger smooth stats animation
      }
      
      const totalDbCount = document.getElementById('totalDbCount');
      if (totalDbCount) totalDbCount.innerText = totalCount.toLocaleString('zh-CN') + '个';
      
      // Initial render for the main projects list
      renderProjects();
    })
    .catch(err => {
      console.warn('[WARN] Failed to fetch from GitHub raw CDN, retrying with local path...', err);
      // Final fallback: local path (works in localhost) or static PROJECTS list
      fetch('data/projects_live.json')
        .then(r => r.json())
        .then(data => {
          ALL_PROJECTS = data.map(p => normalizeProject(p));
          const totalCount = ALL_PROJECTS.length;
          const heroBadgeTotal = document.getElementById('hero-badge-total');
          if (heroBadgeTotal) heroBadgeTotal.innerText = totalCount.toLocaleString('zh-CN') + '+';
          const heroTotalNum = document.getElementById('hero-total-number');
          if (heroTotalNum) { heroTotalNum.setAttribute('data-target', totalCount); countUpStats(); }
          const totalDbCount = document.getElementById('totalDbCount');
          if (totalDbCount) totalDbCount.innerText = totalCount.toLocaleString('zh-CN') + '个';
          renderProjects();
        })
        .catch(() => {
          ALL_PROJECTS = PROJECTS.map(p => normalizeProject(p));
          renderProjects();
        });
    });

  setupSearch();
  setupFilters();
  setupSort();
  setupModal();
  setupSubscribe();
  setupScrollAnimations();
  setupHeader();
  setupAiAdvisor(); // Init chatbot listeners
});

// =========== RENDER FEATURED ===========
function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  const featured = PROJECTS.filter(p => p.featured);
  grid.innerHTML = featured.map(p => createProjectCard(p, true)).join('');
  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
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
    grid.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
    });
    
    renderPagination(filtered.length, totalPages);

    // Smooth micro-animation entrance
    setTimeout(() => {
      grid.querySelectorAll('.project-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 15);
      });
    }, 10);
  }
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
    pageNumsHtml += `<button class="page-num" onclick="goToPage(1)">1</button>`;
    if (startPage > 2) pageNumsHtml += `<span class="page-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumsHtml += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pageNumsHtml += `<span class="page-ellipsis">...</span>`;
    pageNumsHtml += `<button class="page-num" onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  const prevDisabled = currentPage === 1 ? 'disabled' : '';
  const nextDisabled = currentPage === totalPages ? 'disabled' : '';

  wrapper.innerHTML = `
    <div class="pagination-info">
      共 <strong>${totalItems.toLocaleString('zh-CN')}</strong> 个项目 · 第 ${currentPage} / ${totalPages} 页
    </div>
    <div class="pagination-buttons">
      <button class="page-nav-btn" ${prevDisabled} onclick="goToPage(${currentPage - 1})">← 上一页</button>
      ${pageNumsHtml}
      <button class="page-nav-btn" ${nextDisabled} onclick="goToPage(${currentPage + 1})">下一页 →</button>
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

// =========== CREATE CARD ===========
function createProjectCard(p, featured) {
  const stars = '★'.repeat(Math.round(p.replicabilityScore / 2)) + '☆'.repeat(5 - Math.round(p.replicabilityScore / 2));
  const emojiAlpha = hexToRgba(p.heroColor, 0.08);
  const isFav = isProjectFavorited(p.id);
  const favIcon = isFav ? '⭐' : '☆';
  const favActive = isFav ? 'active' : '';

  return `
    <div class="project-card fade-in" data-id="${p.id}" style="--card-color:${p.heroColor}">
      <button class="card-fav-btn ${favActive}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')" title="${isFav ? '已收藏' : '加入收藏'}">
        ${favIcon}
      </button>
      ${featured ? '<span class="featured-badge">精选</span>' : ''}
      <div class="card-header">
        <div class="card-emoji" style="background:${emojiAlpha}">${p.heroEmoji}</div>
        <div class="card-title-group">
          <div class="card-name">${p.name}</div>
          <div class="card-name-en">${p.nameEn}</div>
        </div>
      </div>
      <div class="card-tags">
        ${p.category.slice(0,2).map(c => `<span class="card-tag">${c}</span>`).join('')}
        ${p.tags.slice(0,1).map(t => `<span class="card-tag">${t}</span>`).join('')}
      </div>
      <p class="card-summary">${p.summary}</p>
      <div class="card-metrics">
        <div class="metric-item">
          <span class="metric-value gold">${p.revenueDisplay}</span>
          <span class="metric-label">月营收</span>
        </div>
        <div class="metric-item">
          <span class="metric-value blue">$${formatNum(p.startupCost)}</span>
          <span class="metric-label">启动成本</span>
        </div>
        <div class="metric-item">
          <span class="metric-value">${p.startupDays}天</span>
          <span class="metric-label">首次盈利</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="score-badge">
          <span class="score-stars">${stars}</span>
          <span>可复制 ${p.replicabilityScore}/10</span>
        </div>
        <div class="card-arrow">→</div>
      </div>
    </div>
  `;
}

// =========== DB CATEGORY PILLS ===========
function renderCategoryPills() {
  const bar = document.getElementById('dbCategoryBar');
  if (!bar) return;

  const items = [
    { name: 'all', label: '✨ 全部', icon: '' },
    ...CATEGORIES.map(c => ({ name: c.name, label: `${c.icon} ${c.name}` }))
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
                 p.category.some(c => c.toLowerCase().includes(q)) || 
                 p.tags.some(t => t.toLowerCase().includes(q));
        }).length;
        
        if (hint) {
          hint.style.display = 'block';
          if (count > 0) {
            hint.innerHTML = `🎯 找到 <strong>${count}</strong> 个与 "<strong>${currentSearch}</strong>" 相关的项目 (点击直达结果) ↓`;
            hint.style.color = '#e67e22';
            hint.style.cursor = 'pointer';
            hint.onclick = () => {
              const projectsSection = document.getElementById('all-projects');
              if (projectsSection) {
                projectsSection.scrollIntoView({ behavior: 'smooth' });
              }
            };
          } else {
            hint.innerHTML = `😔 没有找到与 "<strong>${currentSearch}</strong>" 匹配的项目，试试其他关键词？`;
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

// =========== MODAL ===========
function setupModal() {
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(id) {
  const p = ALL_PROJECTS.find(x => x.id === id) || PROJECTS.find(x => x.id === id);
  if (!p) return;

  // Track history
  recordProjectHistory(p);

  const content = document.getElementById('modalContent');
  const emojiAlpha = hexToRgba(p.heroColor, 0.08);
  const isFav = isProjectFavorited(p.id);
  const favText = isFav ? '⭐ 已收藏' : '☆ 收藏案例';

  content.innerHTML = `
    <div class="modal-hero" style="background:linear-gradient(135deg, ${hexToRgba(p.heroColor,0.02)}, transparent)">
      <div class="modal-emoji-wrap" style="background:${emojiAlpha}">${p.heroEmoji}</div>
      <h2 class="modal-name">${p.name}</h2>
      <p class="modal-name-en">${p.nameEn}</p>
      <div class="modal-tags-row" style="margin-bottom:16px">
        ${[...p.category, ...p.tags].map(t => `<span class="modal-tag">${t}</span>`).join('')}
      </div>
      <p class="modal-summary">${p.summary}</p>
      <div class="modal-links-row" style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="modal-fav-btn" onclick="toggleFavorite('${p.id}'); this.innerText = isProjectFavorited('${p.id}') ? '⭐ 已收藏' : '☆ 收藏案例';" style="background:rgba(230, 126, 34, 0.1);color:var(--primary);border:1px solid rgba(230, 126, 34, 0.3);padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
          ${favText}
        </button>
        ${p.website ? `<a href="${p.website}" target="_blank" class="modal-link-btn" style="background:var(--accent-blue);color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">🌐 官网链接</a>` : ''}
        ${p.twitter_url ? `<a href="${p.twitter_url}" target="_blank" class="modal-link-btn" style="background:#0f172a;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">🐦 官方 X</a>` : ''}
        ${p.github_url ? `<a href="${p.github_url}" target="_blank" class="modal-link-btn" style="background:#334155;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;transition:opacity 0.2s;">🐙 GitHub 开源</a>` : ''}
      </div>
    </div>
    <div class="modal-metrics">
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:${p.heroColor}">${p.revenueDisplay}</span>
        <span class="modal-metric-label">月营收 (MRR)</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-blue)">$${formatNum(p.startupCost)}</span>
        <span class="modal-metric-label">启动成本</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-emerald)">${p.startupDays}天</span>
        <span class="modal-metric-label">首次盈利</span>
      </div>
      <div class="modal-metric">
        <span class="modal-metric-value" style="color:var(--accent-purple)">${p.teamSize}人</span>
        <span class="modal-metric-label">团队规模</span>
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <div class="modal-tabs">
      <button class="modal-tab-btn active" onclick="switchTab(event, 'basic-info')">📋 基础解读</button>
      <button class="modal-tab-btn" onclick="switchTab(event, 'architecture')">🏗️ 产品与闭环</button>
      <button class="modal-tab-btn" onclick="switchTab(event, 'get-started')">🚀 快速上手</button>
    </div>
    
    <div class="modal-body">
      <!-- Tab 1: 基础解读 -->
      <div id="basic-info" class="modal-tab-content active">
        <div class="modal-section">
          <div class="modal-section-title">💡 创意亮点剖析</div>
          <div class="modal-section-content">${p.insight}</div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">💰 商业模式与收费</div>
          <div class="modal-section-content">${p.businessModel}</div>
        </div>
      </div>
      
      <!-- Tab 2: 产品架构与商业闭环 -->
      <div id="architecture" class="modal-tab-content">
        <div class="modal-section">
          <div class="modal-section-title">🌐 系统与产品架构</div>
          <div class="modal-section-content">
            <p>该项目的核心技术实现流程非常明确，以下是系统架构流向：</p>
            <div class="arch-flow">
              ${p.productArch || "暂无产品架构数据"}
            </div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">🔄 商业闭环运转逻辑</div>
          <div class="modal-section-content">
            <p>本项目的流量循环和交易闭环运转方式：</p>
            <div class="loop-flow">
              ${p.businessLoop || "暂无商业闭环数据"}
            </div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">📣 推荐营销获客渠道</div>
          <div class="modal-tags-row">
            ${p.marketingChannels.map(c => `<span class="modal-tag">📢 ${c}</span>`).join('')}
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">⚙️ 技术栈与依赖</div>
          <div class="modal-tags-row">
            ${p.techStack.map(t => `<span class="modal-tag">🔧 ${t}</span>`).join('')}
          </div>
        </div>
      </div>
      
      <!-- Tab 3: 快速上手与中国落地 -->
      <div id="get-started" class="modal-tab-content">
        <div class="modal-section">
          <div class="modal-section-title">🛠️ 3步模仿上手指南</div>
          <div class="modal-section-content">
            ${p.getStartedPath ? p.getStartedPath.map((step, idx) => `
              <div class="step-card">
                <div class="step-number">${idx + 1}</div>
                <div class="step-text">${step}</div>
              </div>
            `).join('') : "暂无上手指南"}
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">🇨🇳 中国本土落地机会</div>
          <div class="modal-china-box modal-section-content">${p.chinaOpportunity}</div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">⭐ 综合可复制指数</div>
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
    const val = document.getElementById('wechatInput').value.trim();
    if (!val) return;
    document.getElementById('subscribeOverlay').classList.remove('open');
    document.body.style.overflow = '';
    // Success feedback
    setTimeout(() => {
      showToast('🎉 订阅成功！我们会通过微信联系你。');
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
      el.textContent = Math.floor(current).toLocaleString('zh-CN');
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
function normalizeProject(p) {
  if (p.nameEn && p.revenueDisplay && p.category) return p;

  let rawRevenue = 0;
  let revenueDisplay = p.revenue || '未披露';
  if (p.revenue && typeof p.revenue === 'string') {
    const cleanRev = p.revenue.replace(/,/g, '');
    const numMatch = cleanRev.match(/\$([\d.]+)\s*([KkMm]?)/);
    if (numMatch) {
      let val = parseFloat(numMatch[1]);
      let multiplier = numMatch[2].toLowerCase();
      if (multiplier === 'k') val *= 1000;
      else if (multiplier === 'm') val *= 1000000;
      rawRevenue = val;
    }
  }

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

  const category = p.tags && p.tags.length > 0 ? [p.niche || '其他'] : ['其他'];
  const tags = p.tags || [];

  const cnTitle = getChineseName(p);
  const enTitle = (p.name && !/[\u4e00-\u9fff]/.test(p.name)) ? p.name : (p.slug ? p.slug.replace(/-/g, ' ').toUpperCase() : 'AI PROJECT');

  let dateVal = 0;
  if (p.scrapedAt) dateVal = new Date(p.scrapedAt).getTime() || 0;
  else if (p.updatedAt) dateVal = new Date(p.updatedAt).getTime() || 0;

  return {
    id: p.id || Math.random().toString(36).substr(2, 9),
    name: cnTitle,
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
    heroEmoji: getEmojiForNiche(p.niche || '其他'),
    heroColor: getColorForNiche(p.niche || '其他'),
    summary: p.summary || p.description || '暂无项目介绍',
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

function getEmojiForNiche(niche) {
  const emojis = {
    'AI工具': '🤖',
    'SaaS': '⚡',
    '内容/媒体': '✍️',
    '电商/DTC': '🛒',
    '开发者工具': '🔧',
    '营销工具': '📢',
    '金融/支付': '💳',
    '健康/生活': '❤️',
    'B2B服务': '🤝',
    '游戏/娱乐': '🎮'
  };
  return emojis[niche] || '💡';
}

function getColorForNiche(niche) {
  const colors = {
    'AI工具': '#8b5cf6',
    'SaaS': '#3b82f6',
    '内容/媒体': '#ec4899',
    '电商/DTC': '#f59e0b',
    '开发者工具': '#10b981',
    '营销工具': '#ef4444',
    '金融/支付': '#06b6d4',
    '健康/生活': '#14b8a6',
    'B2B服务': '#6366f1',
    '游戏/娱乐': '#f43f5e'
  };
  return colors[niche] || '#64748b';
}

// =========== AI BUSINESS ADVISOR CHATBOT LOGIC ===========
function setupAiAdvisor() {
  const bubble = document.getElementById('aiAdvisorBubble');
  const panel = document.getElementById('aiAdvisorPanel');
  const closeBtn = document.getElementById('panelCloseBtn');
  const sendBtn = document.getElementById('sendAiMessageBtn');
  const input = document.getElementById('aiMessageInput');

  if (!bubble || !panel) return;

  // Toggle Panel with Auth Gating
  bubble.addEventListener('click', () => {
    if (!CURRENT_USER) {
      showAuthModal('🔒 成为注册会员即可解锁「AI 商业顾问」专属商业剖析智囊与案例推荐');
      return;
    }
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      input.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Send message
  function handleSend() {
    if (!CURRENT_USER) {
      showAuthModal('🔒 成为注册会员即可解锁「AI 商业顾问」专属商业剖析智囊与案例推荐');
      return;
    }

    const text = input.value.trim();
    if (!text) return;
    
    // Append User Message
    appendMessage(text, 'user-msg');
    input.value = '';

    // Track AI advisor interaction in analytics
    let analytics = JSON.parse(localStorage.getItem('ai_shengyi_analytics') || '{}');
    analytics.advisorChats = (analytics.advisorChats || 1420) + 1;
    localStorage.setItem('ai_shengyi_analytics', JSON.stringify(analytics));

    // Show Typing Indicator
    const typingId = appendMessage('🤖 AI 顾问正在检索商业大盘并构思方案...', 'bot-msg');
    
    setTimeout(() => {
      // Remove typing message
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      // Retrieve Top Matches from live database
      const matches = findBestMatches(text);
      const reply = generateAdvisorResponse(text, matches);
      
      appendMessage(reply, 'bot-msg', matches);
    }, 1200);
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSend();
  });
}

// Global Suggestion Trigger
window.sendSuggestion = function(text) {
  if (!CURRENT_USER) {
    showAuthModal('🔒 成为注册会员即可解锁「AI 商业顾问」专属商业剖析智囊与案例推荐');
    return;
  }
  const panel = document.getElementById('aiAdvisorPanel');
  const input = document.getElementById('aiMessageInput');
  if (panel && input) {
    panel.classList.add('open');
    input.value = text;
    document.getElementById('sendAiMessageBtn').click();
  }
};

function getChineseName(p) {
  if (!p) return '';
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
  
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  
  if (matches && matches.length > 0) {
    html += '<div style="margin-top: 10px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 6px; font-weight:700;">💡 关联大盘推荐项目（点击直达架构拆解）：</div>';
    matches.forEach(p => {
      html += `
        <a class="chat-project-link" href="javascript:void(0);" onclick="openModal('${p.id}')">
          ${p.heroEmoji} 【${p.category[0]}】${getChineseName(p)} · 月入 ${p.revenueDisplay}
        </a>
      `;
    });
  }

  msg.innerHTML = html;
  messagesWrap.appendChild(msg);
  messagesWrap.scrollTop = messagesWrap.scrollHeight;
  return id;
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

function generateAdvisorResponse(query, matches) {
  if (matches.length === 0) {
    return `关于您提到的 "${query}"，我检索了全球 3,000+ 案例，目前在出海大盘中暂时没有完全重合的垂直项目。

但从相似赛道的商业逻辑来看，我建议您可以参考「AI工具」或「Micro-SaaS」的发展路径：
1. **MVP极速上线**：利用 Webflow/Vite + Claude API 在 3 天内制作一个极简表单或生成式页面，跑通核心功能。
2. **本土冷启动**：在中国市场利用小红书发布解决痛点的短视频或图文，引流私域微信群。
3. **闭环变现**：前期通过国内爱发电或直接微信扫码支付提供周卡/月卡，验证用户的真金白银付费意愿。`;
  }

  const p1 = matches[0];
  const cnName = getChineseName(p1);
  const displayTitle = cnName !== p1.nameEn && cnName !== p1.name
    ? `${cnName} (${p1.nameEn || p1.name})`
    : cnName;

  let reply = `🧠 **商业顾问分析报告：**\n根据您咨询的创意，为您精准匹配到本站最成功的出海案例 **${displayTitle}**（月营收达 **${p1.revenueDisplay}**）。\n\n`;
  reply += `💡 **核心商业逻辑**：\n该项目成功的关键在于 **${p1.summary}**。它以极低的团队成本（团队通常仅有 1 人），通过精细的流量获客，实现了超高利润率。\n\n`;
  reply += `🇨🇳 **中国本土落地冷启动方案**：\n`;
  reply += `1. **系统克隆**：国内开发者可以完全复刻其系统架构。国内可直接调用 DeepSeek API 作为模型底座，接口成本可降低 90% 以上。\n`;
  reply += `2. **精准获客**：放弃高昂的搜索引擎竞价，转为在小红书、即刻或掘金等垂直社区发布“痛点实战解决方案”相关图文，自动引流私域粉丝。\n`;
  reply += `3. **支付闭环**：使用国内免签支付接口（如虎皮椒或面包多），在微信小程序内直接完成订阅转化，当天即可看到首笔现金流。`;

  return reply;
}

// =========== MEMBER & AUTH SYSTEM MODULES ===========
let CURRENT_USER = null;

function initAuthAndAnalytics() {
  trackVisitorAnalytics();
  
  const storedUser = localStorage.getItem('ai_shengyi_user');
  if (storedUser) {
    try {
      CURRENT_USER = JSON.parse(storedUser);
    } catch (e) {
      CURRENT_USER = null;
    }
  }
  
  updateHeaderUserUI();
  setupAuthEventListeners();
  setupMemberEventListeners();
  setupAdminEventListeners();
}

function trackVisitorAnalytics() {
  let analytics = JSON.parse(localStorage.getItem('ai_shengyi_analytics') || '{"pv": 12850, "uvs": [], "advisorChats": 1420, "members": []}');
  
  analytics.pv = (analytics.pv || 12850) + 1;
  
  let visitorId = localStorage.getItem('ai_shengyi_visitor_id');
  if (!visitorId) {
    visitorId = 'uv_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('ai_shengyi_visitor_id', visitorId);
  }
  if (!analytics.uvs.includes(visitorId)) {
    analytics.uvs.push(visitorId);
  }

  if (!analytics.members || analytics.members.length === 0) {
    analytics.members = [
      { email: 'admin@ai-shengyi.com', role: 'admin', joinDate: '2026-07-01', favs: ['p_001', 'p_003'] },
      { email: 'founder_alex@gmail.com', role: 'member', joinDate: '2026-07-15', favs: ['p_002'] },
      { email: '13800138000', role: 'member', joinDate: '2026-07-20', favs: ['p_001', 'p_004'] }
    ];
  }

  localStorage.setItem('ai_shengyi_analytics', JSON.stringify(analytics));
}

function updateHeaderUserUI() {
  const loginBtn = document.getElementById('headerLoginBtn');
  const userNavGroup = document.getElementById('userNavGroup');
  const headerUserName = document.getElementById('headerUserName');
  const adminNavBtn = document.getElementById('adminDashboardNavBtn');

  if (CURRENT_USER) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (userNavGroup) userNavGroup.style.display = 'inline-block';
    if (headerUserName) headerUserName.innerText = CURRENT_USER.nickname || CURRENT_USER.email || CURRENT_USER.phone || '会员';
    
    const isAdmin = (CURRENT_USER.email && CURRENT_USER.email.toLowerCase() === 'hans.pan007@gmail.com') || CURRENT_USER.role === 'admin';
    if (isAdmin) CURRENT_USER.role = 'admin';
    if (adminNavBtn) adminNavBtn.style.display = isAdmin ? 'block' : 'none';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (userNavGroup) userNavGroup.style.display = 'none';
  }
}

function showAuthModal(promptMsg) {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  const subtitle = overlay.querySelector('.auth-subtitle');
  if (subtitle && promptMsg) {
    subtitle.innerText = promptMsg;
  }
  overlay.style.display = 'flex';
}

function hideAuthModal() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.style.display = 'none';
}

function loginAsUser(userObj) {
  if (userObj.email && userObj.email.toLowerCase() === 'hans.pan007@gmail.com') {
    userObj.role = 'admin';
    userObj.nickname = '站长 (Hans)';
  }

  CURRENT_USER = userObj;
  localStorage.setItem('ai_shengyi_user', JSON.stringify(CURRENT_USER));
  
  let analytics = JSON.parse(localStorage.getItem('ai_shengyi_analytics') || '{}');
  if (analytics.members) {
    const existing = analytics.members.find(m => (m.email && m.email === userObj.email) || (m.phone && m.phone === userObj.phone));
    if (!existing) {
      analytics.members.push(userObj);
      localStorage.setItem('ai_shengyi_analytics', JSON.stringify(analytics));
    }
  }

  updateHeaderUserUI();
  hideAuthModal();
  renderProjects();
}

function logoutUser() {
  CURRENT_USER = null;
  localStorage.removeItem('ai_shengyi_user');
  updateHeaderUserUI();
  const memberOverlay = document.getElementById('memberOverlay');
  if (memberOverlay) memberOverlay.style.display = 'none';
  const userDropdown = document.getElementById('userDropdownMenu');
  if (userDropdown) userDropdown.style.display = 'none';
  renderProjects();
}

function isProjectFavorited(id) {
  if (!CURRENT_USER) return false;
  const key = 'ai_shengyi_fav_' + (CURRENT_USER.id || CURRENT_USER.email || CURRENT_USER.phone || 'user');
  const favs = JSON.parse(localStorage.getItem(key) || '[]');
  return favs.includes(id);
}

function toggleFavorite(id) {
  if (!CURRENT_USER) {
    showAuthModal('⭐️ 登录账户即可收藏心仪案例并同步至会员个人中心');
    return;
  }

  const key = 'ai_shengyi_fav_' + (CURRENT_USER.id || CURRENT_USER.email || CURRENT_USER.phone || 'user');
  let favs = JSON.parse(localStorage.getItem(key) || '[]');
  
  if (favs.includes(id)) {
    favs = favs.filter(f => f !== id);
  } else {
    favs.push(id);
  }

  localStorage.setItem(key, JSON.stringify(favs));
  
  let analytics = JSON.parse(localStorage.getItem('ai_shengyi_analytics') || '{}');
  if (analytics.members) {
    const userInAnalytics = analytics.members.find(m => (m.email && m.email === CURRENT_USER.email) || (m.phone && m.phone === CURRENT_USER.phone));
    if (userInAnalytics) {
      userInAnalytics.favs = favs;
      localStorage.setItem('ai_shengyi_analytics', JSON.stringify(analytics));
    }
  }

  renderProjects();
  renderMemberFavorites();
}

function recordProjectHistory(project) {
  if (!project || !project.id) return;
  const key = CURRENT_USER ? ('ai_shengyi_hist_' + (CURRENT_USER.id || CURRENT_USER.email || CURRENT_USER.phone || 'user')) : 'ai_shengyi_hist_guest';
  let history = JSON.parse(localStorage.getItem(key) || '[]');
  
  history = history.filter(h => h.id !== project.id);
  const now = new Date();
  const timeStr = `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  history.unshift({
    id: project.id,
    name: project.name,
    nameEn: project.nameEn,
    time: timeStr,
    timestamp: now.getTime()
  });

  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem(key, JSON.stringify(history));
}

function setupAuthEventListeners() {
  const loginBtn = document.getElementById('headerLoginBtn');
  const authClose = document.getElementById('authClose');
  const authOverlay = document.getElementById('authOverlay');

  if (loginBtn) loginBtn.addEventListener('click', () => showAuthModal());
  if (authClose) authClose.addEventListener('click', hideAuthModal);
  if (authOverlay) {
    authOverlay.addEventListener('click', e => {
      if (e.target === authOverlay) hideAuthModal();
    });
  }

  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-tab-content').forEach(c => c.style.display = 'none');
      btn.classList.add('active');
      const tabId = 'authTab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
      const contentEl = document.getElementById(tabId);
      if (contentEl) contentEl.style.display = 'block';
    });
  });

  const sendSmsBtn = document.getElementById('sendSmsCodeBtn');
  if (sendSmsBtn) {
    sendSmsBtn.addEventListener('click', () => {
      const phoneInput = document.getElementById('authPhoneInput');
      const phone = phoneInput ? phoneInput.value.trim() : '';
      if (!phone || phone.length < 11) {
        alert('请输入有效的11位手机号码');
        return;
      }
      const codeInput = document.getElementById('authSmsCodeInput');
      if (codeInput) codeInput.value = '888888';
      let sec = 60;
      sendSmsBtn.disabled = true;
      sendSmsBtn.innerText = `已发送 (${sec}s)`;
      const timer = setInterval(() => {
        sec--;
        if (sec <= 0) {
          clearInterval(timer);
          sendSmsBtn.disabled = false;
          sendSmsBtn.innerText = '获取验证码';
        } else {
          sendSmsBtn.innerText = `已发送 (${sec}s)`;
        }
      }, 1000);
    });
  }

  const emailSubmit = document.getElementById('emailAuthSubmitBtn');
  if (emailSubmit) {
    emailSubmit.addEventListener('click', () => {
      const email = document.getElementById('authEmailInput').value.trim() || 'user@domain.com';
      loginAsUser({
        email: email,
        role: email.includes('admin') ? 'admin' : 'member',
        nickname: email.split('@')[0],
        joinDate: new Date().toISOString().split('T')[0]
      });
    });
  }

  const smsSubmit = document.getElementById('smsAuthSubmitBtn');
  if (smsSubmit) {
    smsSubmit.addEventListener('click', () => {
      const phone = document.getElementById('authPhoneInput').value.trim() || '13800138000';
      loginAsUser({
        phone: phone,
        role: 'member',
        nickname: '创客_' + phone.slice(-4),
        joinDate: new Date().toISOString().split('T')[0]
      });
    });
  }

  const googleSubmit = document.getElementById('googleAuthSubmitBtn');
  if (googleSubmit) {
    googleSubmit.addEventListener('click', () => {
      loginAsUser({
        email: 'alex.innovator@gmail.com',
        role: 'member',
        nickname: 'Alex Innovator',
        joinDate: new Date().toISOString().split('T')[0]
      });
    });
  }
}

function setupMemberEventListeners() {
  const userAvatarBtn = document.getElementById('userAvatarBtn');
  const dropdownMenu = document.getElementById('userDropdownMenu');
  const memberOverlay = document.getElementById('memberOverlay');
  const memberClose = document.getElementById('memberClose');
  const memberLogoutBtn = document.getElementById('memberLogoutBtn');
  const menuLogout = document.getElementById('menuLogout');

  if (userAvatarBtn && dropdownMenu) {
    userAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      dropdownMenu.style.display = 'none';
    });
  }

  const menuMemberCenter = document.getElementById('menuMemberCenter');
  const menuMyFavorites = document.getElementById('menuMyFavorites');
  const menuMyHistory = document.getElementById('menuMyHistory');

  function openMemberModalTab(tabName) {
    if (memberOverlay) memberOverlay.style.display = 'flex';
    
    const isAdmin = CURRENT_USER && ((CURRENT_USER.email && CURRENT_USER.email.toLowerCase() === 'hans.pan007@gmail.com') || CURRENT_USER.role === 'admin');
    const adminNavBtn = document.getElementById('adminDashboardNavBtn');
    if (adminNavBtn) adminNavBtn.style.display = isAdmin ? 'block' : 'none';

    document.querySelectorAll('.member-nav-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    document.querySelectorAll('.member-panel').forEach(p => p.style.display = 'none');
    const panelId = 'memberPanel' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const panelEl = document.getElementById(panelId);
    if (panelEl) panelEl.style.display = 'block';

    if (tabName === 'favorites') renderMemberFavorites();
    if (tabName === 'history') renderMemberHistory();
    if (tabName === 'profile') renderMemberProfileInfo();
    if (tabName === 'admin') renderAdminDashboard();
  }

  if (menuMemberCenter) menuMemberCenter.addEventListener('click', () => openMemberModalTab('favorites'));
  if (menuMyFavorites) menuMyFavorites.addEventListener('click', () => openMemberModalTab('favorites'));
  if (menuMyHistory) menuMyHistory.addEventListener('click', () => openMemberModalTab('history'));
  
  if (memberClose) memberClose.addEventListener('click', () => { if (memberOverlay) memberOverlay.style.display = 'none'; });
  if (memberLogoutBtn) memberLogoutBtn.addEventListener('click', logoutUser);
  if (menuLogout) menuLogout.addEventListener('click', logoutUser);

  document.querySelectorAll('.member-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      openMemberModalTab(tab);
    });
  });

  const roleToggleBtn = document.getElementById('btnToggleAdminRole');
  if (roleToggleBtn) {
    roleToggleBtn.addEventListener('click', () => {
      if (!CURRENT_USER) return;
      if (CURRENT_USER.role === 'admin') {
        CURRENT_USER.role = 'member';
        CURRENT_USER.email = 'user@domain.com';
        CURRENT_USER.nickname = '普通会员';
      } else {
        CURRENT_USER.role = 'admin';
        CURRENT_USER.email = 'hans.pan007@gmail.com';
        CURRENT_USER.nickname = '站长 (Hans)';
      }
      localStorage.setItem('ai_shengyi_user', JSON.stringify(CURRENT_USER));
      updateHeaderUserUI();
      renderMemberProfileInfo();
      openMemberModalTab('profile');
      alert(`已切换账号为: ${CURRENT_USER.email} (${CURRENT_USER.role === 'admin' ? '👑 管理员 - 已启用⚙️系统管理功能' : '💎 普通会员'})`);
    });
  }
}

function renderMemberFavorites() {
  const grid = document.getElementById('favGrid');
  const countEl = document.getElementById('favCount');
  if (!grid || !CURRENT_USER) return;

  const key = 'ai_shengyi_fav_' + (CURRENT_USER.id || CURRENT_USER.email || CURRENT_USER.phone || 'user');
  const favIds = JSON.parse(localStorage.getItem(key) || '[]');
  if (countEl) countEl.innerText = favIds.length;

  if (favIds.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1;">🌟 暂无收藏项目，浏览大盘点击卡片右上角 ⭐ 即可收藏案例！</p>';
    return;
  }

  const favProjects = ALL_PROJECTS.filter(p => favIds.includes(p.id));
  grid.innerHTML = favProjects.map(p => `
    <div class="fav-card" onclick="openModal('${p.id}')" style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;position:relative;">
      <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px;">${p.heroEmoji} ${p.name}</div>
      <div style="font-size:12px;color:var(--primary);font-weight:700;">${p.revenueDisplay} / 月</div>
      <button onclick="event.stopPropagation(); toggleFavorite('${p.id}')" style="margin-top:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">取消收藏</button>
    </div>
  `).join('');
}

function renderMemberHistory() {
  const timeline = document.getElementById('historyTimeline');
  const countEl = document.getElementById('historyCount');
  if (!timeline) return;

  const key = CURRENT_USER ? ('ai_shengyi_hist_' + (CURRENT_USER.id || CURRENT_USER.email || CURRENT_USER.phone || 'user')) : 'ai_shengyi_hist_guest';
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  if (countEl) countEl.innerText = history.length;

  if (history.length === 0) {
    timeline.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">🕒 暂无浏览历史，点击任意案例弹窗开始探索吧！</p>';
    return;
  }

  timeline.innerHTML = history.map(item => `
    <div class="history-item" onclick="openModal('${item.id}')">
      <div class="history-left">
        <strong>${item.name}</strong> (${item.nameEn})
      </div>
      <div class="history-time" style="font-size:12px;color:var(--text-muted);">${item.time}</div>
    </div>
  `).join('');
}

function renderMemberProfileInfo() {
  if (!CURRENT_USER) return;
  const roleEl = document.getElementById('profRole');
  const accEl = document.getElementById('profAccount');
  const dateEl = document.getElementById('profJoinDate');
  const avatarEl = document.getElementById('memberAvatar');
  const nameEl = document.getElementById('memberName');
  const badgeEl = document.getElementById('memberRoleBadge');

  if (roleEl) roleEl.innerText = CURRENT_USER.role === 'admin' ? '👑 站点管理员' : '💎 尊享会员';
  if (accEl) accEl.innerText = CURRENT_USER.email || CURRENT_USER.phone || '账号已绑定';
  if (dateEl) dateEl.innerText = CURRENT_USER.joinDate || '2026-07-22';
  if (avatarEl) avatarEl.innerText = CURRENT_USER.role === 'admin' ? '👑' : '👤';
  if (nameEl) nameEl.innerText = CURRENT_USER.nickname || '会员用户';
  if (badgeEl) badgeEl.innerText = CURRENT_USER.role === 'admin' ? '👑 管理员' : '💎 尊享会员';
}

function setupAdminEventListeners() {
  const menuAdmin = document.getElementById('menuAdminDashboard');
  const adminOverlay = document.getElementById('adminOverlay');
  const adminClose = document.getElementById('adminClose');

  if (menuAdmin) menuAdmin.addEventListener('click', showAdminDashboard);
  if (adminClose) adminClose.addEventListener('click', () => { if (adminOverlay) adminOverlay.style.display = 'none'; });
  if (adminOverlay) {
    adminOverlay.addEventListener('click', e => {
      if (e.target === adminOverlay) adminOverlay.style.display = 'none';
    });
  }
}

function showAdminDashboard() {
  const adminOverlay = document.getElementById('adminOverlay');
  if (!adminOverlay) return;
  renderAdminDashboard();
  adminOverlay.style.display = 'flex';
}

function renderAdminDashboard() {
  const analytics = JSON.parse(localStorage.getItem('ai_shengyi_analytics') || '{}');
  
  const pvEl = document.getElementById('adminTotalPv');
  const uvEl = document.getElementById('adminTotalUv');
  const membersEl = document.getElementById('adminTotalMembers');
  const chatsEl = document.getElementById('adminAdvisorChats');

  if (pvEl) pvEl.innerText = (analytics.pv || 12850).toLocaleString('zh-CN');
  if (uvEl) uvEl.innerText = (analytics.uvs ? analytics.uvs.length : 3420).toLocaleString('zh-CN');
  if (membersEl) membersEl.innerText = (analytics.members ? analytics.members.length : 3).toLocaleString('zh-CN');
  if (chatsEl) chatsEl.innerText = (analytics.advisorChats || 1420).toLocaleString('zh-CN');

  const rankList = document.getElementById('adminTopProjects');
  if (rankList && ALL_PROJECTS.length > 0) {
    const topProjects = ALL_PROJECTS.slice(0, 5);
    rankList.innerHTML = topProjects.map((p, i) => `
      <div class="admin-rank-item">
        <div>
          <span class="rank-badge">${i + 1}</span>
          <strong>${p.name}</strong> (${p.nameEn})
        </div>
        <span class="rank-count" style="color:var(--primary);font-weight:700;">⭐ ${(5 - i) * 8 + 12} 收藏</span>
      </div>
    `).join('');
  }

  const tableBody = document.getElementById('adminUserTableBody');
  if (tableBody && analytics.members) {
    tableBody.innerHTML = analytics.members.map(m => `
      <tr>
        <td><strong>${m.email || m.phone || '匿名会员'}</strong></td>
        <td><span class="member-badge">${m.role === 'admin' ? '👑 管理员' : '💎 会员'}</span></td>
        <td>${(m.favs ? m.favs.length : 2)} 个</td>
        <td>${m.joinDate || '2026-07-22'}</td>
      </tr>
    `).join('');
  }
}


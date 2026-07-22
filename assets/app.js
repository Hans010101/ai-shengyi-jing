// =========== STATE ===========
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'date-desc';
let currentPage = 1;
const ITEMS_PER_PAGE = 9;
let ALL_PROJECTS = []; // Holds normalized live database items

// =========== INIT ===========
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial render of static featured items
  renderFeatured();
  renderCategories();
  
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

  // Toggle other sections when search is active
  if (currentSearch && currentSearch.trim().length > 0) {
    if (projectsSection) projectsSection.style.display = 'none';
    if (categoriesSection) categoriesSection.style.display = 'none';
  } else {
    if (projectsSection) projectsSection.style.display = 'block';
    if (categoriesSection) categoriesSection.style.display = 'block';
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

  return `
    <div class="project-card fade-in" data-id="${p.id}" style="--card-color:${p.heroColor}">
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

// =========== CATEGORIES ===========
function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  grid.innerHTML = CATEGORIES.map(c => `
    <div class="category-card fade-in" onclick="filterByCategory('${c.name}')">
      <div class="category-icon">${c.icon}</div>
      <div class="category-name">${c.name}</div>
      <div class="category-count">${c.count}+ 案例</div>
    </div>
  `).join('');
}

function filterByCategory(name) {
  currentFilter = name;
  currentSearch = '';
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
  renderProjects();
  document.getElementById('all-projects').scrollIntoView({ behavior: 'smooth' });
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
  const content = document.getElementById('modalContent');
  const repPct = (p.replicabilityScore / 10 * 100).toFixed(0);
  const emojiAlpha = hexToRgba(p.heroColor, 0.08);

  content.innerHTML = `
    <div class="modal-hero" style="background:linear-gradient(135deg, ${hexToRgba(p.heroColor,0.02)}, transparent)">
      <div class="modal-emoji-wrap" style="background:${emojiAlpha}">${p.heroEmoji}</div>
      <h2 class="modal-name">${p.name}</h2>
      <p class="modal-name-en">${p.nameEn}</p>
      <div class="modal-tags-row" style="margin-bottom:16px">
        ${[...p.category, ...p.tags].map(t => `<span class="modal-tag">${t}</span>`).join('')}
      </div>
      <p class="modal-summary">${p.summary}</p>
      <div class="modal-links-row" style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap;">
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
  const messagesWrap = document.getElementById('panelMessages');

  if (!bubble || !panel) return;

  // Toggle Panel
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
  function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    
    // Append User Message
    appendMessage(text, 'user-msg');
    input.value = '';

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
  // Curated project name check: if name contains Chinese characters, return it
  if (p.name && /[\u4e00-\u9fff]/.test(p.name)) {
    return p.name;
  }
  // Extract clean Chinese name from summary
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
  
  // Format markdown bold (**text**) and line breaks
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  
  // If we have recommended projects, append clickable action buttons
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
  
  // Tokenize query by removing common stop words and splitting by punctuation
  const stopWords = ['我想', '做', '一个', '什么', '推荐', '有适合', '如何', '怎么', '的', '了', '吗', '？', '，', '。', '想做', '工具', '生意', '项目', '快速', '如何冷启动', '冷启动', '个人', '适合', '开发'];
  let cleanQuery = q;
  stopWords.forEach(w => {
    cleanQuery = cleanQuery.split(w).join(' ');
  });
  
  const tokens = cleanQuery.split(/[\s,./?#@!%^&*()_+\-=\[\]{};':"\\|<>，。？、！；：]+/).filter(t => t.trim().length > 0);
  
  if (tokens.length === 0) {
    tokens.push(q);
  }

  // Scoring
  const scored = ALL_PROJECTS.map(p => {
    let score = 0;
    
    // Direct full-query matches
    if (p.name.toLowerCase().includes(q)) score += 50;
    if (p.summary.toLowerCase().includes(q)) score += 20;

    // Token-based keyword matching
    tokens.forEach(tok => {
      if (p.name.toLowerCase().includes(tok)) score += 20;
      if (p.summary.toLowerCase().includes(tok)) score += 10;
      if (p.insight && p.insight.toLowerCase().includes(tok)) score += 5;
      if (p.category && p.category.some(c => c.toLowerCase().includes(tok))) score += 15;
      if (p.tags && p.tags.some(t => t.toLowerCase().includes(tok))) score += 12;
    });

    return { project: p, score: score };
  });

  // Filter & sort
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


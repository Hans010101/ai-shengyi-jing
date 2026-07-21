/* ========================================
   AI生意经 - Main Application Logic
======================================== */

// =========== STATE ===========
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'revenue-desc';

// =========== INIT ===========
document.addEventListener('DOMContentLoaded', () => {
  renderFeatured();
  renderCategories();
  renderProjects();
  setupSearch();
  setupFilters();
  setupSort();
  setupModal();
  setupSubscribe();
  setupScrollAnimations();
  countUpStats();
  setupHeader();
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

  let filtered = PROJECTS.filter(p => {
    const matchFilter = currentFilter === 'all' || p.category.includes(currentFilter) || p.tags.includes(currentFilter);
    const q = currentSearch.toLowerCase();
    const matchSearch = !q || p.name.includes(q) || p.nameEn.toLowerCase().includes(q) ||
      p.summary.includes(q) || p.category.some(c => c.includes(q)) || p.tags.some(t => t.includes(q));
    return matchFilter && matchSearch;
  });

  // Sort
  filtered = sortProjects(filtered, currentSort);

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtered.map(p => createProjectCard(p, false)).join('');
    grid.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
    });
    // Animate in
    setTimeout(() => {
      grid.querySelectorAll('.project-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 50);
      });
    }, 10);
  }
}

function sortProjects(projects, sort) {
  return [...projects].sort((a, b) => {
    switch (sort) {
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
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
  renderProjects();
  document.getElementById('projects').scrollIntoView({ behavior: 'smooth' });
}

// =========== SEARCH ===========
function setupSearch() {
  const input = document.getElementById('searchInput');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      currentSearch = input.value;
      currentFilter = 'all';
      document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      document.querySelector('.filter-tag[data-filter="all"]').classList.add('active');
      renderProjects();
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
      document.getElementById('searchInput').value = '';
      renderProjects();
    });
  });
}

// =========== SORT ===========
function setupSort() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    currentSort = e.target.value;
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
  const p = PROJECTS.find(x => x.id === id);
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

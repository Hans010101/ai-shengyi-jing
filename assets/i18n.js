(function () {
  const STORAGE_KEY = 'ai-shengyi-language';
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('lang');
  const stored = localStorage.getItem(STORAGE_KEY);
  const language = requested === 'en' || (requested !== 'zh' && stored === 'en') ? 'en' : 'zh';

  const categories = {
    '全部': 'All', '全部分类': 'All categories', 'AI工具': 'AI Tools',
    'Micro SaaS': 'Micro SaaS', 'SaaS': 'SaaS', '内容创业': 'Content',
    '内容/媒体': 'Content & Media', '电商品牌': 'E-commerce',
    '电商/DTC': 'E-commerce & DTC', '服务类': 'Services', 'B2B服务': 'B2B Services',
    '知识付费': 'Knowledge Products', '本地生意': 'Local Business',
    '健康/生活': 'Health & Lifestyle', '游戏/娱乐': 'Games & Entertainment',
    '金融/支付': 'Finance & Payments', '开发者工具': 'Developer Tools',
    '营销工具': 'Marketing Tools', '无代码': 'No-code', '其他': 'Other'
  };

  const tags = {
    '人工智能': 'Artificial Intelligence', '自动化': 'Automation', '营销工具': 'Marketing',
    '效率工具': 'Productivity', '创作者工具': 'Creator Tools', '在线教育': 'Online Education',
    '本地服务': 'Local Services', '内容创业': 'Content Business', '电商': 'E-commerce',
    '订阅制': 'Subscription', '低代码': 'Low-code', '无代码': 'No-code'
  };

  function t(zh, en) { return language === 'en' ? en : zh; }
  function category(value) { return language === 'en' ? (categories[value] || value) : value; }
  function tag(value) { return language === 'en' ? (tags[value] || (/^[\x00-\x7F]+$/.test(value) ? value : 'Business')) : value; }
  function projectName(project) {
    return language === 'en'
      ? String(project.nameEn || project.name || project.slug || 'Business case')
      : String(project.nameZh || project.name || '未命名项目');
  }
  function cleanEnglishDescription(value) {
    return String(value || '')
      .replace(/\s*[—-]\s*researched and written by.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function projectSummary(project) {
    if (language !== 'en') return String(project.summary || '查看完整商业模式、增长闭环与落地路径。');
    return cleanEnglishDescription(project.summaryEn || project.metaDesc || project.description)
      || 'Explore the business model, growth loop, economics, and practical launch path.';
  }
  function withLanguage(href) {
    if (language !== 'en' || !href || href.startsWith('#') || /^(?:https?:|mailto:|tel:)/.test(href)) return href;
    const url = new URL(href, window.location.href);
    url.searchParams.set('lang', 'en');
    return `${url.pathname.split('/').pop() || 'index.html'}${url.search}${url.hash}`;
  }
  function applyStatic(root = document) {
    root.querySelectorAll('[data-zh][data-en]').forEach(element => {
      element.textContent = t(element.dataset.zh, element.dataset.en);
    });
    root.querySelectorAll('[data-placeholder-zh][data-placeholder-en]').forEach(element => {
      element.placeholder = t(element.dataset.placeholderZh, element.dataset.placeholderEn);
    });
    root.querySelectorAll('[data-aria-zh][data-aria-en]').forEach(element => {
      element.setAttribute('aria-label', t(element.dataset.ariaZh, element.dataset.ariaEn));
    });
    root.querySelectorAll('a[href]').forEach(link => { link.href = withLanguage(link.getAttribute('href')); });
  }
  function switchLanguage() {
    const next = language === 'en' ? 'zh' : 'en';
    localStorage.setItem(STORAGE_KEY, next);
    const url = new URL(window.location.href);
    if (next === 'en') url.searchParams.set('lang', 'en');
    else url.searchParams.delete('lang');
    window.location.assign(url.href);
  }
  function init() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    applyStatic();
    document.querySelectorAll('[data-language-toggle]').forEach(button => {
      button.textContent = language === 'en' ? '中文' : 'EN';
      button.setAttribute('aria-label', language === 'en' ? '切换到中文' : 'Switch to English');
      button.addEventListener('click', switchLanguage);
    });
    const html = document.documentElement.dataset;
    if (language === 'en' && html.titleEn) document.title = html.titleEn;
    const description = document.querySelector('meta[name="description"]');
    if (language === 'en' && description && html.descriptionEn) description.content = html.descriptionEn;
  }

  window.SiteI18n = { language, isEnglish: () => language === 'en', locale: () => language === 'en' ? 'en-US' : 'zh-CN', t, category, tag, projectName, projectSummary, withLanguage, applyStatic, cleanEnglishDescription };
  document.addEventListener('DOMContentLoaded', init);
})();

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text || '';
  parent.appendChild(element);
  return element;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

async function fetchJsonIfAvailable(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    console.warn(`[WARN] Failed to fetch ${url}`, error);
    return null;
  }
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
    console.warn(`[WARN] Ignoring non-JSON response for ${url}: ${contentType || 'unknown'}`);
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    console.warn(`[WARN] Ignoring invalid JSON response for ${url}`, error);
    return null;
  }
}

function findCuratedProject(projectId) {
  if (typeof PROJECTS === 'undefined' || !Array.isArray(PROJECTS)) return null;
  return PROJECTS.find(project => project.id === projectId) || null;
}

function resolveCollectionDate(projectId, article, project, collectionDates) {
  const candidates = [
    collectionDates?.[projectId],
    project?.scrapedAt,
    project?.updatedAt,
    article?.project?.scrapedAt,
    article?.project?.updatedAt
  ];
  const value = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
  return value ? value.slice(0, 10) : '';
}

function renderMedia(media, index) {
  if (!media) return null;
  const sourceUrl = safeExternalUrl(media.sourceUrl);
  const mediaUrl = safeExternalUrl(media.url);
  let videoWatchUrl = '';

  const figure = document.createElement('figure');
  figure.className = 'article-media';
  figure.dataset.mediaIndex = String(index);

  if (
    media.type === 'infographic'
    && media.origin === 'editorial-generated'
  ) {
    const allowedVariants = new Set([
      'business-loop',
      'product-path',
      'china-launch'
    ]);
    const variant = allowedVariants.has(media.variant)
      ? media.variant
      : 'business-loop';
    const items = Array.isArray(media.items)
      ? media.items.filter(item => typeof item === 'string' && item.trim()).slice(0, 4)
      : [];
    if (items.length < 2) return null;

    const visual = document.createElement('div');
    visual.className = `editorial-infographic infographic-${variant}`;
    appendText(visual, 'span', 'AI生意经原创信息图', 'infographic-kicker');
    appendText(visual, 'h3', media.title || '商业路径拆解');
    const flow = document.createElement('div');
    flow.className = 'infographic-flow';
    items.forEach((item, itemIndex) => {
      const step = document.createElement('div');
      step.className = 'infographic-step';
      appendText(step, 'span', String(itemIndex + 1).padStart(2, '0'), 'infographic-number');
      appendText(step, 'strong', item);
      flow.appendChild(step);
    });
    visual.appendChild(flow);
    figure.appendChild(visual);
  } else if (
    media.type === 'image'
    && ['official-site', 'source-attributed'].includes(media.origin)
  ) {
    if (!mediaUrl) return null;
    const image = document.createElement('img');
    image.src = mediaUrl;
    image.alt = media.alt || media.caption || '项目相关图片';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => figure.remove());
    if (media.origin === 'source-attributed' && sourceUrl) {
      const sourceAnchor = document.createElement('a');
      sourceAnchor.href = sourceUrl;
      sourceAnchor.target = '_blank';
      sourceAnchor.rel = 'noopener noreferrer';
      sourceAnchor.className = 'article-media-link';
      sourceAnchor.setAttribute('aria-label', '查看图片原始页面');
      sourceAnchor.appendChild(image);
      figure.appendChild(sourceAnchor);
    } else {
      figure.appendChild(image);
    }
  } else if (media.type === 'video') {
    if (!mediaUrl) return null;
    const parsedMediaUrl = new URL(mediaUrl);
    const host = parsedMediaUrl.hostname;
    if (!['www.youtube.com', 'youtube.com', 'player.vimeo.com'].includes(host)) return null;
    videoWatchUrl = safeExternalUrl(media.watchUrl);
    if (!videoWatchUrl && host.includes('youtube.com')) {
      const videoId = parsedMediaUrl.pathname.split('/').filter(Boolean).pop();
      if (videoId) videoWatchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
    if (!videoWatchUrl) return null;

    const videoCard = document.createElement('a');
    videoCard.className = 'article-video-card';
    videoCard.href = videoWatchUrl;
    videoCard.target = '_blank';
    videoCard.rel = 'noopener noreferrer';
    videoCard.setAttribute('aria-label', `观看完整视频：${media.caption || '项目相关视频'}`);

    const poster = safeExternalUrl(media.poster);
    if (poster) {
      const posterImage = document.createElement('img');
      posterImage.className = 'article-video-poster';
      posterImage.src = poster;
      posterImage.alt = media.alt || media.caption || '视频封面';
      posterImage.loading = 'lazy';
      posterImage.referrerPolicy = 'no-referrer';
      posterImage.addEventListener('error', () => videoCard.classList.add('poster-unavailable'));
      videoCard.appendChild(posterImage);
    } else {
      videoCard.classList.add('poster-unavailable');
    }

    const play = appendText(videoCard, 'span', '▶', 'article-video-play');
    play.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'article-video-label';
    appendText(label, 'small', media.provider || (host.includes('youtube') ? 'YouTube' : 'Vimeo'));
    appendText(label, 'strong', media.alt || media.caption || '观看完整视频');
    videoCard.appendChild(label);
    figure.appendChild(videoCard);
  } else if (
    media.type === 'video-file'
    && media.origin === 'official-site-video'
  ) {
    if (!mediaUrl) return null;
    videoWatchUrl = safeExternalUrl(media.watchUrl) || mediaUrl;
    const video = document.createElement('video');
    video.src = mediaUrl;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.className = 'article-video';
    const poster = safeExternalUrl(media.poster);
    if (poster) video.poster = poster;
    figure.appendChild(video);
  } else {
    return null;
  }

  const caption = document.createElement('figcaption');
  appendText(caption, 'span', media.caption || '项目相关素材');
  if (videoWatchUrl) {
    const watchLink = appendText(caption, 'a', '观看完整视频 ↗');
    watchLink.href = videoWatchUrl;
    watchLink.target = '_blank';
    watchLink.rel = 'noopener noreferrer';
  }
  figure.appendChild(caption);
  return figure;
}

function buildFallbackArticle(project) {
  return {
    projectId: project.id,
    title: project.nameZh || project.name || '海外创业案例',
    dek: project.summary || '站内项目商业拆解',
    opening: `这是「AI生意经」基于现有项目数据库整理的简版案例。完整编辑稿正在排期生成，你仍可先查看核心商业信息与落地路径。`,
    keyFacts: [
      { label: '营收口径', value: project.revenueDisplay || project.revenue || '未披露' },
      { label: '项目类型', value: project.niche || '创业项目' },
      { label: '可复制指数', value: `${project.replicabilityScore || 7}/10` }
    ],
    sections: [
      {
        heading: '这门生意解决了什么问题',
        paragraphs: [project.insight || project.summary || '暂无详细资料。'],
        callout: ''
      },
      {
        heading: '商业模式与产品路径',
        paragraphs: [
          project.businessModel || '暂无商业模式资料。',
          `产品架构：${project.productArch || '暂无架构资料。'}`,
          `商业闭环：${project.businessLoop || '暂无闭环资料。'}`
        ],
        callout: ''
      },
      {
        heading: '如果在中国市场验证',
        paragraphs: [
          project.chinaOpportunity || '需要结合目标用户进一步验证。',
          ...(Array.isArray(project.getStartedPath) ? project.getStartedPath : [])
        ],
        callout: ''
      }
    ],
    conclusion: '建议先从一个明确用户群和一个高频痛点出发，用最小版本验证真实付费意愿。',
    riskNote: '来源中的营收、团队和增长数据可能随时间变化，请在决策前再次核验。',
    media: [],
    source: {
      name: 'Starter Story',
      url: project.url,
      notice: '本页为本站原创整理与分析，不是来源文章的逐句翻译。'
    },
    website: project.website || '',
    generatedAt: project.updatedAt || '',
    provider: 'local-project-database',
    status: 'summary'
  };
}

function renderArticle(project, article, collectionDate) {
  const root = document.getElementById('caseArticle');
  root.replaceChildren();

  const eyebrow = appendText(root, 'div', 'AI 生意经 · 案例详情', 'case-eyebrow');
  eyebrow.setAttribute('aria-label', 'AI生意经案例详情');
  appendText(root, 'h1', article.title, 'case-title');
  appendText(root, 'p', article.dek, 'case-dek');

  const meta = document.createElement('div');
  meta.className = 'case-meta';
  appendText(meta, 'span', `项目：${project.nameZh || project.name || '海外项目'}`);
  appendText(
    meta,
    'span',
    ['pilot', 'full'].includes(article.status) ? '深度案例' : '简版资料'
  );
  if (collectionDate) {
    appendText(meta, 'span', `采集：${collectionDate}`);
  }
  root.appendChild(meta);

  const opening = appendText(root, 'p', article.opening, 'case-opening');
  opening.insertAdjacentElement('beforebegin', document.createElement('hr'));

  const media = Array.isArray(article.media) ? article.media : [];
  const firstMedia = renderMedia(media[0], 0);
  if (firstMedia) root.appendChild(firstMedia);

  if (Array.isArray(article.keyFacts) && article.keyFacts.length) {
    const facts = document.createElement('section');
    facts.className = 'fact-grid';
    article.keyFacts.slice(0, 6).forEach(fact => {
      const card = document.createElement('div');
      card.className = 'fact-card';
      appendText(card, 'span', fact.label, 'fact-label');
      appendText(card, 'strong', fact.value, 'fact-value');
      facts.appendChild(card);
    });
    root.appendChild(facts);
  }

  (article.sections || []).forEach((section, sectionIndex) => {
    const block = document.createElement('section');
    block.className = 'article-section';
    appendText(block, 'h2', section.heading || `第 ${sectionIndex + 1} 部分`);
    (section.paragraphs || []).forEach(paragraph => {
      appendText(block, 'p', paragraph);
    });
    if (section.callout) {
      appendText(block, 'blockquote', section.callout);
    }
    root.appendChild(block);

    const nextMedia = renderMedia(media[sectionIndex + 1], sectionIndex + 1);
    if (nextMedia) root.appendChild(nextMedia);
  });

  const conclusion = document.createElement('section');
  conclusion.className = 'article-conclusion';
  appendText(conclusion, 'h2', '写在最后');
  appendText(conclusion, 'p', article.conclusion);
  root.appendChild(conclusion);

  document.title = `${article.title}｜AI生意经`;
}

function renderAside(project, article) {
  const aside = document.getElementById('caseAside');
  aside.replaceChildren();

  const card = document.createElement('div');
  card.className = 'aside-card';
  appendText(card, 'h2', '项目速览');
  appendText(card, 'p', project.summary || article.dek);

  const metrics = [
    ['营收口径', project.revenueDisplay || project.revenue || '未披露'],
    ['商业模式', project.businessModel || '待补充'],
    ['中国机会', project.chinaOpportunity || '待验证']
  ];
  metrics.forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'aside-item';
    appendText(item, 'span', label);
    appendText(item, 'strong', value);
    card.appendChild(item);
  });

  const website = safeExternalUrl(article.website || project.website);
  if (website) {
    const link = document.createElement('a');
    link.className = 'aside-cta';
    link.href = website;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '访问项目官网 ↗';
    card.appendChild(link);
  }
  aside.appendChild(card);
}

async function initCasePage() {
  const projectId = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('caseArticle');
  if (!projectId) {
    root.textContent = '缺少项目 ID，请从项目库重新进入。';
    return;
  }

  try {
    const [loadedArticle, collectionDates] = await Promise.all([
      fetchJsonIfAvailable(
        `data/case_articles/${encodeURIComponent(projectId)}.json`
      ),
      fetchJsonIfAvailable('data/case_collection_dates.json')
    ]);
    let article = loadedArticle;
    let project = article?.project || findCuratedProject(projectId);
    if (!project) {
      const projects = await fetchJsonIfAvailable('data/projects_live.json');
      if (!Array.isArray(projects)) throw new Error('项目数据加载失败');
      project = projects.find(item => item.id === projectId) || null;
    }
    if (!project) throw new Error('未找到该项目');
    article ||= buildFallbackArticle(project);
    const collectionDate = resolveCollectionDate(
      projectId,
      article,
      project,
      collectionDates
    );
    renderArticle(project, article, collectionDate);
    renderAside(project, article);
  } catch (error) {
    root.textContent = `案例详情暂时无法加载：${error.message}`;
  }
}

document.addEventListener('DOMContentLoaded', initCasePage);

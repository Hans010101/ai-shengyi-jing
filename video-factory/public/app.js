const OFFICIAL_ORIGIN = 'https://ai-shengyi-video-studio.pages.dev';
const WORKER_ORIGIN = 'https://ai-shengyi-video-factory.hans-pan007.workers.dev';
const isLocalFile = location.protocol === 'file:';
const apiOrigin = location.hostname === 'ai-shengyi-video-studio.pages.dev' || isLocalFile ? WORKER_ORIGIN : location.origin;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storage = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};
const state = {
  sourceType: 'text',
  session: storage.get('factorySession'),
  sessionExpiry: storage.get('factorySessionExpiry'),
  key: storage.get('factoryKey'),
  accessMode: 'activation',
  selectedCase: null,
  bookLoaded: false,
  jobs: [],
  health: null,
  pending: false
};
const hasAccess = () => Boolean(state.session || state.key);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const stageNames = { queued: '排队等待', source: '解析与提炼', script: '脚本与节奏', render: '分镜 / 素材 / 配音 / 字幕', quality: '质量检查', published: '成片已发布', failed: '需要处理' };
const sourceCopy = {
  text: ['粘贴文本', '适合文章、章节摘录和笔记；系统会先提炼主题与事实，再生成脚本。'],
  topic: ['自由主题', '说清楚主题、目标观众和核心观点；系统会把想法整理成有开场、论证和结尾的脚本。'],
  article: ['文章链接', '粘贴公开网页地址；云端会安全抓取正文。需要登录、公众号或反爬页面请改用粘贴文本。'],
  book: ['书籍文件', 'TXT、Markdown、HTML 可直接读取；PDF、EPUB、DOCX 请先导出 TXT，这是当前真实可用的降级路径。'],
  'ai-shengyi-case': ['AI 生意经案例', '从现有案例库选择一个项目，沿用商业案例的事实证据、素材与叙事模板。']
};

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  if (isLocalFile) throw new Error('本地预览不能连接生产接口，请打开正式生产台。');
  const headers = {
    'Content-Type': 'application/json',
    ...(state.session ? { Authorization: `Bearer ${state.session}` } : state.key ? { 'X-Factory-Key': state.key } : {}),
    ...options.headers
  };
  const response = await fetch(`${apiOrigin}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.detail || data.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function updateAccessUI() {
  const active = hasAccess();
  $('#keyButton').textContent = active ? '生产权限 · 已激活' : '生产权限';
  $('#keyButton').classList.toggle('access-granted', active);
  $('#accessActive').hidden = !active;
  $('#activationFields').hidden = active || state.accessMode !== 'activation';
  $('#advancedFields').hidden = active || state.accessMode !== 'advanced';
  $('#activateSubmit').hidden = active;
  if (active) {
    const expiry = state.sessionExpiry ? `设备权限有效至 ${new Date(state.sessionExpiry).toLocaleDateString('zh-CN')}。` : '管理员生产密钥已在本浏览器启用。';
    $('#accessExpiry').textContent = `${expiry} 可创建、查看和下载生产任务。`;
  }
}

function openAccessDialog() {
  if (isLocalFile) {
    window.open(`${OFFICIAL_ORIGIN}/`, '_blank', 'noopener');
    toast('已打开正式生产台');
    return;
  }
  $('#keyError').textContent = '';
  updateAccessUI();
  $('#keyDialog').showModal();
}

function switchSource(type, focus = false) {
  if (!sourceCopy[type]) return;
  state.sourceType = type;
  $$('.source-tabs button').forEach(button => {
    const selected = button.dataset.source === type;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  const isCase = type === 'ai-shengyi-case';
  $('#caseSource').hidden = !isCase;
  $('#standardSource').hidden = isCase;
  $('#urlLabel').hidden = type !== 'article';
  $('#bookInput').hidden = type !== 'book';
  $('#textLabel').hidden = type === 'article' || (type === 'book' && !state.bookLoaded);
  $('#standardSource').setAttribute('aria-labelledby', `tab-${type}`);
  const [title, description] = sourceCopy[type];
  $('#sourceGuide').innerHTML = `<b>${escapeHtml(title)}</b><span>${escapeHtml(description)}</span>`;
  const placeholders = {
    text: ['例如：为什么我们总是低估复利', '粘贴文章、章节摘录或你的笔记。建议 300 字以上。'],
    topic: ['例如：用三分钟讲清楚机会成本', '描述你想讲清楚的主题、目标观众和核心观点。'],
    article: ['可选：系统也可以从文章提炼标题', ''],
    book: ['默认使用文件名，可自行修改', '']
  };
  $('#title').placeholder = placeholders[type]?.[0] || '';
  $('#sourceText').placeholder = placeholders[type]?.[1] || '';
  $('#formError').textContent = '';
}

$$('.source-tabs button').forEach((button, index, buttons) => {
  button.onclick = () => switchSource(button.dataset.source);
  button.onkeydown = event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    switchSource(buttons[next].dataset.source, true);
  };
});

$('#sourceText').oninput = event => $('#charCount').textContent = event.target.value.length.toLocaleString('zh-CN');
$('#bookFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  $('#formError').textContent = '';
  if (file.size > 5 * 1024 * 1024) {
    $('#formError').textContent = '文件超过 5 MB。请只导出需要制作的章节为 TXT，或分段粘贴正文。';
    event.target.value = '';
    return;
  }
  const extension = file.name.split('.').pop().toLowerCase();
  $('#title').value = $('#title').value || file.name.replace(/\.[^.]+$/, '');
  if (['txt', 'md', 'html', 'htm'].includes(extension)) {
    const text = await file.text();
    $('#sourceText').value = text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16000);
    state.bookLoaded = true;
    $('#textLabel').hidden = false;
    $('#textLabel').firstChild.textContent = '已提取正文（可编辑） ';
    $('#charCount').textContent = $('#sourceText').value.length.toLocaleString('zh-CN');
    toast(`已读取 ${file.name}`);
  } else {
    $('#formError').textContent = '当前 Cloudflare 原生流程不直接解析 PDF / EPUB / DOCX。请在本机导出为 TXT 后重新选择，或切换“粘贴文本”。';
    event.target.value = '';
  }
};

async function searchCases() {
  const query = $('#caseQuery').value.trim();
  $('#caseGrid').innerHTML = '<p class="empty">正在读取案例库…</p>';
  try {
    const data = await api(`/api/catalog?q=${encodeURIComponent(query)}&pageSize=12`);
    $('#caseGrid').innerHTML = data.items.map(item => `<article class="case-card" data-case="${escapeHtml(item.id)}" tabindex="0"><img src="${escapeHtml(item.image)}" alt=""><div><b>${escapeHtml(item.name)}</b><p>${escapeHtml(item.category)} · ${item.mediaCount} 份素材</p></div></article>`).join('') || '<p class="empty">没有找到相关案例。</p>';
    $$('[data-case]').forEach(card => {
      const select = () => {
        $$('[data-case]').forEach(candidate => candidate.classList.remove('selected'));
        card.classList.add('selected');
        state.selectedCase = card.dataset.case;
        toast('已选择案例');
      };
      card.onclick = select;
      card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } };
    });
  } catch (error) {
    $('#caseGrid').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

$('#searchCase').onclick = searchCases;
$('#caseQuery').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); searchCases(); } };

function getPayload() {
  const sourceType = state.sourceType;
  const options = {
    templateId: sourceType === 'ai-shengyi-case' ? 'ai-shengyi-case-v1' : 'knowledge-director-v1',
    visualPreset: $('#visual').value,
    aspectRatio: $('#ratio').value,
    durationSeconds: Number($('#duration').value),
    voice: $('#voice').value,
    voiceRate: Number($('#voiceRate').value),
    brandPreset: sourceType === 'ai-shengyi-case' ? 'ai-shengyi-jing' : 'studio-neutral',
    bgm: $('#bgm').checked,
    autoDucking: $('#ducking').checked
  };
  if (sourceType === 'ai-shengyi-case') return { caseId: state.selectedCase, options };
  return { source: { sourceType, title: $('#title').value.trim(), text: $('#sourceText').value.trim(), url: $('#sourceUrl').value.trim() }, options };
}

async function submit() {
  const payload = getPayload();
  if (state.sourceType === 'ai-shengyi-case' && !payload.caseId) throw new Error('请先搜索并选择一个案例。');
  if (state.sourceType === 'article' && !payload.source.url) throw new Error('请输入公开文章链接。');
  if (state.sourceType !== 'article' && payload.source && payload.source.text.length < 12) throw new Error('请至少提供 12 个字的主题或正文。');
  if (isLocalFile) {
    window.open(`${OFFICIAL_ORIGIN}/`, '_blank', 'noopener');
    throw new Error('本地页面仅供预览，已为你打开正式生产台。');
  }
  if (!hasAccess()) {
    state.pending = true;
    openAccessDialog();
    return;
  }
  const button = $('#submit');
  button.disabled = true;
  button.querySelector('span').textContent = '正在创建生产任务';
  try {
    const result = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
    toast('任务已进入生产队列');
    $('#formError').textContent = '';
    await loadJobs();
    location.hash = 'jobs';
    return result;
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = '生成脚本并开始生产';
  }
}

$('#createForm').onsubmit = async event => {
  event.preventDefault();
  try { await submit(); } catch (error) { $('#formError').textContent = error.message; }
};

function clearAccess() {
  state.session = '';
  state.sessionExpiry = '';
  state.key = '';
  storage.remove('factorySession');
  storage.remove('factorySessionExpiry');
  storage.remove('factoryKey');
  updateAccessUI();
}

async function loadJobs() {
  if (isLocalFile) {
    $('#jobList').innerHTML = `<p class="empty">本地预览不读取生产数据。请在 <a href="${OFFICIAL_ORIGIN}/#jobs">正式生产台</a> 查看任务。</p>`;
    return;
  }
  if (!hasAccess()) {
    $('#jobList').innerHTML = '<p class="empty">启用生产权限后，这里会显示脚本、分镜、音频、质检与成片状态。</p>';
    return;
  }
  try {
    const data = await api('/api/jobs');
    state.jobs = data.jobs || [];
    renderJobs();
  } catch (error) {
    if (error.status === 401) {
      clearAccess();
      $('#jobList').innerHTML = '<p class="empty">生产权限已过期或失效，请重新激活本设备。</p>';
    } else {
      $('#jobList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    }
  }
}

function renderJobs() {
  if (!state.jobs.length) {
    $('#jobList').innerHTML = '<p class="empty">还没有任务。从上方创建第一条视频。</p>';
    return;
  }
  $('#jobList').innerHTML = state.jobs.map(job => `<article class="job" data-job="${job.id}" tabindex="0"><div><h3>${escapeHtml(job.source_title || job.case_name || job.case_id)}</h3><small>${escapeHtml(job.source_type || 'ai-shengyi-case')} · ${new Date(job.created_at).toLocaleString('zh-CN')}</small></div><div><small>${escapeHtml(stageNames[job.stage] || job.stage)}</small><div class="bar"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div></div><span class="tag ${job.status}">${job.artifacts_deleted_at ? '成片已清理' : job.status === 'succeeded' ? `通过 · ${job.qa_score || '—'}分` : job.status === 'failed' ? '需要处理' : '生产中'}</span><button class="quiet">详情</button></article>`).join('');
  $$('[data-job]').forEach(card => {
    card.onclick = () => openJob(card.dataset.job);
    card.onkeydown = event => { if (event.key === 'Enter') openJob(card.dataset.job); };
  });
}

async function openJob(id) {
  try {
    const job = await api(`/api/jobs/${id}`);
    const events = (job.events || []).map(event => `<li><b>${escapeHtml(stageNames[event.stage] || event.stage)}</b> ${escapeHtml(event.message)} <small>${new Date(event.created_at).toLocaleString('zh-CN')}</small></li>`).join('');
    const outputs = job.outputs && !job.artifacts_deleted_at;
    $('#jobDetail').innerHTML = `<button class="close" type="button" aria-label="关闭">×</button><p class="section-no">${escapeHtml(job.source_type || 'PROJECT')}</p><h2>${escapeHtml(job.source_title || job.case_name || job.case_id)}</h2><p>${escapeHtml(stageNames[job.stage] || job.stage)} · ${job.progress || 0}% · 第 ${job.attempt || 0} 轮${job.qa_score ? ` · ${job.qa_score}分` : ''}</p>${job.error_message ? `<p class="error">${escapeHtml(job.error_message)}</p>` : ''}<div class="detail-actions">${outputs ? `<a class="primary" href="${apiOrigin}${job.outputs.video}?download=1">下载成片</a><a class="quiet" target="_blank" href="${apiOrigin}${job.outputs.video}">播放</a><a class="quiet" target="_blank" href="${apiOrigin}${job.outputs.qa}">质量报告</a>` : ''}${job.status === 'failed' ? '<button id="retryJob" class="quiet">自动修复并重试</button>' : ''}</div><h3>生产记录</h3><ol class="timeline">${events || '<li>任务已创建</li>'}</ol>`;
    $('#jobDialog .close').onclick = () => $('#jobDialog').close();
    if ($('#retryJob')) $('#retryJob').onclick = async () => { await api(`/api/jobs/${id}/retry`, { method: 'POST' }); $('#jobDialog').close(); toast('已重新提交'); loadJobs(); };
    $('#jobDialog').showModal();
  } catch (error) { toast(error.message); }
}

$('#refresh').onclick = loadJobs;
$('#keyButton').onclick = openAccessDialog;
$('#keyDialog .close').onclick = () => $('#keyDialog').close();
$('#showAdvanced').onclick = () => { state.accessMode = 'advanced'; updateAccessUI(); $('#factoryKey').focus(); };
$('#showActivation').onclick = () => { state.accessMode = 'activation'; updateAccessUI(); $('#activationCode').focus(); };
$('#forgetAccess').onclick = () => { clearAccess(); $('#keyDialog').close(); loadJobs(); toast('本设备生产权限已停用'); };

$('#keyForm').onsubmit = async event => {
  event.preventDefault();
  $('#keyError').textContent = '';
  $('#activateSubmit').disabled = true;
  $('#activateSubmit').textContent = state.accessMode === 'activation' ? '正在激活…' : '正在验证…';
  try {
    if (state.accessMode === 'activation') {
      const code = $('#activationCode').value.trim();
      if (!code) throw new Error('请输入设备激活码。');
      const result = await api('/api/activate', { method: 'POST', body: JSON.stringify({ code }) });
      state.session = result.token;
      state.sessionExpiry = result.expiresAt;
      state.key = '';
      storage.set('factorySession', state.session);
      storage.set('factorySessionExpiry', state.sessionExpiry);
      storage.remove('factoryKey');
      $('#activationCode').value = '';
    } else {
      state.key = $('#factoryKey').value.trim();
      if (!state.key) throw new Error('请输入生产密钥。');
      state.session = '';
      await api('/api/jobs');
      storage.set('factoryKey', state.key);
      storage.remove('factorySession');
      storage.remove('factorySessionExpiry');
    }
    updateAccessUI();
    $('#keyDialog').close();
    toast('云端生产已启用');
    await loadJobs();
    if (state.pending) { state.pending = false; await submit(); }
  } catch (error) {
    if (state.accessMode === 'advanced') state.key = '';
    $('#keyError').textContent = error.status === 401 ? '生产密钥不正确。' : error.message;
  } finally {
    $('#activateSubmit').disabled = false;
    $('#activateSubmit').textContent = '激活并继续';
  }
};

async function bootstrap() {
  switchSource('text');
  updateAccessUI();
  if (isLocalFile) {
    $('#localNotice').hidden = false;
    $('#cloudState').innerHTML = '<i style="background:#bd9b59"></i>本地预览';
    $('#keyButton').textContent = '打开正式生产台';
    await loadJobs();
    return;
  }
  try {
    state.health = await api('/api/health');
    $('#cloudState').innerHTML = `<i style="background:${state.health.renderer.enabled ? '#356b55' : '#bd9b59'}"></i>${state.health.renderer.enabled ? '云端生产就绪' : '渲染服务未启用'}`;
    if (!state.health.renderer.enabled) $('#formError').textContent = '当前云端渲染未启用；可浏览产品，但无法创建真实生产任务。';
  } catch {
    $('#cloudState').innerHTML = '<i style="background:#a13f35"></i>服务离线';
  }
  await loadJobs();
}

bootstrap();
setInterval(() => { if (!isLocalFile && hasAccess()) loadJobs(); }, 12000);

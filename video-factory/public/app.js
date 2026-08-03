const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const OFFICIAL_ORIGIN = 'https://ai-shengyi-video-studio.pages.dev';
const DEFAULT_API_ORIGIN = 'https://ai-shengyi-video-factory.hans-pan007.workers.dev';
const isLocalFile = location.protocol === 'file:';
const apiOrigin = isLocalFile ? DEFAULT_API_ORIGIN : location.hostname.endsWith('pages.dev') ? DEFAULT_API_ORIGIN : location.origin;
const storage = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};

const state = {
  sourceType: 'script', imports: [], selectedCase: null, bookLoaded: false, jobs: [], health: null, pending: false,
  accessMode: 'activation', session: storage.get('factorySession'), sessionExpiry: storage.get('factorySessionExpiry'), key: storage.get('factoryKey'), routeTouched: false
};
const hasAccess = () => Boolean(state.session || state.key);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const stageNames = { queued: '排队等待', source: '解析与提炼', script: '脚本与节奏', render: '分镜 / 插画 / 配音 / 字幕', quality: '质量检查', published: '成片已发布', failed: '需要处理' };
const sourceCopy = {
  script: ['上传文案', 'DOCX、Markdown 或 TXT 一份文件生成一条视频；保留原稿措辞，只做分段、配音、字幕与分镜。'],
  text: ['粘贴文本', '适合文章、章节摘录和笔记；系统先提炼主题与事实，再生成适合口播的脚本。'],
  topic: ['自由主题', '说清主题、观众和核心观点；系统整理为有开场、论证和结尾的短视频脚本。'],
  article: ['文章链接', '粘贴公开网页地址；需要登录、公众号或反爬页面请改用粘贴文本。'],
  book: ['书籍摘录', '导入 DOCX、Markdown 或 TXT 章节；长书先整理为单条视频需要讲清的一段。'],
  'ai-shengyi-case': ['AI 生意经案例', '从现有案例库选择项目，沿用已调试的事实证据、真实素材与商业案例路线。']
};
const lineCopy = {
  'comic-engraving-v1': '深绿木刻插画、象牙白线稿、黄色字幕；逐分镜生成专属画面。',
  'knowledge-director-v1': '用结构图、动态信息层和重点字幕讲清复杂内容。',
  'ai-shengyi-case-v1': '沿用 AI 生意经真实素材、商业叙事与原有质量门。'
};

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2800);
}

async function api(path, options = {}) {
  if (isLocalFile) throw new Error('本地预览不能连接生产接口，请打开正式生产台。');
  const headers = { 'Content-Type': 'application/json', ...(state.session ? { Authorization: `Bearer ${state.session}` } : state.key ? { 'X-Factory-Key': state.key } : {}), ...options.headers };
  const response = await fetch(`${apiOrigin}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.detail || data.error || `请求失败（${response.status}）`); error.status = response.status; throw error; }
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
  if (active) $('#accessExpiry').textContent = state.sessionExpiry ? `设备权限有效至 ${new Date(state.sessionExpiry).toLocaleDateString('zh-CN')}，可批量创建与下载成片。` : '管理员生产密钥已在本浏览器启用。';
}

function openAccessDialog() {
  if (isLocalFile) { window.open(`${OFFICIAL_ORIGIN}/`, '_blank', 'noopener'); toast('已打开正式生产台'); return; }
  $('#keyError').textContent = ''; updateAccessUI(); $('#keyDialog').showModal();
}

function chooseRouteForSource(type) {
  const select = $('#productionLine');
  [...select.options].forEach(option => { option.disabled = type === 'ai-shengyi-case' ? option.value !== 'ai-shengyi-case-v1' : option.value === 'ai-shengyi-case-v1'; });
  if (type === 'ai-shengyi-case') select.value = 'ai-shengyi-case-v1';
  else if (type === 'script' && (!state.routeTouched || select.value === 'ai-shengyi-case-v1')) select.value = 'comic-engraving-v1';
  else if (select.value === 'ai-shengyi-case-v1') select.value = 'knowledge-director-v1';
  $('#lineDescription').textContent = lineCopy[select.value];
}

function updateSubmitCopy() {
  const label = state.sourceType === 'script' ? '创建批量生产任务' : state.sourceType === 'ai-shengyi-case' ? '创建商业案例任务' : '生成脚本并开始生产';
  const hint = state.sourceType === 'script' ? `${state.imports.length} 份文案 · Cloudflare AI → HyperFrames → R2` : state.sourceType === 'ai-shengyi-case' ? 'AI 生意经案例路线 · 真实来源素材' : '内容提炼 → 脚本 → HyperFrames → R2';
  $('#submit span').textContent = label; $('#submitHint').textContent = hint;
}

function switchSource(type, focus = false) {
  if (!sourceCopy[type]) return;
  state.sourceType = type;
  $$('.source-tabs button').forEach(button => {
    const selected = button.dataset.source === type; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; if (selected && focus) button.focus();
  });
  const isCase = type === 'ai-shengyi-case';
  $('#caseSource').hidden = !isCase; $('#standardSource').hidden = isCase;
  $('#scriptInput').hidden = type !== 'script'; $('#manualInput').hidden = type === 'script';
  $('#urlLabel').hidden = type !== 'article'; $('#bookInput').hidden = type !== 'book';
  $('#textLabel').hidden = type === 'article' || (type === 'book' && !state.bookLoaded);
  $('#title').parentElement.hidden = type === 'article' || (type === 'book' && !state.bookLoaded);
  $('#standardSource').setAttribute('aria-labelledby', `tab-${type}`);
  const [title, description] = sourceCopy[type]; $('#sourceGuide').innerHTML = `<b>${escapeHtml(title)}</b><span>${escapeHtml(description)}</span>`;
  chooseRouteForSource(type); updateSubmitCopy(); $('#formError').textContent = '';
}

$$('.source-tabs button').forEach((button, index, buttons) => {
  button.onclick = () => switchSource(button.dataset.source);
  button.onkeydown = event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length; else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = buttons.length - 1; else return;
    event.preventDefault(); switchSource(buttons[next].dataset.source, true);
  };
});

$('#productionLine').onchange = event => { state.routeTouched = true; $('#lineDescription').textContent = lineCopy[event.target.value]; };
$('#sourceText').oninput = event => $('#charCount').textContent = event.target.value.length.toLocaleString('zh-CN');

function renderImportQueue() {
  const queue = $('#fileQueue');
  if (!state.imports.length) queue.innerHTML = '<p class="empty">尚未导入文案。支持一次选择多份文件。</p>';
  else queue.innerHTML = state.imports.map(item => `<article class="file-row"><div><b title="${escapeHtml(item.filename)}">${escapeHtml(item.title)}</b><small>${escapeHtml(item.filename)} · ${item.characters} 字 · 约 ${item.estimatedSeconds} 秒</small></div><span class="ready">可生产</span><button type="button" data-remove="${item.id}" aria-label="移除">×</button></article>`).join('');
  $$('[data-remove]').forEach(button => button.onclick = () => { state.imports = state.imports.filter(item => item.id !== button.dataset.remove); renderImportQueue(); });
  if (state.sourceType === 'script') updateSubmitCopy();
}

function closestDuration(seconds) { return [30,60,90,120,180].find(value => seconds <= value) || 180; }
async function importFiles(fileList) {
  const files = [...fileList];
  $('#formError').textContent = '';
  if (state.imports.length + files.length > 20) { $('#formError').textContent = '每批最多 20 份文案。'; return; }
  let failures = [];
  for (const file of files) {
    try {
      const imported = await window.ScriptImporter.read(file);
      if (!state.imports.some(item => item.filename === imported.filename && item.text === imported.text)) state.imports.push(imported);
    } catch (error) { failures.push(`${file.name}：${error.message}`); }
  }
  renderImportQueue();
  if (state.imports.length) $('#duration').value = String(closestDuration(Math.max(...state.imports.map(item => item.estimatedSeconds))));
  if (failures.length) $('#formError').textContent = failures.join('；'); else if (files.length) toast(`已读取 ${files.length} 份文案`);
  $('#scriptFiles').value = '';
}

$('#scriptFiles').onchange = event => importFiles(event.target.files);
const featuredDrop = $('.featured-drop');
for (const eventName of ['dragenter','dragover']) featuredDrop.addEventListener(eventName, event => { event.preventDefault(); featuredDrop.classList.add('dragging'); });
for (const eventName of ['dragleave','drop']) featuredDrop.addEventListener(eventName, event => { event.preventDefault(); featuredDrop.classList.remove('dragging'); });
featuredDrop.addEventListener('drop', event => importFiles(event.dataTransfer.files));

$('#bookFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = await window.ScriptImporter.read(file);
    $('#title').value = imported.title; $('#sourceText').value = imported.text; $('#charCount').textContent = String(imported.characters);
    state.bookLoaded = true; $('#textLabel').hidden = false; $('#title').parentElement.hidden = false; toast(`已读取 ${file.name}`);
  } catch (error) { $('#formError').textContent = error.message; event.target.value = ''; }
};

async function searchCases() {
  const query = $('#caseQuery').value.trim(); $('#caseGrid').innerHTML = '<p class="empty">正在读取案例库…</p>';
  try {
    const data = await api(`/api/catalog?q=${encodeURIComponent(query)}&pageSize=12`);
    $('#caseGrid').innerHTML = data.items.map(item => `<article class="case-card" data-case="${escapeHtml(item.id)}" tabindex="0"><img src="${escapeHtml(item.image)}" alt=""><div><b>${escapeHtml(item.name)}</b><p>${escapeHtml(item.category)} · ${item.mediaCount} 份素材</p></div></article>`).join('') || '<p class="empty">没有找到相关案例。</p>';
    $$('[data-case]').forEach(card => { const select = () => { $$('[data-case]').forEach(candidate => candidate.classList.remove('selected')); card.classList.add('selected'); state.selectedCase = card.dataset.case; toast('已选择案例'); }; card.onclick = select; card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }; });
  } catch (error) { $('#caseGrid').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
$('#searchCase').onclick = searchCases;
$('#caseQuery').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); searchCases(); } };

function commonOptions() {
  return { productionLineId: $('#productionLine').value, templateId: $('#productionLine').value, aspectRatio: $('#ratio').value, durationSeconds: Number($('#duration').value), voice: $('#voice').value, voiceRate: Number($('#voiceRate').value), bgm: $('#bgm').checked, autoDucking: $('#ducking').checked };
}
function getPayload() {
  const options = commonOptions();
  if (state.sourceType === 'script') return { sources: state.imports.map(item => ({ sourceType: 'script', title: item.title, text: item.text })), options };
  if (state.sourceType === 'ai-shengyi-case') return { caseId: state.selectedCase, options };
  return { source: { sourceType: state.sourceType, title: $('#title').value.trim(), text: $('#sourceText').value.trim(), url: $('#sourceUrl').value.trim() }, options };
}

async function submit() {
  const payload = getPayload();
  if (state.sourceType === 'script' && !payload.sources.length) throw new Error('请先导入至少一份 DOCX、Markdown 或 TXT 文案。');
  if (state.sourceType === 'ai-shengyi-case' && !payload.caseId) throw new Error('请先搜索并选择一个案例。');
  if (state.sourceType === 'article' && !payload.source.url) throw new Error('请输入公开文章链接。');
  if (!['script','article','ai-shengyi-case'].includes(state.sourceType) && payload.source.text.length < 12) throw new Error('请至少提供 12 个字的主题或正文。');
  if (isLocalFile) { window.open(`${OFFICIAL_ORIGIN}/`, '_blank', 'noopener'); throw new Error('本地页面仅供预览，已打开正式生产台。'); }
  if (!hasAccess()) { state.pending = true; openAccessDialog(); return; }
  const button = $('#submit'); button.disabled = true; button.querySelector('span').textContent = '正在创建生产任务';
  try {
    const result = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
    toast(`已创建 ${result.count} 条生产任务`); $('#formError').textContent = '';
    if (state.sourceType === 'script') { state.imports = []; renderImportQueue(); }
    await loadJobs(); location.hash = 'jobs'; return result;
  } finally { button.disabled = false; updateSubmitCopy(); }
}
$('#createForm').onsubmit = async event => { event.preventDefault(); try { await submit(); } catch (error) { $('#formError').textContent = error.message; } };

function clearAccess() { state.session = ''; state.sessionExpiry = ''; state.key = ''; storage.remove('factorySession'); storage.remove('factorySessionExpiry'); storage.remove('factoryKey'); updateAccessUI(); }
async function loadJobs() {
  if (isLocalFile) { $('#jobList').innerHTML = `<p class="empty">本地预览不读取生产数据。请在 <a href="${OFFICIAL_ORIGIN}/#jobs">正式生产台</a> 查看任务。</p>`; return; }
  if (!hasAccess()) { $('#jobList').innerHTML = '<p class="empty">启用生产权限后，这里会显示脚本、分镜、插画、音频、质检与成片状态。</p>'; return; }
  try { const data = await api('/api/jobs'); state.jobs = data.jobs || []; renderJobs(); }
  catch (error) { if (error.status === 401) { clearAccess(); $('#jobList').innerHTML = '<p class="empty">生产权限已过期，请重新激活本设备。</p>'; } else $('#jobList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
function renderJobs() {
  if (!state.jobs.length) { $('#jobList').innerHTML = '<p class="empty">还没有任务。从上方导入第一批文案。</p>'; return; }
  $('#jobList').innerHTML = state.jobs.map(job => `<article class="job" data-job="${job.id}" tabindex="0"><div><h3>${escapeHtml(job.source_title || job.case_name || job.case_id)}</h3><small>${escapeHtml(job.template_id || job.source_type)} · ${new Date(job.created_at).toLocaleString('zh-CN')}</small></div><div><small>${escapeHtml(stageNames[job.stage] || job.stage)}</small><div class="bar"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div></div><span class="tag ${job.status}">${job.artifacts_deleted_at ? '成片已清理' : job.status === 'succeeded' ? `通过 · ${job.qa_score || '—'}分` : job.status === 'failed' ? '需要处理' : '生产中'}</span><button class="quiet">详情</button></article>`).join('');
  $$('[data-job]').forEach(card => { card.onclick = () => openJob(card.dataset.job); card.onkeydown = event => { if (event.key === 'Enter') openJob(card.dataset.job); }; });
}
async function openJob(id) {
  try {
    const job = await api(`/api/jobs/${id}`); const events = (job.events || []).map(event => `<li><b>${escapeHtml(stageNames[event.stage] || event.stage)}</b> ${escapeHtml(event.message)} <small>${new Date(event.created_at).toLocaleString('zh-CN')}</small></li>`).join(''); const outputs = job.outputs && !job.artifacts_deleted_at;
    $('#jobDetail').innerHTML = `<button class="close" type="button" aria-label="关闭">×</button><p class="section-no">${escapeHtml(job.template_id || job.source_type || 'PROJECT')}</p><h2>${escapeHtml(job.source_title || job.case_name || job.case_id)}</h2><p>${escapeHtml(stageNames[job.stage] || job.stage)} · ${job.progress || 0}% · 第 ${job.attempt || 0} 轮${job.qa_score ? ` · ${job.qa_score}分` : ''}</p>${job.error_message ? `<p class="error">${escapeHtml(job.error_message)}</p>` : ''}<div class="detail-actions">${outputs ? `<a class="primary" href="${apiOrigin}${job.outputs.video}?download=1">下载成片</a><a class="quiet" target="_blank" href="${apiOrigin}${job.outputs.video}">播放</a><a class="quiet" target="_blank" href="${apiOrigin}${job.outputs.qa}">质量报告</a>` : ''}${job.status === 'failed' ? '<button id="retryJob" class="quiet">自动修复并重试</button>' : ''}</div><h3>生产记录</h3><ol class="timeline">${events || '<li>任务已创建</li>'}</ol>`;
    $('#jobDialog .close').onclick = () => $('#jobDialog').close(); if ($('#retryJob')) $('#retryJob').onclick = async () => { await api(`/api/jobs/${id}/retry`, { method: 'POST' }); $('#jobDialog').close(); toast('已重新提交'); loadJobs(); }; $('#jobDialog').showModal();
  } catch (error) { toast(error.message); }
}

$('#refresh').onclick = loadJobs; $('#keyButton').onclick = openAccessDialog; $('#keyDialog .close').onclick = () => $('#keyDialog').close();
$('#showAdvanced').onclick = () => { state.accessMode = 'advanced'; updateAccessUI(); $('#factoryKey').focus(); };
$('#showActivation').onclick = () => { state.accessMode = 'activation'; updateAccessUI(); $('#activationCode').focus(); };
$('#forgetAccess').onclick = () => { clearAccess(); $('#keyDialog').close(); loadJobs(); toast('本设备生产权限已停用'); };
$('#keyForm').onsubmit = async event => {
  event.preventDefault(); $('#keyError').textContent = ''; $('#activateSubmit').disabled = true; $('#activateSubmit').textContent = state.accessMode === 'activation' ? '正在激活…' : '正在验证…';
  try {
    if (state.accessMode === 'activation') { const code = $('#activationCode').value.trim(); if (!code) throw new Error('请输入设备激活码。'); const result = await api('/api/activate', { method: 'POST', body: JSON.stringify({ code }) }); state.session = result.token; state.sessionExpiry = result.expiresAt; state.key = ''; storage.set('factorySession', state.session); storage.set('factorySessionExpiry', state.sessionExpiry); storage.remove('factoryKey'); $('#activationCode').value = ''; }
    else { state.key = $('#factoryKey').value.trim(); if (!state.key) throw new Error('请输入生产密钥。'); state.session = ''; await api('/api/jobs'); storage.set('factoryKey', state.key); storage.remove('factorySession'); storage.remove('factorySessionExpiry'); }
    updateAccessUI(); $('#keyDialog').close(); toast('云端生产已启用'); await loadJobs(); if (state.pending) { state.pending = false; await submit(); }
  } catch (error) { if (state.accessMode === 'advanced') state.key = ''; $('#keyError').textContent = error.status === 401 ? '生产密钥不正确。' : error.message; }
  finally { $('#activateSubmit').disabled = false; $('#activateSubmit').textContent = '激活并继续'; }
};

async function bootstrap() {
  switchSource('script'); renderImportQueue(); updateAccessUI();
  if (isLocalFile) { $('#localNotice').hidden = false; $('#cloudState').innerHTML = '<i style="background:#bd9b59"></i>本地预览'; $('#keyButton').textContent = '打开正式生产台'; await loadJobs(); return; }
  try { state.health = await api('/api/health'); $('#cloudState').innerHTML = `<i style="background:${state.health.renderer.enabled ? '#356b55' : '#bd9b59'}"></i>${state.health.renderer.enabled ? '云端生产就绪' : '渲染服务未启用'}`; if (!state.health.renderer.enabled) $('#formError').textContent = '当前云端渲染未启用。'; }
  catch { $('#cloudState').innerHTML = '<i style="background:#a13f35"></i>服务离线'; }
  await loadJobs();
}
bootstrap();
setInterval(() => { if (!isLocalFile && hasAccess()) loadJobs(); }, 12000);

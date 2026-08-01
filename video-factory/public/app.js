const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  key: sessionStorage.getItem('factoryKey') || '', jobs: [], catalog: [], selected: new Map(),
  category: '', catalogQuery: '', catalogPage: 1, catalogTotal: 0, categories: [], jobStatus: 'all', jobQuery: '', activeJob: null
};
const stages = {queued:'等待调度',source:'读取事实与素材',script:'编写中文脚本',render:'画面与配音渲染',quality:'七道质量检查',published:'成片已发布',failed:'任务未通过'};
const statusNames = {queued:'排队中',running:'生产中',succeeded:'已通过品控',failed:'需要处理'};
const errorNames = {CASE_NOT_FOUND:'没有找到这个案例',INSUFFICIENT_MEDIA:'有效素材不足 3 份',INSUFFICIENT_VALID_MEDIA:'素材清晰度或相关性不足',QUALITY_GATE_FAILED:'成片未通过自动品控',RENDER_FAILED:'渲染过程失败',RENDER_TIMEOUT:'渲染超时'};
const isLocalFile = location.protocol === 'file:';
const productionApiOrigin = 'https://ai-shengyi-video-factory.workers.dev';
const apiOrigin = location.hostname.endsWith('.pages.dev') ? productionApiOrigin : '';
let catalogTimer;

function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function formatDate(value,withTime=true){if(!value)return '—';const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';return new Intl.DateTimeFormat('zh-CN',withTime?{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}:{year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function showToast(text){const toast=$('#toast');toast.textContent=text;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}
function setConnected(online){const el=$('#connectionState');el.classList.toggle('online',online);el.lastChild.textContent=online?' 已连接':' 等待连接'}
function showAccess(message=''){$('#accessKey').value=state.key;$('#accessError').textContent=message;if(!$('#accessDialog').open)$('#accessDialog').showModal();setTimeout(()=>$('#accessKey').focus(),30)}

async function api(path,options={}){
  const response=await fetch(`${apiOrigin}${path}`,{...options,headers:{'Content-Type':'application/json','X-Factory-Key':state.key,...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.detail||errorNames[data.error]||data.error||`请求失败（${response.status}）`);error.status=response.status;throw error}
  return data;
}

function updateStats(){
  const running=state.jobs.filter(job=>job.status==='running'||job.status==='queued').length;
  const passed=state.jobs.filter(job=>job.status==='succeeded').length;
  $('#statAll').textContent=state.jobs.length;$('#statRunning').textContent=running;$('#statPassed').textContent=passed;
  const counts={all:state.jobs.length,running, succeeded:passed, failed:state.jobs.filter(job=>job.status==='failed').length};
  $$('#statusFilters button').forEach(button=>button.querySelector('span').textContent=counts[button.dataset.status]||0);
}

async function loadJobs({quiet=false}={}){
  if(!state.key){setConnected(false);$('#jobs').innerHTML='<div class="empty"><b>连接生产台后查看任务</b>访问密钥只保存在本次浏览器会话中。</div>';return}
  try{const data=await api('/api/jobs');state.jobs=data.jobs||[];setConnected(true);renderJobs();updateStats();if(state.activeJob)await openJob(state.activeJob,true)}
  catch(error){setConnected(false);if(error.status===401){state.key='';sessionStorage.removeItem('factoryKey');showAccess('访问密钥无效，请重新输入。')}else if(!quiet)showToast(error.message)}
}

function jobMatches(job){
  const statusOk=state.jobStatus==='all'||(state.jobStatus==='running'?(job.status==='running'||job.status==='queued'):job.status===state.jobStatus);
  const query=state.jobQuery.toLocaleLowerCase('zh-CN');
  return statusOk&&(!query||`${job.case_name||''} ${job.case_id}`.toLocaleLowerCase('zh-CN').includes(query));
}
function renderJobs(){
  const jobs=state.jobs.filter(jobMatches);const root=$('#jobs');
  if(!jobs.length){root.innerHTML='<div class="empty"><b>没有符合条件的任务</b>选择案例开始生产，或调整上方筛选条件。</div>';return}
  root.innerHTML=jobs.map(job=>{
    const deleted=Boolean(job.artifacts_deleted_at);const stage=stages[job.stage]||job.stage;const status=statusNames[job.status]||job.status;
    const thumb=job.status==='succeeded'&&!deleted?`<img class="job-thumb" src="${apiOrigin}/output/${job.id}/poster.jpg" alt="${escapeHtml(job.case_name||'案例')}成片封面" loading="lazy">`:'<span class="job-thumb"></span>';
    return `<article class="job" data-job-id="${job.id}" tabindex="0"><div class="job-case">${thumb}<div><h3>${escapeHtml(job.case_name||job.case_id)}</h3><small>${escapeHtml(job.case_id)} · ${formatDate(job.created_at)}</small></div></div><div><div class="progress-copy"><span>${escapeHtml(stage)}</span><span>${job.progress||0}%</span></div><div class="bar"><i style="width:${Math.max(0,Math.min(100,job.progress||0))}%"></i></div></div><div class="job-status ${job.status}">${deleted?'成片已释放':status}${job.qa_score?` · ${job.qa_score}分`:''}</div><div class="job-action"><button type="button" data-open-job="${job.id}">${job.status==='succeeded'&&!deleted?'查看成片':'查看详情'} →</button></div></article>`
  }).join('');
  $$('[data-open-job]').forEach(button=>button.onclick=event=>{event.stopPropagation();openJob(button.dataset.openJob)});
  $$('.job').forEach(card=>{card.onclick=()=>openJob(card.dataset.jobId);card.onkeydown=event=>{if(event.key==='Enter')openJob(card.dataset.jobId)}});
}

async function loadCatalog({append=false}={}){
  if(!state.key)return;
  const root=$('#catalogGrid');if(!append)root.innerHTML='<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
  const params=new URLSearchParams({q:state.catalogQuery,category:state.category,page:String(state.catalogPage),pageSize:'20'});
  try{const data=await api(`/api/catalog?${params}`);state.catalog=append?[...state.catalog,...data.items]:data.items;state.catalogTotal=data.total;state.categories=data.categories||[];renderCategories();renderCatalog()}
  catch(error){root.innerHTML=`<div class="empty"><b>案例库暂时无法读取</b>${escapeHtml(error.message)}</div>`}
}
function renderCategories(){
  const root=$('#categoryFilters');const visible=state.categories.slice(0,12);
  root.innerHTML=[{label:'全部案例',value:''},...visible.map(value=>({label:value,value}))].map(item=>`<button type="button" class="${state.category===item.value?'active':''}" data-category="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`).join('');
  root.querySelectorAll('button').forEach(button=>button.onclick=()=>{state.category=button.dataset.category;state.catalogPage=1;loadCatalog()});
}
function renderCatalog(){
  const root=$('#catalogGrid');
  if(!state.catalog.length){root.innerHTML='<div class="empty"><b>没有找到相关案例</b>换一个关键词或选择其他分类。</div>';$('#loadMore').hidden=true;$('#catalogMeta').textContent='0 个案例';return}
  root.innerHTML=state.catalog.map(item=>{const selected=state.selected.has(item.id);return `<article class="case-card ${selected?'selected':''}"><img class="case-cover" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}项目图片" loading="lazy"><div class="case-info"><div class="case-meta"><span>${escapeHtml(item.category)}</span><span>3–5 份素材就绪</span></div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.summary)}</p><button type="button" data-select-case="${item.id}">${selected?'✓ 已加入生产':'＋ 加入生产'}</button></div></article>`}).join('');
  root.querySelectorAll('[data-select-case]').forEach(button=>button.onclick=()=>toggleCase(button.dataset.selectCase));
  $('#catalogMeta').textContent=`已显示 ${state.catalog.length} / ${state.catalogTotal} 个案例`;$('#loadMore').hidden=state.catalog.length>=state.catalogTotal;
}
function toggleCase(id){
  if(state.selected.has(id))state.selected.delete(id);else{const item=state.catalog.find(entry=>entry.id===id)||{id,name:id,category:'手工导入',image:''};state.selected.set(id,item)}
  renderSelection();renderCatalog();
}
function renderSelection(){
  const items=[...state.selected.values()];$('#selectedCounter strong').textContent=items.length;const root=$('#selectedCases');
  if(!items.length)root.innerHTML='<div class="empty-selection"><span>＋</span><b>还没有选择案例</b><p>在左侧案例库中点击“加入生产”</p></div>';
  else root.innerHTML=items.map(item=>`<div class="selected-item">${item.image?`<img src="${escapeHtml(item.image)}" alt="">`:'<span></span>'}<div><b>${escapeHtml(item.name||item.id)}</b><small>${escapeHtml(item.category||'案例库')}</small></div><button type="button" data-remove-case="${item.id}" aria-label="移除${escapeHtml(item.name||item.id)}">×</button></div>`).join('');
  root.querySelectorAll('[data-remove-case]').forEach(button=>button.onclick=()=>toggleCase(button.dataset.removeCase));
  const start=$('#startProduction');start.disabled=!items.length;start.querySelector('small').textContent=items.length?`将提交 ${items.length} 条视频任务`:'选择案例后可提交';
}

async function startProduction(){
  const button=$('#startProduction'),message=$('#createMessage'),caseIds=[...state.selected.keys()];if(!caseIds.length)return;
  button.disabled=true;button.querySelector('span').textContent='正在提交任务';message.textContent='系统正在创建生产工作流……';message.className='form-message';
  try{const result=await api('/api/jobs',{method:'POST',body:JSON.stringify({caseIds})});message.textContent=`已提交 ${result.count} 条任务，生产过程将在后台自动完成。`;message.classList.add('success');state.selected.clear();renderSelection();renderCatalog();await loadJobs();location.hash='queueSection';showToast(`${result.count} 条任务已进入生产队列`)}
  catch(error){message.textContent=error.message}
  finally{button.querySelector('span').textContent='开始生产';button.disabled=!state.selected.size}
}

async function openJob(id,refreshOnly=false){
  try{
    const job=await api(`/api/jobs/${id}`);state.activeJob=id;const dialog=$('#jobDialog');const detail=$('#jobDetail');const deleted=Boolean(job.artifacts_deleted_at);const outputs=job.outputs&&!deleted;
    const outputUrl=value=>`${apiOrigin}${value}`;
    const preview=outputs?`<video controls preload="metadata" poster="${outputUrl(job.outputs.poster)}"><source src="${outputUrl(job.outputs.video)}" type="video/mp4">浏览器无法播放该视频。</video><small>竖屏成片 · 1080 × 1920 · H.264 / AAC</small>`:`<div class="preview-placeholder">${job.status==='failed'?'任务未生成可用成片':deleted?'成片已从云端释放':'生产完成后将在这里预览'}</div>`;
    const events=(job.events||[]).map(event=>`<li><i></i><div><b>${escapeHtml(event.message)}</b><small>${escapeHtml(stages[event.stage]||event.stage)}</small></div><small>${formatDate(event.created_at)}</small></li>`).join('')||'<li><i></i><div><b>任务已创建</b><small>等待第一条生产记录</small></div></li>';
    detail.innerHTML=`<div class="detail-shell"><section class="detail-preview">${preview}</section><section class="detail-content"><div class="detail-top"><div><p class="section-index">JOB / ${escapeHtml(job.case_id)}</p><h2>${escapeHtml(job.case_name||job.case_id)}</h2></div><button type="button" data-close-detail aria-label="关闭">×</button></div><div class="detail-meta"><span class="job-status ${job.status}">${deleted?'云端成片已释放':statusNames[job.status]||job.status}</span><span>${escapeHtml(stages[job.stage]||job.stage)}</span><span>第 ${job.attempt||0} 轮</span></div><div class="detail-score"><div><span>品控评分</span><b>${job.qa_score||'—'}</b></div><div><span>生产进度</span><b>${job.progress||0}%</b></div><div><span>缓存到期</span><b>${job.retention_until&&!deleted?formatDate(job.retention_until,false):deleted?'已释放':'—'}</b></div></div><div class="detail-actions">${outputs?`<a class="button primary" href="${outputUrl(job.outputs.video)}?download=1" download>下载成片到本机</a><a class="button quiet" href="${outputUrl(job.outputs.video)}" target="_blank">新窗口播放</a><a class="button quiet" href="${outputUrl(job.outputs.qa)}" target="_blank">查看质检报告</a>`:''}${job.status==='failed'?'<button class="button secondary" type="button" data-retry-job>重新生产</button>':''}</div>${job.error_message?`<div class="confirm-release"><b>${escapeHtml(errorNames[job.error_code]||job.error_code||'任务失败')}</b><br>${escapeHtml(job.error_message)}</div>`:''}<h3 class="timeline-title">生产记录</h3><ol class="timeline">${events}</ol>${outputs?'<div class="danger-zone"><p>确认已下载到本机后，可以立即删除云端缓存；不操作也会在到期日自动清理。</p><button type="button" data-release-output>释放云端缓存</button></div><div id="releaseConfirm"></div>':''}</section></div>`;
    $('[data-close-detail]').onclick=()=>{state.activeJob=null;dialog.close()};
    if($('[data-retry-job]'))$('[data-retry-job]').onclick=async()=>{await api(`/api/jobs/${id}/retry`,{method:'POST'});showToast('已创建新的生产任务');state.activeJob=null;dialog.close();loadJobs()};
    if($('[data-release-output]'))$('[data-release-output]').onclick=()=>{$('#releaseConfirm').innerHTML='<div class="confirm-release">删除后网页将无法再次下载。请确认文件已经保存到本机。 <button class="button" type="button" id="confirmRelease">确认释放</button></div>';$('#confirmRelease').onclick=async()=>{await api(`/api/jobs/${id}/artifacts`,{method:'DELETE'});showToast('云端缓存已释放');await loadJobs();await openJob(id,true)}};
    if(!refreshOnly&&!dialog.open)dialog.showModal();
  }catch(error){showToast(error.message)}
}

$('#accessForm').onsubmit=async event=>{
  event.preventDefault();const next=$('#accessKey').value.trim();if(!next){$('#accessError').textContent='请输入访问密钥。';return}
  state.key=next;
  try{await api('/api/jobs');sessionStorage.setItem('factoryKey',state.key);$('#accessDialog').close();setConnected(true);await Promise.all([loadJobs(),loadCatalog()]);showToast('生产台已连接')}
  catch(error){state.key='';$('#accessError').textContent=error.status===401?'访问密钥不正确。':error.message;setConnected(false)}
};
$('#keyButton').onclick=()=>showAccess();$('#toggleKey').onclick=()=>{const input=$('#accessKey');input.type=input.type==='password'?'text':'password';$('#toggleKey').textContent=input.type==='password'?'显示':'隐藏'};
$('.access-dialog .dialog-close').onclick=()=>$('#accessDialog').close();
$$('.mode-tabs button').forEach(button=>button.onclick=()=>{$$('.mode-tabs button').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button))});$('#catalogMode').hidden=button.dataset.mode!=='catalog';$('#idsMode').hidden=button.dataset.mode!=='ids'});
$('#catalogSearch').oninput=event=>{state.catalogQuery=event.target.value.trim();state.catalogPage=1;clearTimeout(catalogTimer);catalogTimer=setTimeout(()=>loadCatalog(),320)};
$('#clearSearch').onclick=()=>{$('#catalogSearch').value='';state.catalogQuery='';state.catalogPage=1;loadCatalog()};
$('#loadMore').onclick=()=>{state.catalogPage+=1;loadCatalog({append:true})};
$('#importIds').onclick=()=>{const ids=$('#caseIds').value.split(/[\s,，]+/).map(value=>value.trim()).filter(value=>/^[a-z0-9]{8,32}$/i.test(value));ids.forEach(id=>state.selected.set(id,{id,name:id,category:'手工导入',image:''}));renderSelection();showToast(`已加入 ${ids.length} 个有效案例 ID`)};
$('#clearSelection').onclick=()=>{state.selected.clear();renderSelection();renderCatalog()};$('#startProduction').onclick=startProduction;
$$('#statusFilters button').forEach(button=>button.onclick=()=>{$$('#statusFilters button').forEach(item=>item.classList.toggle('active',item===button));state.jobStatus=button.dataset.status;renderJobs()});
$('#jobSearch').oninput=event=>{state.jobQuery=event.target.value.trim();renderJobs()};$('#refresh').onclick=()=>loadJobs();
$('#jobDialog').addEventListener('click',event=>{if(event.target===$('#jobDialog')){state.activeJob=null;$('#jobDialog').close()}});

async function bootstrap(){
renderSelection();
if(isLocalFile){
  $('#localPreviewNotice').hidden=false;$('#connectionState').lastChild.textContent=' 本地预览';
  $('#catalogGrid').innerHTML='<div class="empty"><b>正式网址上线后读取案例库</b>本地文件只用于检查视觉，不会连接生产接口。</div>';
  $('#catalogMeta').textContent='本地视觉预览';$('#jobs').innerHTML='<div class="empty"><b>正式网址上线后显示任务</b>请从 Cloudflare 固定网址使用完整生产功能。</div>';
}else{
  try{const health=await fetch(`${apiOrigin}/api/health`);if(!health.ok)throw new Error('API unavailable');if(state.key)await Promise.all([loadJobs(),loadCatalog()]);else{setConnected(false);showAccess()}}
  catch{$('#localPreviewNotice').hidden=false;$('#localPreviewNotice').innerHTML='<div><b>产品入口已上线</b><span>视频渲染服务等待 Cloudflare R2 激活后接通。</span></div><a href="https://ai-shengyi-jing.pages.dev">返回 AI生意经主站 →</a>';$('#connectionState').lastChild.textContent=' 后端待激活';$('#catalogGrid').innerHTML='<div class="empty"><b>生产后端正在配置</b>固定产品入口已经可用，R2 激活后将自动接通案例库与生产任务。</div>';$('#jobs').innerHTML='<div class="empty"><b>暂未连接渲染服务</b>完成 Cloudflare R2 激活后即可开始批量生产。</div>'}
}}
bootstrap();
setInterval(()=>{if(!isLocalFile&&state.key)loadJobs({quiet:true})},10000);

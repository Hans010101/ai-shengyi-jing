import type { CaseSnapshot, MediaItem, RenderManifest, ScriptBeat, VideoScript } from './types';

const SCRIPT_SYSTEM = `你是“AI生意经”短视频总编导。把真实商业案例写成90至120秒中文知识短视频。
必须遵守：先给结果和反差，再讲问题、产品、增长、护城河，最后给中国创业者一个可执行判断；只使用输入事实；每一个数字必须绑定 evidenceIds；6到8个段落；每段旁白45至75个汉字，全文420至580个汉字；每段选择3到5个与内容直接相关且尽量不同的mediaIds，优先项目官网素材，场景补充素材只能用于相符的用户动作或经营场景；口语自然、有转折，不堆形容词；只返回JSON。`;

export function normalizeText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function pickMedia(article: any, project: any): MediaItem[] {
  const raw = Array.isArray(article?.media) ? article.media : [];
  const result: MediaItem[] = [];
  for (const [index, item] of raw.entries()) {
    const rawType = String(item?.type || 'image');
    let type: 'image' | 'video' = rawType.includes('video') ? 'video' : 'image';
    let url = normalizeText(item?.url, 2000);
    if (!url || !/^https:\/\//i.test(url)) continue;
    const youtubeId = url.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/i)?.[1];
    const sourceUrl = url;
    if (youtubeId) {
      type = 'image';
      url = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;
    }
    result.push({
      id: `media-${index + 1}`,
      type,
      url,
      poster: normalizeText(item?.poster, 2000) || undefined,
      caption: normalizeText(item?.caption || item?.alt, 180) || `${project.nameZh || project.name}真实项目素材`,
      sourceUrl: normalizeText(item?.sourceUrl, 2000) || (youtubeId ? sourceUrl : undefined),
      origin: normalizeText(item?.origin, 60) || 'source-page'
    });
  }
  if (result.length < 3 && /^https:\/\//i.test(project?.image || '')) {
    result.push({ id: `media-${result.length + 1}`, type: 'image', url: project.image, caption: `${project.nameZh || project.name}项目主图`, origin: 'case-database' });
  }
  return result.slice(0, 10);
}

export function buildSnapshot(project: any, article: any, capturedAt = new Date().toISOString()): CaseSnapshot {
  const facts = [
    ['revenue', '披露营收', project.revenue, project.url],
    ['model', '商业模式', project.businessModel, project.url],
    ['insight', '核心洞察', project.insight, project.url],
    ['loop', '增长闭环', project.businessLoop, project.url],
    ['china', '中国市场启示', project.chinaOpportunity, project.url]
  ].filter(([, , value]) => normalizeText(value, 1200));
  if (Array.isArray(article?.keyFacts)) {
    for (const [index, fact] of article.keyFacts.entries()) {
      facts.push([`article-${index + 1}`, normalizeText(fact.label, 80), normalizeText(fact.value, 180), article?.source?.url || project.url]);
    }
  }
  return {
    schemaVersion: '1.0',
    caseId: String(project.id),
    name: normalizeText(project.name, 240),
    nameZh: normalizeText(project.nameZh || article?.project?.nameZh || project.name, 100),
    summary: normalizeText(project.summary || article?.dek || project.description, 600),
    revenue: normalizeText(project.revenue, 100),
    businessModel: normalizeText(project.businessModel, 1000),
    chinaOpportunity: normalizeText(project.chinaOpportunity, 1000),
    facts: facts.slice(0, 12).map(([id, label, value, evidence]) => ({ id, label, value, evidence })),
    media: pickMedia(article, project),
    source: { name: normalizeText(article?.source?.name || 'Starter Story', 80), url: normalizeText(article?.source?.url || project.url, 2000), capturedAt }
  };
}

function scriptSchema() {
  return {
    type: 'object',
    properties: {
      headline: { type: 'string' }, subheadline: { type: 'string' }, hook: { type: 'string' }, closing: { type: 'string' },
      beats: { type: 'array', minItems: 6, maxItems: 8, items: { type: 'object', properties: {
        id: { type: 'string' }, chapter: { type: 'string' }, narration: { type: 'string' }, onScreen: { type: 'string' },
        evidenceIds: { type: 'array', items: { type: 'string' } }, mediaIds: { type: 'array', items: { type: 'string' } }, emphasis: { type: 'string' }
      }, required: ['id', 'chapter', 'narration', 'onScreen', 'evidenceIds', 'mediaIds'] } }
    },
    required: ['headline', 'subheadline', 'hook', 'beats', 'closing']
  };
}

export function fallbackScript(snapshot: CaseSnapshot): VideoScript {
  const mediaIds = snapshot.media.map(item => item.id);
  const fact = (id: string) => snapshot.facts.find(item => item.id === id)?.value || '';
  const withoutStop = (value: string) => value.replace(/[。.!！?？；;]+$/u, '');
  const beats: ScriptBeat[] = [
    { id: 'result', chapter: '先看结果', narration: `${snapshot.nameZh}，把一个很小的需求，做成了${snapshot.revenue || '持续产生收入的生意'}。重点不是数字，而是一次购买怎样变成可重复的系统。`, onScreen: `${snapshot.revenue || '真实营收'} · 小需求也能成为生意`, evidenceIds: ['revenue'], mediaIds: mediaIds.slice(0, 2) },
    { id: 'problem', chapter: '用户为什么买', narration: `${withoutStop(snapshot.summary).slice(0, 62)}。它抓住的是用户反复遇到、而且愿意付钱解决的具体问题。`, onScreen: '先找高频痛点，再谈市场规模', evidenceIds: ['insight'], mediaIds: mediaIds.slice(1, 3) },
    { id: 'product', chapter: '产品如何成立', narration: `产品关键不是功能多，而是几秒钟就能看懂价值。第一次体验必须完整，交付结果清楚、稳定，还能被真实画面证明。`, onScreen: '少功能 · 强结果 · 易证明', evidenceIds: ['model'], mediaIds: mediaIds.slice(2, 5) },
    { id: 'model', chapter: '钱怎么赚', narration: `${withoutStop(snapshot.businessModel).slice(0, 64)}。判断收入质量，还要看毛利、获客成本，以及用户有没有再次购买的理由。`, onScreen: '成交只是开始，复购决定质量', evidenceIds: ['model', 'revenue'], mediaIds: mediaIds.slice(0, 4) },
    { id: 'growth', chapter: '增长怎么转起来', narration: `增长不是渠道堆砌。内容和口碑负责引流，官网与平台完成成交，真实交付再带来分享和复购，四个环节缺一不可。`, onScreen: '内容 → 成交 → 交付 → 复购', evidenceIds: ['loop'], mediaIds: mediaIds.slice(1, 5) },
    { id: 'moat', chapter: '真正的护城河', narration: `单个产品容易模仿，但内容、渠道、用户反馈和稳定运营不会自动复制。真正难抄的，是多个环节长期配合的结果。`, onScreen: '单品可模仿，系统难复制', evidenceIds: ['insight', 'model'], mediaIds: mediaIds.slice(0, 5) },
    { id: 'china', chapter: '中国市场怎么验证', narration: `${withoutStop(snapshot.chinaOpportunity).slice(0, 66)}。先确认有人付钱，再把资金投入真正改善转化、交付或留存的环节。`, onScreen: '先验证付费，再扩大投入', evidenceIds: ['china'], mediaIds: mediaIds.slice(2, 5) },
    { id: 'close', chapter: '最后一个判断', narration: `别急着寻找下一个爆款。先为一群明确的人，把一个重复发生的小麻烦，做成可信、可持续、还能复购的完整解决方案。`, onScreen: '找到高频小麻烦，把结果交付完整', evidenceIds: ['china'], mediaIds: mediaIds.slice(0, 5), emphasis: 'calm-close' }
  ];
  return { schemaVersion: '1.0', headline: `${snapshot.nameZh}：一门小生意如何真正成立`, subheadline: '真实项目 · 商业系统拆解', hook: beats[0].narration, beats, closing: beats.at(-1)!.narration };
}

export function distributeMedia(script: VideoScript, snapshot: CaseSnapshot): VideoScript {
  const all = snapshot.media.map(item => item.id);
  if (!all.length) return script;
  return { ...script, beats: script.beats.map((beat, beatIndex) => {
    const valid = [...new Set((beat.mediaIds || []).filter(id => all.includes(id)))].slice(0, 2);
    for (let offset = 0; valid.length < Math.min(5, all.length) && offset < all.length; offset++) {
      const candidate = all[(beatIndex * 2 + offset) % all.length];
      if (!valid.includes(candidate)) valid.push(candidate);
    }
    return { ...beat, mediaIds: valid.slice(0, 5) };
  }) };
}

export async function generateScript(snapshot: CaseSnapshot, env: any): Promise<{ script: VideoScript; provider: string }> {
  try {
    const result: any = await env.AI.run(env.SCRIPT_MODEL, {
      messages: [{ role: 'system', content: SCRIPT_SYSTEM }, { role: 'user', content: JSON.stringify(snapshot) }],
      response_format: { type: 'json_schema', json_schema: scriptSchema() }, max_tokens: 3000, temperature: 0.45
    });
    const parsed = typeof result?.response === 'string' ? JSON.parse(result.response) : result?.response;
    const script = { schemaVersion: '1.0', ...parsed } as VideoScript;
    const validation = validateScript(script, snapshot);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    return { script: distributeMedia(script, snapshot), provider: `workers-ai:${env.SCRIPT_MODEL}` };
  } catch (error) {
    if (env.DEEPSEEK_API_KEY) {
      try {
        const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: 'deepseek-chat', response_format: { type: 'json_object' }, temperature: 0.45, messages: [{ role: 'system', content: `${SCRIPT_SYSTEM}\nJSON schema:${JSON.stringify(scriptSchema())}` }, { role: 'user', content: JSON.stringify(snapshot) }] }) });
        if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
        const payload: any = await response.json();
        const script = { schemaVersion: '1.0', ...JSON.parse(payload.choices[0].message.content) } as VideoScript;
        const validation = validateScript(script, snapshot);
        if (!validation.ok) throw new Error(validation.errors.join('; '));
        return { script: distributeMedia(script, snapshot), provider: 'deepseek:deepseek-chat' };
      } catch { /* deterministic fallback below */ }
    }
    return { script: distributeMedia(fallbackScript(snapshot), snapshot), provider: 'deterministic-fallback-v1' };
  }
}

export function validateScript(script: VideoScript, snapshot: CaseSnapshot) {
  const errors: string[] = [];
  if (!script || !Array.isArray(script.beats) || script.beats.length < 6 || script.beats.length > 10) errors.push('脚本段落必须为6至10段');
  const evidence = new Set(snapshot.facts.map(item => item.id));
  const media = new Set(snapshot.media.map(item => item.id));
  for (const beat of script?.beats || []) {
    if (normalizeText(beat.narration).length < 24) errors.push(`${beat.id}:旁白过短`);
    if (normalizeText(beat.narration).length > 95) errors.push(`${beat.id}:旁白过长`);
    if (!beat.evidenceIds?.every(id => evidence.has(id))) errors.push(`${beat.id}:存在无来源事实`);
    if (!beat.mediaIds?.every(id => media.has(id))) errors.push(`${beat.id}:存在无效素材`);
  }
  const totalNarration = (script?.beats || []).reduce((sum, beat) => sum + normalizeText(beat.narration).length, 0);
  if (totalNarration < 320 || totalNarration > 650) errors.push(`旁白总长度需在320至650字，当前${totalNarration}字`);
  return { ok: errors.length === 0, errors };
}

export function buildManifest(jobId: string, snapshot: CaseSnapshot, script: VideoScript, attempt = 1): RenderManifest {
  return {
    schemaVersion: '1.0', jobId, template: 'editorial-v1', templateVersion: '1.0.0', caseSnapshot: snapshot, script,
    voice: { provider: 'edge-neural', voice: 'zh-CN-XiaoxiaoNeural', rate: attempt > 1 ? '+8%' : '+11%', pitch: '+0Hz', phrasePauseSeconds: 0.14 },
    quality: { width: 1080, height: 1920, fps: 30, minUniqueMedia: snapshot.media.length >= 7 ? 5 : 3, minDurationSeconds: 68, maxDurationSeconds: 118, targetLufs: -16, truePeak: -1.5, asrSimilarity: 0.94 }
  };
}

export function normalizeForComparison(value: string) {
  return value.toLowerCase().replace(/[\s，。！？；：“”‘’、,.!?;:'"()（）—-]/g, '').replace(/一百五十万/g, '150万').replace(/二零一四/g, '2014').replace(/二零二一/g, '2021');
}

export function similarity(expected: string, actual: string) {
  const a = normalizeForComparison(expected), b = normalizeForComparison(actual);
  if (!a.length || !b.length) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return Math.max(0, 1 - previous[b.length] / Math.max(a.length, b.length));
}

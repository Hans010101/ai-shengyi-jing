import type { CaseSnapshot, ContentSnapshot, MediaItem, ProductionOptions, RenderManifest, ScriptBeat, SourceType, VideoScript } from './types';

const SCRIPT_SYSTEM = `你是中文短视频总编导。把输入内容提炼成清楚、可信、自然的知识短视频。
必须遵守：先用反差或问题给出观看理由，再按主题推进，最后给出可复述的结论；只使用输入事实，不补写未经支持的数字；每个事实绑定 evidenceIds；6到8段；每段旁白35至80个汉字；口语自然、有转折，不堆形容词；mediaIds只能来自输入；只返回JSON。`;

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
    schemaVersion: '2.0', sourceId: String(project.id), sourceType: 'ai-shengyi-case', title: normalizeText(project.nameZh || article?.project?.nameZh || project.name, 100), rawText: normalizeText([project.summary, project.businessModel, project.insight, project.businessLoop, project.chinaOpportunity].join('\n'), 12000),
    caseId: String(project.id),
    name: normalizeText(project.name, 240),
    nameZh: normalizeText(project.nameZh || article?.project?.nameZh || project.name, 100),
    summary: normalizeText(project.summary || article?.dek || project.description, 600),
    revenue: normalizeText(project.revenue, 100),
    businessModel: normalizeText(project.businessModel, 1000),
    chinaOpportunity: normalizeText(project.chinaOpportunity, 1000),
    facts: facts.slice(0, 12).map(([id, label, value, evidence]) => ({ id, label, value, evidence })),
    media: pickMedia(article, project),
    source: { name: normalizeText(article?.source?.name || 'AI生意经案例库', 80), url: normalizeText(article?.source?.url || project.url, 2000), capturedAt },
    legacy: { caseId: String(project.id), revenue: normalizeText(project.revenue, 100), businessModel: normalizeText(project.businessModel, 1000), chinaOpportunity: normalizeText(project.chinaOpportunity, 1000) }
  };
}

export function buildContentSnapshot(input: { sourceType: SourceType; title?: string; text?: string; url?: string }, capturedAt = new Date().toISOString()): ContentSnapshot {
  const rawText = normalizeText(input.text, 16000);
  const title = normalizeText(input.title, 120) || (input.sourceType === 'topic' ? rawText.slice(0, 36) : '未命名内容');
  const chunks = rawText.split(/(?<=[。！？；\n])/u).map(value => normalizeText(value, 320)).filter(value => value.length >= 12).slice(0, 12);
  const facts = (chunks.length ? chunks : [rawText || title]).map((value, index) => ({ id: `source-${index + 1}`, label: index === 0 ? '核心主题' : `内容依据 ${index + 1}`, value, evidence: input.url || '用户提供内容' }));
  return { schemaVersion: '2.0', sourceId: crypto.randomUUID(), sourceType: input.sourceType, title, summary: chunks.slice(0, 3).join('').slice(0, 600) || title, rawText, facts, media: [], source: { name: input.sourceType === 'book' ? '用户书籍摘录' : input.sourceType === 'article' ? '网页文章' : '用户输入', url: input.url, capturedAt } };
}

export function fallbackKnowledgeScript(snapshot: ContentSnapshot): VideoScript {
  const ideas = snapshot.facts.map(item => item.value).filter(Boolean);
  const seed = (i: number) => ideas[i % Math.max(1, ideas.length)] || snapshot.summary || snapshot.title;
  const chapters = ['为什么值得看','先抓住主线','关键机制','容易误解的地方','把观点连起来','如何应用','记住这一句'];
  const beats = chapters.map((chapter, i) => ({ id: `idea-${i + 1}`, chapter, narration: `${seed(i).slice(0, 62)}。这里真正重要的，不是记住一个孤立结论，而是看清它和前后内容之间的关系。`, onScreen: seed(i).slice(0, 24), evidenceIds: [snapshot.facts[i % snapshot.facts.length]?.id || 'source-1'], mediaIds: [] }));
  return { schemaVersion: '1.0', headline: snapshot.title, subheadline: '把复杂内容讲清楚', hook: beats[0].narration, beats, closing: beats.at(-1)!.narration };
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
    { id: 'model', chapter: '钱怎么赚', narration: `${withoutStop(snapshot.businessModel || snapshot.summary).slice(0, 64)}。判断收入质量，还要看毛利、获客成本，以及用户有没有再次购买的理由。`, onScreen: '成交只是开始，复购决定质量', evidenceIds: ['model', 'revenue'], mediaIds: mediaIds.slice(0, 4) },
    { id: 'growth', chapter: '增长怎么转起来', narration: `增长不是渠道堆砌。内容和口碑负责引流，官网与平台完成成交，真实交付再带来分享和复购，四个环节缺一不可。`, onScreen: '内容 → 成交 → 交付 → 复购', evidenceIds: ['loop'], mediaIds: mediaIds.slice(1, 5) },
    { id: 'moat', chapter: '真正的护城河', narration: `单个产品容易模仿，但内容、渠道、用户反馈和稳定运营不会自动复制。真正难抄的，是多个环节长期配合的结果。`, onScreen: '单品可模仿，系统难复制', evidenceIds: ['insight', 'model'], mediaIds: mediaIds.slice(0, 5) },
    { id: 'china', chapter: '中国市场怎么验证', narration: `${withoutStop(snapshot.chinaOpportunity || snapshot.summary).slice(0, 66)}。先确认有人付钱，再把资金投入真正改善转化、交付或留存的环节。`, onScreen: '先验证付费，再扩大投入', evidenceIds: ['china'], mediaIds: mediaIds.slice(2, 5) },
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
    const fallback = snapshot.sourceType === 'ai-shengyi-case' ? fallbackScript(snapshot) : fallbackKnowledgeScript(snapshot);
    return { script: distributeMedia(fallback, snapshot), provider: 'deterministic-fallback-v2' };
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

export function buildManifest(jobId: string, snapshot: CaseSnapshot, script: VideoScript, attempt = 1, requested?: Partial<ProductionOptions>): RenderManifest {
  const options: ProductionOptions = { templateId: snapshot.sourceType === 'ai-shengyi-case' ? 'ai-shengyi-case-v1' : 'knowledge-director-v1', visualPreset: snapshot.sourceType === 'ai-shengyi-case' ? 'real-montage' : 'knowledge-diagram', aspectRatio: '9:16', durationSeconds: snapshot.sourceType === 'ai-shengyi-case' ? 90 : 60, voice: 'zh-CN-XiaoxiaoNeural', voiceRate: 1.08, brandPreset: snapshot.sourceType === 'ai-shengyi-case' ? 'ai-shengyi-jing' : 'studio-neutral', bgm: true, autoDucking: true, ...requested };
  const dimensions = options.aspectRatio === '16:9' ? [1920,1080] : options.aspectRatio === '1:1' ? [1080,1080] : [1080,1920];
  const legacy = { ...snapshot, caseId: snapshot.legacy?.caseId || snapshot.sourceId, name: snapshot.title, nameZh: snapshot.title, revenue: snapshot.legacy?.revenue || '', businessModel: snapshot.legacy?.businessModel || snapshot.summary, chinaOpportunity: snapshot.legacy?.chinaOpportunity || '', media: snapshot.media };
  return {
    schemaVersion: '2.0', jobId, template: options.templateId, templateVersion: '2.0.0', contentSnapshot: snapshot, caseSnapshot: legacy, script, options,
    voice: { provider: 'edge-neural', voice: options.voice, rate: attempt > 1 ? '+4%' : `+${Math.round((options.voiceRate - 1) * 100)}%`, pitch: '+0Hz', phrasePauseSeconds: 0.14 },
    quality: { width: dimensions[0], height: dimensions[1], fps: 30, minUniqueMedia: !snapshot.media.length || options.visualPreset === 'knowledge-diagram' ? 0 : snapshot.media.length >= 7 ? 5 : 3, minDurationSeconds: Math.max(30, options.durationSeconds - 25), maxDurationSeconds: Math.min(180, options.durationSeconds + 35), targetLufs: -14, truePeak: -1.5, asrSimilarity: 0.92 }
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

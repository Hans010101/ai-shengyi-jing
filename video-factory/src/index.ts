import { VideoProductionWorkflow } from './workflow';
import { VideoRenderer } from './renderer';
import { getJob } from './db';
import { issueDeviceSession, normalizeActivationCode, sha256Hex, verifyAdminKey, verifyDeviceSession, verifyInternalAsset } from './auth';
import { productionOptions, publicProductionLines } from './presets';
import type { Env, ProductionOptions, SourceType } from './types';

export { VideoProductionWorkflow, VideoRenderer };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': 'https://ai-shengyi-video-studio.pages.dev', 'Access-Control-Allow-Headers': 'Content-Type, X-Factory-Key, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' } });
}

async function authorized(request: Request, env: Env) {
  if (!env.FACTORY_ADMIN_TOKEN) return false;
  const adminKey = request.headers.get('X-Factory-Key') || '';
  if (adminKey && await verifyAdminKey(adminKey, env.FACTORY_ADMIN_TOKEN)) return true;
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return verifyDeviceSession(bearer, env.FACTORY_ADMIN_TOKEN);
}

async function activateDevice(request: Request, env: Env) {
  if (!env.FACTORY_ADMIN_TOKEN) return json({ error: 'ACTIVATION_UNAVAILABLE', detail: '生产权限暂不可用。' }, 503);
  const body: any = await request.json().catch(() => null);
  const code = normalizeActivationCode(String(body?.code || ''));
  if (!/^[A-Z0-9]{20,64}$/.test(code)) return json({ error: 'INVALID_ACTIVATION_CODE', detail: '激活码无效或已使用。' }, 400);
  const codeHash = await sha256Hex(code);
  const now = new Date().toISOString();
  const result = await env.VIDEO_DB.prepare("UPDATE activation_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?").bind(now, codeHash, now).run();
  if (Number(result.meta.changes || 0) !== 1) return json({ error: 'INVALID_ACTIVATION_CODE', detail: '激活码无效、已使用或已过期。' }, 400);
  const session = await issueDeviceSession(env.FACTORY_ADMIN_TOKEN);
  return json({ ok: true, token: session.token, expiresAt: session.expiresAt, scope: 'production' });
}

function id() { return crypto.randomUUID(); }

async function enqueue(env: Env, input: { caseId?: string; source?: { sourceType: SourceType; title?: string; text?: string; url?: string }; options?: Partial<ProductionOptions> }) {
  const jobId = id(), now = new Date().toISOString();
  const sourceType = input.caseId ? 'ai-shengyi-case' : input.source!.sourceType;
  const sourceTitle = input.caseId || input.source?.title || input.source?.text?.slice(0, 48) || '未命名视频';
  const options = productionOptions(sourceType, input.options);
  const template = options.productionLineId;
  await env.VIDEO_DB.prepare('INSERT INTO jobs(id, case_id, source_type, source_title, source_payload, options, template_id, status, stage, progress, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(jobId, input.caseId || jobId, sourceType, sourceTitle, JSON.stringify(input.source || { caseId: input.caseId }), JSON.stringify(options), template, 'queued', 'queued', 0, now, now).run();
  const workflow = await env.VIDEO_WORKFLOW.create({ id: jobId, params: { jobId, ...input, options, template } });
  await env.VIDEO_DB.prepare('UPDATE jobs SET workflow_id = ? WHERE id = ?').bind(workflow.id, jobId).run();
  return { jobId, workflowId: workflow.id, sourceType, title: sourceTitle, status: 'queued' };
}

async function safeArticleText(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_ARTICLE_URL');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || hostname === '::1') throw new Error('UNSAFE_ARTICLE_URL');
  const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Universal-Video-Studio/1.0' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`ARTICLE_FETCH_${response.status}`);
  if (!String(response.headers.get('content-type') || '').includes('text/html')) throw new Error('ARTICLE_NOT_HTML');
  const html = (await response.text()).slice(0, 1_000_000);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16000);
  if (text.length < 120) throw new Error('ARTICLE_TEXT_TOO_SHORT');
  return text;
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return false;
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

async function serveR2(request: Request, env: Env, key: string, disposition = 'inline') {
  const metadata = await env.VIDEO_BUCKET.head(key);
  if (!metadata) return new Response('Not found', { status: 404 });
  const range = parseRange(request.headers.get('Range'), metadata.size);
  const headers = new Headers();
  metadata.writeHttpMetadata(headers);
  headers.set('ETag', metadata.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  headers.set('Content-Disposition', disposition);
  headers.set('Access-Control-Allow-Origin', 'https://ai-shengyi-video-studio.pages.dev');
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, ETag');
  if (range === false) {
    headers.set('Content-Range', `bytes */${metadata.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set('Content-Length', String(range.length));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`);
    if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
    const object = await env.VIDEO_BUCKET.get(key, { range: { offset: range.start, length: range.length } });
    return object ? new Response(object.body, { status: 206, headers }) : new Response('Not found', { status: 404 });
  }
  headers.set('Content-Length', String(metadata.size));
  if (request.method === 'HEAD') return new Response(null, { headers });
  const object = await env.VIDEO_BUCKET.get(key);
  return object ? new Response(object.body, { headers }) : new Response('Not found', { status: 404 });
}

async function deleteJobArtifacts(env: Env, jobId: string) {
  const prefix = `jobs/${jobId}/`;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await env.VIDEO_BUCKET.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map(object => object.key);
    if (keys.length) { await env.VIDEO_BUCKET.delete(keys); deleted += keys.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await env.VIDEO_DB.prepare('UPDATE jobs SET artifacts_deleted_at = ?, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), new Date().toISOString(), jobId).run();
  return deleted;
}

async function catalog(request: Request, env: Env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase('zh-CN');
  const category = (url.searchParams.get('category') || '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.max(12, Math.min(48, Number(url.searchParams.get('pageSize') || 24)));
  const projectsResponse = await fetch(env.PROJECT_DATA_URL);
  if (!projectsResponse.ok) return json({ error: 'CATALOG_SOURCE_UNAVAILABLE' }, 502);
  const projects: any[] = await projectsResponse.json();
  const categories = [...new Set(projects.map(item => String(item.niche || '其他')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const filtered = projects.filter(item => {
    const searchable = [item.id, item.nameZh, item.name, item.summary, item.niche, ...(Array.isArray(item.tags) ? item.tags : [])].join(' ').toLocaleLowerCase('zh-CN');
    return (!query || searchable.includes(query)) && (!category || item.niche === category);
  });
  const start = (page - 1) * pageSize;
  const pageProjects = filtered.slice(start, start + pageSize);
  const items = await Promise.all(pageProjects.map(async item => {
    const caseId = String(item.id);
    const articleResponse = await fetch(`${env.ARTICLE_BASE_URL}/${caseId}.json`).catch(() => null);
    const article: any = articleResponse?.ok ? await articleResponse.json().catch(() => null) : null;
    const mediaCount = Array.isArray(article?.media) ? article.media.filter((media: any) => /^https:\/\//i.test(String(media?.url || ''))).length : 0;
    return {
      id: caseId, name: item.nameZh || item.name, originalName: item.name, summary: item.summary || item.insight || '',
      category: item.niche || '其他', revenue: item.revenue || '未披露', image: item.image || article?.media?.[0]?.url || '',
      mediaCount, mediaReady: mediaCount >= 3, caseUrl: `https://ai-shengyi-jing.pages.dev/case?id=${encodeURIComponent(caseId)}`,
      replicabilityScore: item.replicabilityScore || null, updatedAt: item.updatedAt || item.scrapedAt || null
    };
  }));
  return json({ items, total: filtered.length, page, pageSize, categories });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': 'https://ai-shengyi-video-studio.pages.dev', 'Access-Control-Allow-Headers': 'Content-Type, X-Factory-Key, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    if (url.pathname === '/api/health') return json({ ok: true, service: 'AI视频创作台', version: env.FACTORY_VERSION, renderer: { enabled: env.RENDERER_ENABLED === 'true', provider: 'Cloudflare Containers + HyperFrames' }, ai: { primary: 'Cloudflare Workers AI', image: '@cf/black-forest-labs/flux-1-schnell', fallback: env.DEEPSEEK_API_KEY ? 'DeepSeek' : 'deterministic' }, sources: ['script','text','topic','article','book','ai-shengyi-case'], retentionDays: Number(env.ARTIFACT_RETENTION_DAYS || 3), time: new Date().toISOString() });
    if (url.pathname === '/api/presets' && request.method === 'GET') return json({ productionLines: publicProductionLines(), limits: { textCharacters:16000, directScriptCharacters:760, batch:20, fileBytes:5242880, durations:[30,60,90,120,180], fileDirect:['text/plain','text/markdown','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], legacyDoc:'请另存为 DOCX 或 Markdown 后导入' } });
    const internalAsset = url.pathname.match(/^\/internal\/assets\/([a-f0-9-]{36})\/(comic-\d{2}\.jpg)$/i);
    if (internalAsset) {
      const assetPath = `${internalAsset[1]}/${internalAsset[2]}`;
      const headerValid = Boolean(env.INTERNAL_RENDER_TOKEN) && request.headers.get('X-Internal-Token') === env.INTERNAL_RENDER_TOKEN;
      const signatureValid = await verifyInternalAsset(assetPath, url.searchParams.get('sig') || '', env.INTERNAL_RENDER_TOKEN);
      if (!headerValid && !signatureValid) return new Response('Not found', { status: 404 });
      return serveR2(request, env, `jobs/${internalAsset[1]}/generated/${internalAsset[2]}`);
    }
    if (url.pathname.startsWith('/output/')) {
      const [, , jobId, filename] = url.pathname.split('/');
      const job: any = await env.VIDEO_DB.prepare('SELECT output_key, poster_key, audio_key, qa_key, status, artifacts_deleted_at FROM jobs WHERE id = ?').bind(jobId).first();
      if (!job || job.status !== 'succeeded' || job.artifacts_deleted_at) return new Response('Not found', { status: 404 });
      const key = filename === 'video.mp4' ? job.output_key : filename === 'poster.jpg' ? job.poster_key : filename === 'audio.mp3' ? job.audio_key : filename === 'qa.json' ? job.qa_key : null;
      const download = url.searchParams.get('download') === '1';
      return key ? serveR2(request, env, key, download ? `attachment; filename="${jobId}-${filename}"` : filename === 'video.mp4' ? `inline; filename="${jobId}.mp4"` : 'inline') : new Response('Not found', { status: 404 });
    }
    if (url.pathname === '/api/catalog' && request.method === 'GET') return catalog(request, env);
    if (url.pathname === '/api/activate' && request.method === 'POST') return activateDevice(request, env);
    if (url.pathname.startsWith('/api/') && !(await authorized(request, env))) return json({ error: 'UNAUTHORIZED' }, 401);
    if (url.pathname === '/api/jobs' && request.method === 'POST') {
      if (env.RENDERER_ENABLED !== 'true') return json({ error: 'RENDERER_UNAVAILABLE', detail: '云端渲染服务尚未开通，请先启用 Cloudflare Workers Paid / Containers。' }, 503);
      const body: any = await request.json().catch(() => null);
      if (body?.source || Array.isArray(body?.sources)) {
        const inputs = Array.isArray(body.sources) ? body.sources : [body.source];
        if (!inputs.length || inputs.length > 20) return json({ error:'INVALID_BATCH_SIZE', detail:'每批支持 1 至 20 份文案。' },400);
        const allowed = new Set(['script','text','topic','article','book']);
        const sources: Array<{ sourceType: SourceType; title?: string; text?: string; url?: string }> = [];
        for (const raw of inputs) {
          const sourceType = String(raw?.sourceType || '');
          if (!allowed.has(sourceType)) return json({ error:'INVALID_SOURCE_TYPE' },400);
          const source: any = { sourceType, title: String(raw?.title || '').trim().slice(0,120), text: String(raw?.text || '').trim().slice(0,16000), url: String(raw?.url || '').trim().slice(0,2000) };
          if (sourceType === 'article' && source.url && !source.text) { try { source.text = await safeArticleText(source.url); } catch (error) { return json({ error:'ARTICLE_IMPORT_FAILED', detail:error instanceof Error ? error.message : String(error) },422); } }
          if (source.text.length < (sourceType === 'script' ? 100 : 12)) return json({ error:'SOURCE_TOO_SHORT', detail:sourceType === 'script' ? `“${source.title || '未命名文案'}”少于 100 字，无法稳定达到 30 秒成片。` : `“${source.title || '未命名文案'}”少于 12 个字。` },400);
          if (sourceType === 'script' && source.text.length > 760) return json({ error:'SCRIPT_TOO_LONG', detail:`“${source.title || '未命名文案'}”超过 760 字；为保证 180 秒内完成，请拆成多份文案后批量导入。` },400);
          sources.push(source);
        }
        try {
          const jobs = [];
          for (const source of sources) jobs.push(await enqueue(env,{ source, options:body.options }));
          return json({ jobs, count:jobs.length, status:'queued' },202);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          return json({ error:detail.split(':')[0], detail },400);
        }
      }
      const values = Array.isArray(body?.caseIds) ? body.caseIds : [body?.caseId];
      const caseIds = [...new Set(values.map((value: unknown) => String(value || '').trim()).filter(Boolean))] as string[];
      if (!caseIds.length || caseIds.length > 50 || caseIds.some(caseId => !/^[a-z0-9]{8,32}$/i.test(caseId))) return json({ error: 'INVALID_CASE_IDS', detail: '每批需包含1至50个有效案例ID' }, 400);
      const jobs = [];
      try { for (const caseId of caseIds) jobs.push(await enqueue(env, { caseId, options:body.options })); }
      catch (error) { const detail = error instanceof Error ? error.message : String(error); return json({ error:detail.split(':')[0], detail },400); }
      return json({ jobs, count: jobs.length, status: 'queued' }, 202);
    }
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      const rows = await env.VIDEO_DB.prepare('SELECT id, case_id, case_name, source_type, source_title, template_id, options, status, stage, progress, attempt, qa_score, needs_review, error_code, error_message, created_at, updated_at, completed_at, retention_until, artifacts_deleted_at, poster_key FROM jobs ORDER BY created_at DESC LIMIT 100').all();
      return json({ jobs: rows.results });
    }
    const retryMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/retry$/i);
    if (retryMatch && request.method === 'POST') {
      const previous: any = await env.VIDEO_DB.prepare('SELECT case_id, source_type, source_payload, options FROM jobs WHERE id = ?').bind(retryMatch[1]).first();
      if (!previous) return json({ error: 'NOT_FOUND' }, 404);
      const payload = previous.source_payload ? JSON.parse(String(previous.source_payload)) : null;
      return json(await enqueue(env, previous.source_type === 'ai-shengyi-case' ? { caseId:String(previous.case_id) } : { source:payload, options: previous.options ? JSON.parse(String(previous.options)) : {} }), 202);
    }
    const rendererStatusMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/renderer-status$/i);
    if (rendererStatusMatch && request.method === 'GET') {
      const job: any = await env.VIDEO_DB.prepare('SELECT id, attempt, status FROM jobs WHERE id = ?').bind(rendererStatusMatch[1]).first();
      if (!job) return json({ error: 'NOT_FOUND' }, 404);
      if (job.status !== 'running') return json({ jobStatus: job.status, renderer: null });
      const renderJobId = Number(job.attempt || 1) === 1 ? String(job.id) : `${job.id}-retry-${job.attempt}`;
      const response = await env.VIDEO_RENDERER.getByName(renderJobId).fetch(`http://container/jobs/${renderJobId}`);
      return response.ok ? json({ jobStatus: job.status, renderer: await response.json() }) : json({ jobStatus: job.status, renderer: null, detail: await response.text() }, response.status);
    }
    const rendererQaMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/renderer-qa$/i);
    if (rendererQaMatch && request.method === 'GET') {
      const job: any = await env.VIDEO_DB.prepare('SELECT id, attempt FROM jobs WHERE id = ?').bind(rendererQaMatch[1]).first();
      if (!job) return json({ error: 'NOT_FOUND' }, 404);
      const renderJobId = Number(job.attempt || 1) === 1 ? String(job.id) : `${job.id}-retry-${job.attempt}`;
      const response = await env.VIDEO_RENDERER.getByName(renderJobId).fetch(`http://container/jobs/${renderJobId}/artifacts/qa.json`);
      if (!response.ok) return json({ error: 'RENDERER_QA_UNAVAILABLE', detail: await response.text() }, response.status);
      return new Response(response.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const artifactMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/artifacts$/i);
    if (artifactMatch && request.method === 'DELETE') {
      const previous: any = await env.VIDEO_DB.prepare('SELECT status FROM jobs WHERE id = ?').bind(artifactMatch[1]).first();
      if (!previous) return json({ error: 'NOT_FOUND' }, 404);
      if (previous.status !== 'succeeded') return json({ error: 'JOB_NOT_READY' }, 409);
      return json({ ok: true, deleted: await deleteJobArtifacts(env, artifactMatch[1]) });
    }
    const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);
    if (match && request.method === 'DELETE') {
      const previous: any = await env.VIDEO_DB.prepare('SELECT status FROM jobs WHERE id = ?').bind(match[1]).first();
      if (!previous) return json({ error: 'NOT_FOUND' }, 404);
      if (previous.status === 'queued' || previous.status === 'running') return json({ error: 'JOB_ACTIVE', detail: '任务仍在生产中，完成或失败后才能删除。' }, 409);
      const deletedArtifacts = await deleteJobArtifacts(env, match[1]);
      await env.VIDEO_DB.batch([
        env.VIDEO_DB.prepare('DELETE FROM job_events WHERE job_id = ?').bind(match[1]),
        env.VIDEO_DB.prepare('DELETE FROM jobs WHERE id = ?').bind(match[1])
      ]);
      return json({ ok: true, deletedArtifacts });
    }
    if (match && request.method === 'GET') {
      const job: any = await getJob(env, match[1]);
      if (!job) return json({ error: 'NOT_FOUND' }, 404);
      if (job.status === 'succeeded' && !job.artifacts_deleted_at) job.outputs = { video: `/output/${job.id}/video.mp4`, poster: `/output/${job.id}/poster.jpg`, audio: `/output/${job.id}/audio.mp3`, qa: `/output/${job.id}/qa.json` };
      return json(job);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const expired = await env.VIDEO_DB.prepare("SELECT id FROM jobs WHERE status = 'succeeded' AND retention_until IS NOT NULL AND retention_until < ? AND artifacts_deleted_at IS NULL LIMIT 50").bind(new Date().toISOString()).all();
    for (const row of expired.results as any[]) await deleteJobArtifacts(env, String(row.id));
    const limit = Math.max(0, Math.min(10, Number(env.AUTO_BATCH_SIZE || 0)));
    if (!limit) return;
    const [projectsResponse, active] = await Promise.all([
      fetch(env.PROJECT_DATA_URL),
      env.VIDEO_DB.prepare("SELECT DISTINCT case_id FROM jobs WHERE status IN ('queued','running','succeeded')").all()
    ]);
    if (!projectsResponse.ok) throw new Error('AUTO_SOURCE_FETCH_FAILED');
    const projects: any[] = await projectsResponse.json();
    const existing = new Set((active.results as any[]).map(row => String(row.case_id)));
    const selected = [];
    const candidates = projects.filter(project => !existing.has(String(project.id))).slice(0, 100);
    for (const project of candidates) {
      const caseId = String(project.id);
      const articleResponse = await fetch(`${env.ARTICLE_BASE_URL}/${caseId}.json`).catch(() => null);
      const article: any = articleResponse?.ok ? await articleResponse.json().catch(() => null) : null;
      const validMedia = Array.isArray(article?.media) ? article.media.filter((media: any) => /^https:\/\//i.test(String(media?.url || ''))).length : 0;
      if (validMedia >= 3) selected.push(project);
      if (selected.length >= limit) break;
    }
    for (const project of selected) await enqueue(env, { caseId: String(project.id) });
  }
};

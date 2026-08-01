import { VideoProductionWorkflow } from './workflow';
import { VideoRenderer } from './renderer';
import { getJob } from './db';
import type { Env } from './types';

export { VideoProductionWorkflow, VideoRenderer };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': 'https://ai-shengyi-video-studio.pages.dev', 'Access-Control-Allow-Headers': 'Content-Type, X-Factory-Key, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' } });
}

async function authorized(request: Request, env: Env) {
  const provided = request.headers.get('X-Factory-Key') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!provided || !env.FACTORY_ADMIN_TOKEN) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(provided)), crypto.subtle.digest('SHA-256', encoder.encode(env.FACTORY_ADMIN_TOKEN))]);
  const a = new Uint8Array(left), b = new Uint8Array(right); let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function id() { return crypto.randomUUID(); }

async function enqueueCase(env: Env, caseId: string) {
  const jobId = id(), now = new Date().toISOString();
  await env.VIDEO_DB.prepare('INSERT INTO jobs(id, case_id, template_id, status, stage, progress, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').bind(jobId, caseId, 'editorial-v1', 'queued', 'queued', 0, now, now).run();
  const workflow = await env.VIDEO_WORKFLOW.create({ id: jobId, params: { jobId, caseId, template: 'editorial-v1' } });
  await env.VIDEO_DB.prepare('UPDATE jobs SET workflow_id = ? WHERE id = ?').bind(workflow.id, jobId).run();
  return { jobId, workflowId: workflow.id, caseId, status: 'queued' };
}

async function serveR2(env: Env, key: string, disposition = 'inline') {
  const object = await env.VIDEO_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('ETag', object.httpEtag); headers.set('Cache-Control', 'public, max-age=3600'); headers.set('Content-Disposition', disposition); headers.set('Access-Control-Allow-Origin', 'https://ai-shengyi-video-studio.pages.dev');
  return new Response(object.body, { headers });
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
  const items = pageProjects.map(item => ({
    id: String(item.id), name: item.nameZh || item.name, originalName: item.name, summary: item.summary || item.insight || '',
    category: item.niche || '其他', revenue: item.revenue || '未披露', image: item.image || '', mediaReady: true,
    replicabilityScore: item.replicabilityScore || null, updatedAt: item.updatedAt || item.scrapedAt || null
  }));
  return json({ items, total: filtered.length, page, pageSize, categories });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': 'https://ai-shengyi-video-studio.pages.dev', 'Access-Control-Allow-Headers': 'Content-Type, X-Factory-Key, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '86400' } });
    if (url.pathname === '/api/health') return json({ ok: true, service: 'AI生意经视频工厂', version: env.FACTORY_VERSION, time: new Date().toISOString() });
    if (url.pathname.startsWith('/output/')) {
      const [, , jobId, filename] = url.pathname.split('/');
      const job: any = await env.VIDEO_DB.prepare('SELECT output_key, poster_key, audio_key, qa_key, status, artifacts_deleted_at FROM jobs WHERE id = ?').bind(jobId).first();
      if (!job || job.status !== 'succeeded' || job.artifacts_deleted_at) return new Response('Not found', { status: 404 });
      const key = filename === 'video.mp4' ? job.output_key : filename === 'poster.jpg' ? job.poster_key : filename === 'audio.mp3' ? job.audio_key : filename === 'qa.json' ? job.qa_key : null;
      const download = url.searchParams.get('download') === '1';
      return key ? serveR2(env, key, download ? `attachment; filename="${jobId}-${filename}"` : filename === 'video.mp4' ? `inline; filename="${jobId}.mp4"` : 'inline') : new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/api/') && !(await authorized(request, env))) return json({ error: 'UNAUTHORIZED' }, 401);
    if (url.pathname === '/api/catalog' && request.method === 'GET') return catalog(request, env);
    if (url.pathname === '/api/jobs' && request.method === 'POST') {
      const body: any = await request.json().catch(() => null);
      const values = Array.isArray(body?.caseIds) ? body.caseIds : [body?.caseId];
      const caseIds = [...new Set(values.map((value: unknown) => String(value || '').trim()).filter(Boolean))] as string[];
      if (!caseIds.length || caseIds.length > 50 || caseIds.some(caseId => !/^[a-z0-9]{8,32}$/i.test(caseId))) return json({ error: 'INVALID_CASE_IDS', detail: '每批需包含1至50个有效案例ID' }, 400);
      const jobs = [];
      for (const caseId of caseIds) jobs.push(await enqueueCase(env, caseId));
      return json({ jobs, count: jobs.length, status: 'queued' }, 202);
    }
    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      const rows = await env.VIDEO_DB.prepare('SELECT id, case_id, case_name, status, stage, progress, attempt, qa_score, error_code, error_message, created_at, updated_at, completed_at, retention_until, artifacts_deleted_at, poster_key FROM jobs ORDER BY created_at DESC LIMIT 100').all();
      return json({ jobs: rows.results });
    }
    const retryMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/retry$/i);
    if (retryMatch && request.method === 'POST') {
      const previous: any = await env.VIDEO_DB.prepare('SELECT case_id FROM jobs WHERE id = ?').bind(retryMatch[1]).first();
      if (!previous) return json({ error: 'NOT_FOUND' }, 404);
      return json(await enqueueCase(env, String(previous.case_id)), 202);
    }
    const artifactMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/artifacts$/i);
    if (artifactMatch && request.method === 'DELETE') {
      const previous: any = await env.VIDEO_DB.prepare('SELECT status FROM jobs WHERE id = ?').bind(artifactMatch[1]).first();
      if (!previous) return json({ error: 'NOT_FOUND' }, 404);
      if (previous.status !== 'succeeded') return json({ error: 'JOB_NOT_READY' }, 409);
      return json({ ok: true, deleted: await deleteJobArtifacts(env, artifactMatch[1]) });
    }
    const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);
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
    const selected = projects.filter(project => !existing.has(String(project.id))).slice(0, limit);
    for (const project of selected) await enqueueCase(env, String(project.id));
  }
};

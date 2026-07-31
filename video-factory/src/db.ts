import type { Env } from './types';

export async function updateJob(env: Env, jobId: string, values: Record<string, unknown>) {
  const entries = Object.entries({ ...values, updated_at: new Date().toISOString() }).filter(([, value]) => value !== undefined);
  const sql = `UPDATE jobs SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`;
  await env.VIDEO_DB.prepare(sql).bind(...entries.map(([, value]) => value), jobId).run();
}

export async function event(env: Env, jobId: string, stage: string, message: string, details?: unknown, level = 'info') {
  await env.VIDEO_DB.prepare('INSERT INTO job_events(job_id, stage, level, message, details, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .bind(jobId, stage, level, message, details ? JSON.stringify(details) : null, new Date().toISOString()).run();
}

export async function getJob(env: Env, id: string) {
  const job = await env.VIDEO_DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();
  if (!job) return null;
  const events = await env.VIDEO_DB.prepare('SELECT stage, level, message, details, created_at FROM job_events WHERE job_id = ? ORDER BY id DESC LIMIT 80').bind(id).all();
  return { ...job, events: events.results };
}

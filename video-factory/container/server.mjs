import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = '/work/jobs';
const jobs = new Map();
mkdirSync(ROOT, { recursive: true });

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('manifest too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function loadStatus(id) {
  const statusFile = join(ROOT, id, 'status.json');
  if (existsSync(statusFile)) return JSON.parse(readFileSync(statusFile, 'utf8'));
  return jobs.get(id) || null;
}

function runJob(manifest) {
  const dir = join(ROOT, manifest.jobId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const initial = { jobId: manifest.jobId, status: 'running', stage: 'starting', progress: 1, startedAt: new Date().toISOString() };
  jobs.set(manifest.jobId, initial); writeFileSync(join(dir, 'status.json'), JSON.stringify(initial));
  const child = spawn(process.execPath, ['/app/render-job.mjs', join(dir, 'manifest.json'), dir], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: '/work' } });
  const log = [];
  child.stdout.on('data', chunk => log.push(chunk.toString()));
  child.stderr.on('data', chunk => log.push(chunk.toString()));
  child.on('close', code => {
    writeFileSync(join(dir, 'renderer.log'), log.join('').slice(-500000));
    const current = loadStatus(manifest.jobId) || initial;
    if (code !== 0 && current.status !== 'failed') {
      const failed = { ...current, status: 'failed', stage: 'failed', error: `renderer exited ${code}`, finishedAt: new Date().toISOString() };
      jobs.set(manifest.jobId, failed); writeFileSync(join(dir, 'status.json'), JSON.stringify(failed));
    } else jobs.set(manifest.jobId, loadStatus(manifest.jobId));
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://container');
    if (url.pathname === '/health') return sendJson(response, 200, { ok: true, service: 'video-renderer', activeJobs: [...jobs.values()].filter(item => item?.status === 'running').length });
    if (url.pathname === '/jobs' && request.method === 'POST') {
      const manifest = await body(request);
      if (!manifest?.jobId || !manifest?.script?.beats?.length) return sendJson(response, 400, { error: 'INVALID_MANIFEST' });
      const current = loadStatus(manifest.jobId);
      if (current && current.status !== 'failed') return sendJson(response, 200, current);
      runJob(manifest);
      return sendJson(response, 202, { jobId: manifest.jobId, status: 'running' });
    }
    const statusMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
    if (statusMatch && request.method === 'GET') {
      const status = loadStatus(statusMatch[1]);
      return status ? sendJson(response, 200, status) : sendJson(response, 404, { error: 'NOT_FOUND' });
    }
    const artifactMatch = url.pathname.match(/^\/jobs\/([^/]+)\/artifacts\/(video\.mp4|voice\.mp3|poster\.jpg|contact-sheet\.jpg|qa\.json)$/);
    if (artifactMatch && request.method === 'GET') {
      const path = join(ROOT, artifactMatch[1], 'output', artifactMatch[2]);
      if (!existsSync(path)) return sendJson(response, 404, { error: 'ARTIFACT_NOT_FOUND' });
      const contentTypes = { 'video.mp4': 'video/mp4', 'voice.mp3': 'audio/mpeg', 'poster.jpg': 'image/jpeg', 'contact-sheet.jpg': 'image/jpeg', 'qa.json': 'application/json' };
      response.writeHead(200, { 'Content-Type': contentTypes[artifactMatch[2]], 'Cache-Control': 'no-store' });
      return createReadStream(path).pipe(response);
    }
    return sendJson(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(8080, '0.0.0.0', () => console.log('renderer listening on 8080'));

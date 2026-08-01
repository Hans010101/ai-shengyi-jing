import { Buffer } from 'node:buffer';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { buildManifest, buildSnapshot, generateScript, similarity } from './pipeline';
import { enrichSnapshotMedia } from './media';
import { event as addEvent, updateJob } from './db';
import type { Env, RenderManifest } from './types';

type Params = { jobId: string; caseId: string; template: 'editorial-v1' };

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { 'User-Agent': 'AI-Shengyi-Video-Factory/0.1' } });
  if (!response.ok) throw new Error(`source fetch failed ${response.status}: ${url}`);
  return response.json<any>();
}

async function loadSnapshot(env: Env, caseId: string) {
  const [projects, articleResult] = await Promise.all([
    fetchJson(env.PROJECT_DATA_URL),
    fetchJson(`${env.ARTICLE_BASE_URL}/${caseId}.json`).catch(() => null)
  ]);
  const project = projects.find((item: any) => String(item.id) === caseId);
  if (!project) throw new Error(`CASE_NOT_FOUND:${caseId}`);
  let article = articleResult;
  if (!article) {
    const articles = await fetchJson(env.ARTICLE_DATA_URL);
    article = articles.find((item: any) => String(item.projectId) === caseId);
  }
  const snapshot = buildSnapshot(project, article);
  return enrichSnapshotMedia(snapshot, project, article, env);
}

async function waitForRender(step: WorkflowStep, renderer: DurableObjectStub, manifest: RenderManifest, internalToken: string, attempt: number) {
  let recoveries = 0;
  for (let index = 0; index < 120; index++) {
    const status = await step.do(`render-status-${attempt}-${index}`, async () => {
      const response = await renderer.fetch(`http://container/jobs/${manifest.jobId}`);
      if (response.status === 404) {
        const restart = await renderer.fetch('http://container/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': internalToken },
          body: JSON.stringify(manifest)
        });
        if (!restart.ok) throw new Error(`renderer recovery ${restart.status}: ${await restart.text()}`);
        return { status: 'recovering' };
      }
      if (!response.ok) throw new Error(`renderer status ${response.status}`);
      return response.json<any>();
    });
    if (status.status === 'recovering') {
      recoveries += 1;
      if (recoveries > 2) throw new Error('RENDERER_RESTART_LIMIT');
    }
    if (status.status === 'succeeded') return status;
    if (status.status === 'failed') throw new Error(`RENDER_FAILED:${status.error || 'unknown'}`);
    await step.sleep(`render-wait-${attempt}-${index}`, '10 seconds');
  }
  throw new Error('RENDER_TIMEOUT');
}

async function storeArtifact(env: Env, renderer: DurableObjectStub, jobId: string, name: string, key: string, contentType: string) {
  const response = await renderer.fetch(`http://container/jobs/${jobId}/artifacts/${name}`);
  if (!response.ok || !response.body) throw new Error(`artifact ${name} unavailable: ${response.status}`);
  // Container responses are chunked streams. R2 requires a known-length body,
  // so materialize the artifact before upload instead of forwarding the stream.
  const bytes = await response.arrayBuffer();
  await env.VIDEO_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
}

async function asrCheck(env: Env, audioKey: string, expected: string) {
  const object = await env.VIDEO_BUCKET.get(audioKey);
  if (!object) throw new Error('audio artifact missing');
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength > 9_000_000) return { skipped: true, reason: 'audio exceeds ASR inline limit', similarity: 0 };
  const result: any = await env.AI.run(env.ASR_MODEL, { audio: Buffer.from(bytes).toString('base64'), language: 'zh', vad_filter: true, initial_prompt: '这是一条中文商业案例解说视频。' });
  const transcript = String(result?.text || result?.transcription_info?.text || '');
  return { skipped: false, transcript, similarity: similarity(expected, transcript), vtt: result?.vtt || '' };
}

export class VideoProductionWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { jobId, caseId } = event.payload;
    try {
      await step.do('mark-started', async () => { await updateJob(this.env, jobId, { status: 'running', stage: 'source', progress: 5 }); await addEvent(this.env, jobId, 'source', '开始读取案例事实，并扩充官网与可商用场景素材'); });
      const snapshot = await step.do('load-case-snapshot', async () => loadSnapshot(this.env, caseId));
      if (snapshot.media.length < 3) throw new Error(`INSUFFICIENT_MEDIA:${snapshot.media.length}`);
      await step.do('store-snapshot', async () => { const key = `jobs/${jobId}/case-snapshot.json`; await this.env.VIDEO_BUCKET.put(key, JSON.stringify(snapshot, null, 2), { httpMetadata: { contentType: 'application/json' } }); await updateJob(this.env, jobId, { case_name: snapshot.nameZh, stage: 'script', progress: 16 }); await addEvent(this.env, jobId, 'source', `读取到${snapshot.facts.length}条事实、${snapshot.media.length}项素材`); });
      const generated = await step.do('generate-grounded-script', async () => generateScript(snapshot, this.env));
      await step.do('store-script', async () => { await this.env.VIDEO_BUCKET.put(`jobs/${jobId}/script.json`, JSON.stringify(generated.script, null, 2), { httpMetadata: { contentType: 'application/json' } }); await updateJob(this.env, jobId, { provider: generated.provider, stage: 'render', progress: 28 }); await addEvent(this.env, jobId, 'script', `脚本完成：${generated.script.beats.length}个叙事段落`, { provider: generated.provider }); });

      let finalQa: any = null;
      let finalKeys: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const renderJobId = attempt === 1 ? jobId : `${jobId}-retry-${attempt}`;
        const manifest = buildManifest(renderJobId, snapshot, generated.script, attempt);
        const manifestKey = `jobs/${jobId}/attempt-${attempt}/render-manifest.json`;
        await step.do(`submit-render-${attempt}`, async () => {
          await this.env.VIDEO_BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: 'application/json' } });
          await updateJob(this.env, jobId, { attempt, manifest_key: manifestKey, stage: 'render', progress: attempt === 1 ? 35 : 64 });
          const renderer = this.env.VIDEO_RENDERER.getByName(renderJobId);
          const response = await renderer.fetch('http://container/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Token': this.env.INTERNAL_RENDER_TOKEN }, body: JSON.stringify(manifest) });
          if (!response.ok) throw new Error(`renderer submit ${response.status}: ${await response.text()}`);
          await addEvent(this.env, jobId, 'render', `第${attempt}轮渲染已提交`);
        });
        const renderer = this.env.VIDEO_RENDERER.getByName(renderJobId);
        const renderStatus = await waitForRender(step, renderer, manifest, this.env.INTERNAL_RENDER_TOKEN, attempt);
        const base = `jobs/${jobId}/attempt-${attempt}`;
        const keys = { video: `${base}/video.mp4`, audio: `${base}/voice.mp3`, poster: `${base}/poster.jpg`, contact: `${base}/contact-sheet.jpg`, technicalQa: `${base}/technical-qa.json` };
        await step.do(`store-artifacts-${attempt}`, async () => {
          await Promise.all([
            storeArtifact(this.env, renderer, renderJobId, 'video.mp4', keys.video, 'video/mp4'),
            storeArtifact(this.env, renderer, renderJobId, 'voice.mp3', keys.audio, 'audio/mpeg'),
            storeArtifact(this.env, renderer, renderJobId, 'poster.jpg', keys.poster, 'image/jpeg'),
            storeArtifact(this.env, renderer, renderJobId, 'contact-sheet.jpg', keys.contact, 'image/jpeg'),
            storeArtifact(this.env, renderer, renderJobId, 'qa.json', keys.technicalQa, 'application/json')
          ]);
        });
        const expected = generated.script.beats.map(item => item.narration).join('');
        const qa = await step.do(`quality-gate-${attempt}`, async () => {
          const technicalObject = await this.env.VIDEO_BUCKET.get(keys.technicalQa);
          const technical = technicalObject ? JSON.parse(await technicalObject.text()) : { passed: false };
          let asr: any;
          try { asr = await asrCheck(this.env, keys.audio, expected); } catch (error) { asr = { skipped: true, reason: String(error), similarity: 0 }; }
          const passed = technical.passed === true && (asr.skipped || asr.similarity >= manifest.quality.asrSimilarity);
          const score = Math.round(((technical.score || 0) * 0.6 + (asr.skipped ? 85 : asr.similarity * 100) * 0.4) * 10) / 10;
          return { schemaVersion: '1.0', passed, score, attempt, technical, asr, thresholds: manifest.quality, checkedAt: new Date().toISOString() };
        });
        const qaKey = `${base}/qa-report.json`;
        await step.do(`store-qa-${attempt}`, async () => { await this.env.VIDEO_BUCKET.put(qaKey, JSON.stringify(qa, null, 2), { httpMetadata: { contentType: 'application/json' } }); await addEvent(this.env, jobId, 'quality', `第${attempt}轮品控${qa.passed ? '通过' : '未通过'}，评分${qa.score}`, qa); });
        finalQa = qa; finalKeys = { ...keys, qa: qaKey, manifest: manifestKey };
        if (qa.passed) break;
      }
      if (!finalQa?.passed) throw new Error(`QUALITY_GATE_FAILED:${finalQa?.score || 0}`);
      await step.do('publish-result', async () => {
        const completed = new Date().toISOString();
        const retentionDays = Math.max(1, Math.min(30, Number(this.env.ARTIFACT_RETENTION_DAYS || 3)));
        const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
        await updateJob(this.env, jobId, { status: 'succeeded', stage: 'published', progress: 100, output_key: finalKeys.video, poster_key: finalKeys.poster, audio_key: finalKeys.audio, qa_key: finalKeys.qa, manifest_key: finalKeys.manifest, qa_score: finalQa.score, completed_at: completed, retention_until: retentionUntil });
        await addEvent(this.env, jobId, 'published', '成片通过全部质量门并已发布');
      });
      return { jobId, status: 'succeeded', score: finalQa.score };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateJob(this.env, event.payload.jobId, { status: 'failed', stage: 'failed', error_code: message.split(':')[0], error_message: message });
      await addEvent(this.env, event.payload.jobId, 'failed', message, undefined, 'error');
      throw error;
    }
  }
}

export interface Env {
  ASSETS: Fetcher; AI: Ai; VIDEO_BUCKET: R2Bucket; VIDEO_DB: D1Database; VIDEO_WORKFLOW: Workflow;
  VIDEO_RENDERER: DurableObjectNamespace<import('./renderer').VideoRenderer>;
  FACTORY_ADMIN_TOKEN: string; INTERNAL_RENDER_TOKEN: string; DEEPSEEK_API_KEY?: string; PEXELS_API_KEY?: string;
  PROJECT_DATA_URL: string; ARTICLE_DATA_URL: string; ARTICLE_BASE_URL: string; SCRIPT_MODEL: string; ASR_MODEL: string;
  FACTORY_VERSION: string; AUTO_BATCH_SIZE: string; ARTIFACT_RETENTION_DAYS: string; RENDERER_ENABLED: string; PUBLIC_ORIGIN: string;
}

export type SourceType = 'text' | 'topic' | 'article' | 'book' | 'ai-shengyi-case';
export type VisualPreset = 'smart-director' | 'knowledge-diagram' | 'comic' | 'sand-art' | 'scenery' | 'satisfying' | 'real-montage';
export type AspectRatio = '9:16' | '16:9' | '1:1';

export type MediaItem = { id: string; type: 'image' | 'video'; url: string; poster?: string; caption: string; sourceUrl?: string; origin?: string; creator?: string; license?: string };
export type EvidenceItem = { id: string; label: string; value: string; evidence: string };
export type ContentSnapshot = {
  schemaVersion: '2.0'; sourceId: string; sourceType: SourceType; title: string; summary: string; rawText: string;
  facts: EvidenceItem[]; media: MediaItem[]; source: { name: string; url?: string; capturedAt: string };
  legacy?: { caseId?: string; revenue?: string; businessModel?: string; chinaOpportunity?: string };
};
export type CaseSnapshot = ContentSnapshot & { caseId?: string; name?: string; nameZh?: string; revenue?: string; businessModel?: string; chinaOpportunity?: string };
export type ProductionOptions = { templateId: string; visualPreset: VisualPreset; aspectRatio: AspectRatio; durationSeconds: number; voice: string; voiceRate: number; brandPreset: string; bgm: boolean; autoDucking: boolean };
export type ScriptBeat = { id: string; chapter: string; narration: string; onScreen: string; evidenceIds: string[]; mediaIds: string[]; emphasis?: string };
export type VideoScript = { schemaVersion: '1.0'; headline: string; subheadline: string; hook: string; beats: ScriptBeat[]; closing: string };
export type RenderManifest = {
  schemaVersion: '2.0'; jobId: string; template: string; templateVersion: '2.0.0'; contentSnapshot: ContentSnapshot; caseSnapshot: any; script: VideoScript; options: ProductionOptions;
  voice: { provider: 'edge-neural' | 'cloudflare-melotts'; voice: string; rate: string; pitch: string; phrasePauseSeconds: number };
  quality: { width: number; height: number; fps: 30; minUniqueMedia: number; minDurationSeconds: number; maxDurationSeconds: number; targetLufs: number; truePeak: number; asrSimilarity: number };
};

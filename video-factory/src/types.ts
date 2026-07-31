export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  VIDEO_BUCKET: R2Bucket;
  VIDEO_DB: D1Database;
  VIDEO_WORKFLOW: Workflow;
  VIDEO_RENDERER: DurableObjectNamespace<import('./renderer').VideoRenderer>;
  FACTORY_ADMIN_TOKEN: string;
  INTERNAL_RENDER_TOKEN: string;
  DEEPSEEK_API_KEY?: string;
  PROJECT_DATA_URL: string;
  ARTICLE_DATA_URL: string;
  ARTICLE_BASE_URL: string;
  SCRIPT_MODEL: string;
  ASR_MODEL: string;
  FACTORY_VERSION: string;
  AUTO_BATCH_SIZE: string;
  ARTIFACT_RETENTION_DAYS: string;
  PUBLIC_ORIGIN: string;
}

export type MediaItem = {
  id: string;
  type: 'image' | 'video';
  url: string;
  poster?: string;
  caption: string;
  sourceUrl?: string;
  origin?: string;
};

export type CaseSnapshot = {
  schemaVersion: '1.0';
  caseId: string;
  name: string;
  nameZh: string;
  summary: string;
  revenue: string;
  businessModel: string;
  chinaOpportunity: string;
  facts: Array<{ id: string; label: string; value: string; evidence: string }>;
  media: MediaItem[];
  source: { name: string; url: string; capturedAt: string };
};

export type ScriptBeat = {
  id: string;
  chapter: string;
  narration: string;
  onScreen: string;
  evidenceIds: string[];
  mediaIds: string[];
  emphasis?: string;
};

export type VideoScript = {
  schemaVersion: '1.0';
  headline: string;
  subheadline: string;
  hook: string;
  beats: ScriptBeat[];
  closing: string;
};

export type RenderManifest = {
  schemaVersion: '1.0';
  jobId: string;
  template: 'editorial-v1';
  templateVersion: '1.0.0';
  caseSnapshot: CaseSnapshot;
  script: VideoScript;
  voice: {
    provider: 'edge-neural' | 'cloudflare-melotts';
    voice: string;
    rate: string;
    pitch: string;
    phrasePauseSeconds: number;
  };
  quality: {
    width: 1080;
    height: 1920;
    fps: 30;
    minUniqueMedia: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    targetLufs: number;
    truePeak: number;
    asrSimilarity: number;
  };
};

import type { AspectRatio, ProductionOptions, SourceType, VisualPreset } from './types';

export type ProductionLine = {
  id: string;
  version: string;
  name: string;
  description: string;
  sourceTypes: SourceType[];
  visualPreset: VisualPreset;
  brandPreset: string;
  defaultAspectRatio: AspectRatio;
  defaultDurationSeconds: number;
  preserveScript: boolean;
  mediaStrategy: 'workers-ai-illustration' | 'knowledge-diagram' | 'verified-source-media';
  status: 'active';
};

export const PRODUCTION_LINES: readonly ProductionLine[] = [
  {
    id: 'comic-engraving-v1', version: '1.0.0', name: '木刻漫画叙事',
    description: '深绿木刻插画、象牙白线稿与黄色口播字幕；每个分镜独立生成画面。',
    sourceTypes: ['script', 'text', 'topic', 'article', 'book'], visualPreset: 'comic', brandPreset: 'comic-engraving',
    defaultAspectRatio: '9:16', defaultDurationSeconds: 90, preserveScript: true, mediaStrategy: 'workers-ai-illustration', status: 'active'
  },
  {
    id: 'knowledge-director-v1', version: '2.1.0', name: '知识图解',
    description: '结构化提炼观点，用信息图、动态图表与重点字幕讲清复杂内容。',
    sourceTypes: ['script', 'text', 'topic', 'article', 'book'], visualPreset: 'knowledge-diagram', brandPreset: 'studio-neutral',
    defaultAspectRatio: '9:16', defaultDurationSeconds: 60, preserveScript: true, mediaStrategy: 'knowledge-diagram', status: 'active'
  },
  {
    id: 'ai-shengyi-case-v1', version: '2.1.0', name: '商业案例拆解',
    description: '沿用已经过多轮调试的 AI 生意经真实素材、商业叙事与质量门。',
    sourceTypes: ['ai-shengyi-case'], visualPreset: 'real-montage', brandPreset: 'ai-shengyi-jing',
    defaultAspectRatio: '9:16', defaultDurationSeconds: 90, preserveScript: false, mediaStrategy: 'verified-source-media', status: 'active'
  }
] as const;

export function defaultProductionLineId(sourceType: SourceType) {
  if (sourceType === 'ai-shengyi-case') return 'ai-shengyi-case-v1';
  if (sourceType === 'script') return 'comic-engraving-v1';
  return 'knowledge-director-v1';
}

export function resolveProductionLine(sourceType: SourceType, requestedId?: string): ProductionLine {
  const id = requestedId || defaultProductionLineId(sourceType);
  const line = PRODUCTION_LINES.find(item => item.id === id);
  if (!line) throw new Error(`UNKNOWN_PRODUCTION_LINE:${id}`);
  if (!line.sourceTypes.includes(sourceType)) throw new Error(`PRODUCTION_LINE_SOURCE_MISMATCH:${id}:${sourceType}`);
  return line;
}

export function productionOptions(sourceType: SourceType, requested: Partial<ProductionOptions> = {}): ProductionOptions {
  const line = resolveProductionLine(sourceType, requested.productionLineId || requested.templateId);
  const allowedDurations = new Set([30, 60, 90, 120, 180]);
  const allowedRatios = new Set<AspectRatio>(['9:16', '16:9', '1:1']);
  const durationSeconds = allowedDurations.has(Number(requested.durationSeconds)) ? Number(requested.durationSeconds) : line.defaultDurationSeconds;
  const aspectRatio = allowedRatios.has(requested.aspectRatio as AspectRatio) ? requested.aspectRatio as AspectRatio : line.defaultAspectRatio;
  return {
    productionLineId: line.id,
    templateId: line.id,
    visualPreset: line.visualPreset,
    aspectRatio,
    durationSeconds,
    voice: String(requested.voice || 'zh-CN-XiaoxiaoNeural').slice(0, 80),
    voiceRate: Math.max(0.85, Math.min(1.25, Number(requested.voiceRate || 1.08))),
    brandPreset: line.brandPreset,
    bgm: requested.bgm !== false,
    autoDucking: requested.autoDucking !== false
  };
}

export function publicProductionLines() {
  return PRODUCTION_LINES.map(({ preserveScript, mediaStrategy, ...line }) => ({ ...line, preserveScript, mediaStrategy }));
}

import type { CaseSnapshot, Env, MediaItem } from './types';

const BLOCKED_MEDIA_WORDS = /(?:logo|branding|favicon|icon|sprite|payment|badge|avatar|placeholder|loading|flag|trust|rating|star|pixel)/i;
const MEDIA_PATH = /(?:\.(?:jpe?g|png|webp|avif|mp4|webm)(?:$|[?#])|\/cdn\/shop\/|cdn\.shopify\.com|wp-content\/uploads)/i;

function normalizeText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function decodeHtml(value: string) {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('\\/', '/');
}

function publicUrl(value: string, base: string) {
  try {
    const url = new URL(decodeHtml(value), base);
    if (url.protocol !== 'https:' || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}

function canonical(value: string) {
  try { const url = new URL(value); return `${url.hostname.toLowerCase()}${url.pathname.replace(/_(?:[0-9]+x(?:[0-9]+)?|small|medium|large)(?=\.)/i, '')}`; } catch { return value; }
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || '');
}

export function extractPageMedia(html: string, pageUrl: string): MediaItem[] {
  const found: MediaItem[] = [];
  const add = (rawUrl: string, type: 'image' | 'video', caption: string) => {
    const url = publicUrl(rawUrl, pageUrl);
    if (!url || /%7Bwidth%7D|\{width\}|_(?:\d{1,3}x(?:@\d+x)?|small|medium)(?=\.)/i.test(url) || !MEDIA_PATH.test(url) || BLOCKED_MEDIA_WORDS.test(new URL(url).pathname)) return;
    found.push({ id: '', type, url, caption: normalizeText(caption, 180) || '项目官网产品与使用场景素材', sourceUrl: pageUrl, origin: type === 'video' ? 'official-site-video-discovery' : 'official-site-discovery' });
  };
  for (const match of html.matchAll(/<(img|video|source)\b[^>]*>/gi)) {
    const tag = match[0], name = match[1].toLowerCase();
    const caption = attribute(tag, 'alt') || attribute(tag, 'title');
    if (name === 'video') {
      add(attribute(tag, 'src'), 'video', caption || '项目官网演示视频');
      add(attribute(tag, 'poster'), 'image', caption || '项目官网视频封面');
      continue;
    }
    if (name === 'source') { add(attribute(tag, 'src'), /video|mp4|webm/i.test(attribute(tag, 'type') || attribute(tag, 'src')) ? 'video' : 'image', caption); continue; }
    const srcset = attribute(tag, 'srcset') || attribute(tag, 'data-srcset');
    const srcsetUrl = srcset.split(',').map(item => item.trim().split(/\s+/)[0]).filter(Boolean).at(-1) || '';
    add(srcsetUrl || attribute(tag, 'data-src') || attribute(tag, 'data-original') || attribute(tag, 'src'), 'image', caption);
  }
  const seen = new Set<string>();
  return found.filter(item => { const key = canonical(item.url); if (seen.has(key)) return false; seen.add(key); return true; });
}

async function visualQueries(snapshot: CaseSnapshot, env: Env) {
  const fallback = [snapshot.name.replace(/\[[^\]]+\]|\$[\d.,]+[KMB]?\/?\w*/gi, '').replace(/\b(?:how|our|we|to|on|starting|growing|built|update|year)\b/gi, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean);
  try {
    const result: any = await env.AI.run(env.SCRIPT_MODEL, {
      messages: [
        { role: 'system', content: '你是商业短视频素材编辑。根据案例生成3个英文视觉搜索短语，每个2到5个词，必须描述可拍摄的产品、用户动作或经营场景，不得包含营收数字。只返回JSON。' },
        { role: 'user', content: JSON.stringify({ name: snapshot.name, nameZh: snapshot.nameZh, summary: snapshot.summary, businessModel: snapshot.businessModel }) }
      ],
      response_format: { type: 'json_schema', json_schema: { type: 'object', properties: { queries: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } } }, required: ['queries'] } },
      max_tokens: 180, temperature: 0.2
    });
    const parsed = typeof result?.response === 'string' ? JSON.parse(result.response) : result?.response;
    const queries = Array.isArray(parsed?.queries) ? parsed.queries.map((item: unknown) => normalizeText(item, 60)).filter((item: string) => item.split(/\s+/).length >= 2) : [];
    return queries.length ? queries.slice(0, 3) : fallback;
  } catch { return fallback; }
}

async function openverseMedia(query: string): Promise<MediaItem[]> {
  try {
    const params = new URLSearchParams({ q: `"${query}"`, license_type: 'commercial', page_size: '8', mature: 'false' });
    const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: { 'User-Agent': 'AI-Shengyi-Video-Factory/0.3 (media enrichment)' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const payload: any = await response.json();
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
    return (Array.isArray(payload?.results) ? payload.results : []).filter((item: any) => {
      const text = `${item?.title || ''} ${(item?.tags || []).map((tag: any) => tag?.name || tag).join(' ')}`.toLowerCase();
      return Number(item?.width) >= 640 && Number(item?.height) >= 480 && tokens.filter(token => text.includes(token)).length >= Math.min(2, tokens.length);
    }).slice(0, 2).map((item: any) => ({
      id: '', type: 'image' as const, url: normalizeText(item.url || item.thumbnail, 2000),
      caption: `${normalizeText(item.title, 100) || query}（场景补充）`, sourceUrl: normalizeText(item.foreign_landing_url, 2000),
      origin: `openverse-${normalizeText(item.license, 20) || 'cc'}`, creator: normalizeText(item.creator, 100), license: normalizeText(item.license, 30)
    })).filter((item: MediaItem) => /^https:\/\//i.test(item.url));
  } catch { return []; }
}

export async function enrichSnapshotMedia(snapshot: CaseSnapshot, project: any, article: any, env: Env): Promise<CaseSnapshot> {
  const existing = [...snapshot.media];
  const pageUrls = [...new Set([
    project?.website, article?.project?.website,
    ...existing.filter(item => String(item.origin).startsWith('official')).map(item => item.sourceUrl)
  ].map(value => normalizeText(value, 2000)).filter(value => /^https:\/\//i.test(value)))].slice(0, 3);
  const discovered = (await Promise.all(pageUrls.map(async pageUrl => {
    try {
      const response = await fetch(pageUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 AI-Shengyi-Video-Factory/0.3' }, signal: AbortSignal.timeout(9000) });
      if (!response.ok || !/text\/html/i.test(response.headers.get('Content-Type') || '')) return [];
      return extractPageMedia((await response.text()).slice(0, 3_000_000), response.url);
    } catch { return []; }
  }))).flat();
  let merged = [...existing, ...discovered];
  const seen = new Set<string>();
  merged = merged.filter(item => { const key = canonical(item.url); if (!item.url || seen.has(key)) return false; seen.add(key); return true; });
  if (merged.length < 10) {
    const queries = await visualQueries(snapshot, env);
    const contextual = (await Promise.all(queries.map(openverseMedia))).flat();
    const additions = contextual.filter(item => { const key = canonical(item.url); if (!item.url || seen.has(key)) return false; seen.add(key); return true; });
    merged = [...merged, ...additions];
  }
  return { ...snapshot, media: merged.slice(0, 16).map((item, index) => ({ ...item, id: `media-${index + 1}` })) };
}

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const [manifestPath, jobDir] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const projectDir = join(jobDir, 'project');
const mediaDir = join(projectDir, 'assets', 'media');
const audioDir = join(projectDir, 'assets', 'audio');
const outputDir = join(jobDir, 'output');
for (const dir of [projectDir, mediaDir, audioDir, outputDir]) mkdirSync(dir, { recursive: true });

function status(stage, progress, extra = {}) {
  writeFileSync(join(jobDir, 'status.json'), JSON.stringify({ jobId: manifest.jobId, status: stage === 'failed' ? 'failed' : stage === 'succeeded' ? 'succeeded' : 'running', stage, progress, updatedAt: new Date().toISOString(), ...extra }, null, 2));
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\nSTDOUT:\n${result.stdout || ''}\nSTDERR:\n${result.stderr || ''}`);
  return result.stdout;
}
function probe(path) { return JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path])); }
function safe(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function logicDiagram(index, beat, timing) {
  const generic = manifest.contentSnapshot?.sourceType && manifest.contentSnapshot.sourceType !== 'ai-shengyi-case';
  const factLabels = (manifest.contentSnapshot?.facts || []).slice(index, index + 4).map(item => String(item.value || item.label).replace(/[，。！？；：].*$/u, '').slice(0, 12));
  const variants = [
    { type: 'flow', eyebrow: '商业闭环', nodes: ['真实痛点', '差异化产品', '完整体验', '成交复购'] },
    { type: 'funnel', eyebrow: '增长路径', nodes: ['内容触达', '渠道成交', '用户分享', '复购增长'] },
    { type: 'orbit', eyebrow: '落地方法', nodes: ['细分场景', '小批验证', '产品壁垒', '品牌溢价'] }
  ];
  const variant = variants[index % variants.length];
  if (generic) { variant.eyebrow = ['核心概念','因果关系','应用路径'][index % 3]; variant.nodes = [beat?.chapter, beat?.onScreen, ...factLabels].filter(Boolean).slice(0, 4); while (variant.nodes.length < 4) variant.nodes.push(`要点 ${variant.nodes.length + 1}`); }
  const nodes = variant.nodes.map((label, nodeIndex) => `<div class="logic-node logic-node-${nodeIndex + 1}" data-node="${nodeIndex}"><small>0${nodeIndex + 1}</small><strong>${safe(label)}</strong></div>`).join('');
  const paths = variant.type === 'flow' ? '<svg class="logic-links" viewBox="0 0 1000 900" aria-hidden="true"><path d="M500 188 C500 240 500 265 500 318"/><path d="M500 388 C500 440 500 465 500 518"/><path d="M500 588 C500 640 500 665 500 718"/></svg>' : '';
  const center = variant.type === 'orbit' ? `<div class="logic-center"><span>${generic ? '知识结构' : '商业系统'}</span><strong>${generic ? '理解与应用' : '可复制增长'}</strong></div>` : '';
  return `<div id="logic-${index}" class="shot logic-board logic-${variant.type} clip" ${timing} data-layout-allow-overflow data-diagram-type="${variant.type}"><div class="logic-grid"></div><div class="logic-eyebrow">${variant.eyebrow}</div><h2>${safe(beat?.onScreen || beat?.chapter)}</h2>${paths}${center}<div class="logic-nodes">${nodes}</div><div class="logic-note">${generic ? '从原文提炼，保持观点与来源一致' : '不是单点爆款，而是一条可以持续运转的商业链路'}</div></div>`;
}
function splitPhrases(text) {
  const clean = String(text).replace(/\.。/g, '。').replace(/。{2,}/g, '。').replace(/\s+/g, ' ').trim();
  const clauses = clean.split(/(?<=[，。！？；：])/u).map(item => item.trim()).filter(item => item && !/^[，。！？；：,.!?;:]+$/u.test(item));
  const result = []; let buffer = '';
  for (const clause of clauses) {
    if (!buffer) { buffer = clause; continue; }
    if (buffer.length < 13 && buffer.length + clause.length <= 30) buffer += clause;
    else { result.push(buffer); buffer = clause; }
  }
  if (buffer) result.push(buffer);
  return result.flatMap(piece => {
    if (piece.length <= 34) return [piece];
    const midpoint = Math.ceil(piece.length / 2);
    const comma = piece.indexOf('，', Math.max(8, midpoint - 8));
    const cut = comma > 0 && comma < piece.length - 5 ? comma + 1 : midpoint;
    return [piece.slice(0, cut), piece.slice(cut)].filter(item => item && !/^[，。！？；：,.!?;:]+$/u.test(item));
  });
}

async function download(item, index) {
  const fallbackExt = item.type === 'video' ? '.mp4' : '.jpg';
  const urlExt = extname(new URL(item.url).pathname).slice(0, 5);
  const file = join(mediaDir, `media-${String(index + 1).padStart(2, '0')}${urlExt || fallbackExt}`);
  const response = await fetch(item.url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 AI-Shengyi-Video-Factory' } });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 30_000 || bytes.byteLength > 80_000_000) throw new Error(`invalid size ${bytes.byteLength}`);
  writeFileSync(file, bytes);
  let finalFile = file; let data = probe(file); let stream = data.streams.find(entry => entry.codec_type === 'video');
  if (!stream || Number(stream.width) < 640 || Number(stream.height) < 480) throw new Error(`too small ${stream?.width}x${stream?.height}`);
  if (item.type === 'video' && Number(data.format?.duration || 0) < 14) {
    finalFile = join(mediaDir, `media-${String(index + 1).padStart(2, '0')}-loop.mp4`);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', file, '-t', '16', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalFile]);
    data = probe(finalFile); stream = data.streams.find(entry => entry.codec_type === 'video');
  } else if (item.type !== 'video') {
    const entropyText = run('identify', ['-format', '%[entropy]', `${file}[0]`]).trim();
    const entropy = Number(entropyText);
    if (Number.isFinite(entropy) && entropy < 0.10) throw new Error(`low entropy ${entropy}`);
  }
  return { ...item, local: `assets/media/${basename(finalFile)}`, hash: createHash('sha256').update(bytes).digest('hex'), width: Number(stream.width), height: Number(stream.height), duration: Number(data.format?.duration || 0) };
}

try {
  status('media-audit', 5);
  const accepted = [], rejected = [];
  for (const [index, item] of manifest.caseSnapshot.media.entries()) {
    try { accepted.push(await download(item, index)); } catch (error) { rejected.push({ id: item.id, url: item.url, reason: error.message }); }
  }
  if (new Set(accepted.map(item => item.hash)).size < manifest.quality.minUniqueMedia) throw new Error(`INSUFFICIENT_VALID_MEDIA:${accepted.length}`);

  status('voice', 18, { acceptedMedia: accepted.length, rejectedMedia: rejected.length });
  const phrases = [];
  for (const beat of manifest.script.beats) for (const text of splitPhrases(beat.narration)) phrases.push({ beatId: beat.id, chapter: beat.chapter, onScreen: beat.onScreen, text });
  const concatRows = []; let cursor = 0; const captions = [];
  for (const [index, phrase] of phrases.entries()) {
    const raw = join(audioDir, `phrase-${String(index + 1).padStart(3, '0')}.mp3`);
    const wav = join(audioDir, `phrase-${String(index + 1).padStart(3, '0')}.wav`);
    run('edge-tts', ['--voice', manifest.voice.voice, `--rate=${manifest.voice.rate}`, `--pitch=${manifest.voice.pitch}`, '--text', phrase.text, '--write-media', raw]);
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_silence=0.04:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=-42dB,areverse', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav]);
    const duration = Number(probe(wav).format.duration);
    captions.push({ ...phrase, start: cursor, duration }); concatRows.push(`file '${wav.replaceAll("'", "'\\''")}'`); cursor += duration;
    if (index < phrases.length - 1) {
      const silence = join(audioDir, `silence-${String(index + 1).padStart(3, '0')}.wav`);
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${manifest.voice.phrasePauseSeconds}`, '-c:a', 'pcm_s16le', silence]);
      concatRows.push(`file '${silence}'`); cursor += manifest.voice.phrasePauseSeconds;
    }
  }
  writeFileSync(join(audioDir, 'concat.txt'), concatRows.join('\n'));
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(audioDir, 'concat.txt'), '-af', `loudnorm=I=${manifest.quality.targetLufs}:LRA=7:TP=${manifest.quality.truePeak}`, '-c:a', 'libmp3lame', '-b:a', '160k', join(outputDir, 'voice.mp3')]);
  const totalDuration = Number(probe(join(outputDir, 'voice.mp3')).format.duration) + 0.4;
  writeFileSync(join(audioDir, 'voice.mp3'), readFileSync(join(outputDir, 'voice.mp3')));

  status('composition', 35, { duration: totalDuration, phraseCount: phrases.length });
  const mediaById = new Map(accepted.map(item => [item.id, item]));
  const sceneHtml = []; const captionHtml = []; const chapterHtml = []; const mediaUse = new Map(); const usedMediaHashes = new Set(); let previousHash = '';
  const diagramBeatIndexes = new Set(manifest.quality.minUniqueMedia === 0 ? manifest.script.beats.map((_, index) => index) : [2, 4, 6].filter(index => index < manifest.script.beats.length));
  const renderedDiagramBeats = new Set();
  captions.forEach((caption, index) => {
    const beat = manifest.script.beats.find(item => item.id === caption.beatId);
    const beatIndex = Math.max(0, manifest.script.beats.findIndex(item => item.id === caption.beatId));
    const timing = `data-start="${caption.start.toFixed(3)}" data-duration="${Math.max(caption.duration + manifest.voice.phrasePauseSeconds, .5).toFixed(3)}" data-track-index="${100 + index}"`;
    if (diagramBeatIndexes.has(beatIndex)) {
      if (!renderedDiagramBeats.has(beatIndex)) {
        const beatCaptions = captions.filter(item => item.beatId === caption.beatId);
        const diagramDuration = beatCaptions.reduce((sum, item) => sum + item.duration + manifest.voice.phrasePauseSeconds, 0);
        sceneHtml.push(logicDiagram(beatIndex, beat, `data-start="${caption.start.toFixed(3)}" data-duration="${diagramDuration.toFixed(3)}" data-track-index="${100 + index}"`));
        renderedDiagramBeats.add(beatIndex);
      }
    } else {
      const preferred = (beat?.mediaIds || []).map(id => mediaById.get(id)).filter(Boolean);
      const candidates = [...preferred, ...accepted.filter(item => !preferred.includes(item))];
      const ranked = [...new Map(candidates.map(item => [item.hash, item])).values()].sort((a,b) => (mediaUse.get(a.hash) || 0) - (mediaUse.get(b.hash) || 0));
      const item = ranked.find(candidate => candidate.hash !== previousHash) || ranked[0] || accepted[index % accepted.length];
      if (!item) {
        sceneHtml.push(logicDiagram(beatIndex, beat, timing));
        renderedDiagramBeats.add(beatIndex);
      } else {
        mediaUse.set(item.hash, (mediaUse.get(item.hash) || 0) + 1); usedMediaHashes.add(item.hash); previousHash = item.hash;
        const secondary = index % 4 === 2 && item.type === 'image' ? ranked.find(candidate => candidate.type === 'image' && candidate.hash !== item.hash) : null;
        if (secondary) { mediaUse.set(secondary.hash, (mediaUse.get(secondary.hash) || 0) + 1); usedMediaHashes.add(secondary.hash); }
        const captionLabel = /公开展示|真实项目素材|项目主图/u.test(item.caption || '') ? '' : item.caption;
        const trimStart = item.type === 'video' && item.duration > 6 ? ((mediaUse.get(item.hash) - 1) * 3.7) % Math.max(1, item.duration - 4) : 0;
        if (item.type === 'video') sceneHtml.push(`<video id="shot-${index}" class="shot clip" ${timing} data-layout-allow-overflow data-trim-start="${trimStart.toFixed(2)}" src="${safe(item.local)}" muted playsinline></video>`);
        else if (secondary) sceneHtml.push(`<div id="shot-${index}" class="shot shot-pair clip" ${timing} data-layout-allow-overflow><img src="${safe(item.local)}" alt="${safe(item.caption)}"><img src="${safe(secondary.local)}" alt="${safe(secondary.caption)}">${captionLabel ? `<span class="media-caption">${safe(captionLabel)}</span>` : ''}</div>`);
        else sceneHtml.push(`<div id="shot-${index}" class="shot clip" ${timing} data-layout-allow-overflow><img src="${safe(item.local)}" alt="${safe(item.caption)}">${captionLabel ? `<span class="media-caption">${safe(captionLabel)}</span>` : ''}</div>`);
      }
    }
    captionHtml.push(`<div id="caption-${index}" class="caption clip" data-start="${caption.start.toFixed(3)}" data-duration="${Math.max(caption.duration, .35).toFixed(3)}" data-track-index="${200 + index}">${safe(caption.text)}</div>`);
    if (index === 0 || captions[index - 1]?.beatId !== caption.beatId) chapterHtml.push(`<div id="chapter-${safe(caption.beatId)}" class="chapter clip" data-start="${caption.start.toFixed(3)}" data-duration="${captions.filter(x => x.beatId === caption.beatId).reduce((sum, x) => sum + x.duration + manifest.voice.phrasePauseSeconds, 0).toFixed(3)}" data-track-index="${300 + index}"><span>${safe(caption.chapter)}</span><strong>${safe(caption.onScreen)}</strong></div>`);
  });
  const html = `<!doctype html><html lang="zh-CN" data-resolution="portrait"><head><meta charset="UTF-8"><meta name="viewport" content="width=${manifest.quality.width},height=${manifest.quality.height}"><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script><style>
  @font-face{font-family:"Noto Sans CJK SC";src:local("Noto Sans CJK SC");font-style:normal;font-weight:100 900}@font-face{font-family:"Noto Serif CJK SC";src:local("Noto Serif CJK SC");font-style:normal;font-weight:100 900}*{box-sizing:border-box}html,body{margin:0;width:${manifest.quality.width}px;height:${manifest.quality.height}px;overflow:hidden;background:#f3f0e9}body{font-family:"Noto Sans CJK SC",sans-serif;color:#151515}#root{position:relative;width:${manifest.quality.width}px;height:${manifest.quality.height}px;overflow:hidden;background:linear-gradient(rgba(20,20,20,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(20,20,20,.025) 1px,transparent 1px),#f3f0e9;background-size:48px 48px}.head{position:absolute;z-index:30;inset:0 0 auto;height:250px;padding:38px 52px;background:#111;color:#fff}.brand{font-size:24px;letter-spacing:.08em;color:#ddd}.brand b{color:#ee6b20}.head h1{margin:20px 0 0;max-width:920px;font-family:"Noto Serif CJK SC",serif;font-size:58px;line-height:1.08;letter-spacing:-.035em}.head h1 em{color:#ee6b20;font-style:normal}.chapter{position:absolute;z-index:35;top:220px;left:38px;right:38px;height:82px;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-radius:17px;background:#fffdf8;border:1px solid #d7d1c7;box-shadow:0 12px 30px rgba(0,0,0,.12)}.chapter span{font-size:23px;color:#c35215}.chapter strong{max-width:760px;font-size:28px;text-align:right}.shot{position:absolute;z-index:5;left:38px;right:38px;top:320px;width:auto;height:calc(100% - 680px);overflow:hidden;border-radius:25px;background:#111;box-shadow:0 22px 55px rgba(0,0,0,.13);object-fit:cover}.shot img{width:100%;height:100%;object-fit:cover}.shot-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.shot-pair img{min-width:0;height:100%}.shot:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 72%,rgba(0,0,0,.66))}.media-caption{position:absolute;z-index:3;left:30px;right:30px;bottom:26px;color:#fff;font-size:22px;text-shadow:0 2px 8px #000}.logic-board{padding:54px;background:#121211;color:#f7f2e8}.logic-board:after{display:none}.logic-grid{position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:44px 44px}.logic-eyebrow{position:relative;color:#ef7a32;font-size:22px;font-weight:700;letter-spacing:.2em}.logic-board h2{position:relative;z-index:2;margin:18px 0 20px;max-width:820px;font-family:"Noto Serif CJK SC",serif;font-size:48px;line-height:1.25}.logic-nodes{position:absolute;z-index:3;inset:210px 60px 125px}.logic-node{position:absolute;display:flex;align-items:center;gap:20px;padding:24px 30px;border:1px solid rgba(255,255,255,.18);border-radius:20px;background:rgba(255,255,255,.08);box-shadow:0 20px 50px rgba(0,0,0,.2);will-change:transform,opacity}.logic-node small{color:#ef7a32;font-size:19px}.logic-node strong{font-size:31px}.logic-flow .logic-node{left:145px;right:145px;height:112px}.logic-flow .logic-node-1{top:0}.logic-flow .logic-node-2{top:200px}.logic-flow .logic-node-3{top:400px}.logic-flow .logic-node-4{top:600px}.logic-links{position:absolute;z-index:2;left:58px;right:58px;top:210px;width:calc(100% - 116px);height:900px;fill:none;stroke:#ef7a32;stroke-width:4;stroke-linecap:round}.logic-funnel .logic-node{left:20px;height:126px}.logic-funnel .logic-node-1{top:20px;right:20px}.logic-funnel .logic-node-2{top:205px;right:105px}.logic-funnel .logic-node-3{top:390px;right:190px}.logic-funnel .logic-node-4{top:575px;right:275px;background:#ef7a32;color:#111}.logic-orbit .logic-center{position:absolute;z-index:3;left:50%;top:53%;width:270px;height:270px;margin:-135px 0 0 -135px;border-radius:50%;display:grid;place-content:center;text-align:center;background:#ef7a32;color:#111;box-shadow:0 0 0 26px rgba(239,122,50,.12),0 0 0 70px rgba(239,122,50,.06)}.logic-center span{font-size:22px}.logic-center strong{margin-top:8px;font-size:30px}.logic-orbit .logic-node{left:50%;top:50%;width:265px;justify-content:center}.logic-note{position:absolute;z-index:3;left:60px;right:60px;bottom:45px;padding-top:22px;border-top:1px solid rgba(255,255,255,.15);color:#bcb6ac;font-size:21px}.caption{position:absolute;z-index:40;left:44px;right:44px;bottom:86px;height:244px;display:flex;align-items:center;padding:18px 16px;font-family:"Noto Serif CJK SC",serif;font-size:46px;font-weight:700;line-height:1.48}.footer{position:absolute;left:52px;right:52px;bottom:34px;display:flex;justify-content:space-between;color:#6d6d6d;font-size:18px}.progress{position:absolute;z-index:50;left:0;right:0;bottom:0;height:8px;background:#d7d1c7}.progress i{display:block;width:100%;height:100%;transform-origin:left;background:#ee6b20}
  </style></head><body><div id="root" data-composition-id="universal-video" data-width="${manifest.quality.width}" data-height="${manifest.quality.height}" data-start="0" data-duration="${totalDuration.toFixed(3)}"><header class="head"><div class="brand">AI <b>VIDEO STUDIO</b> · ${safe(manifest.options?.visualPreset || 'director')}</div><h1>${safe(manifest.script.headline)}</h1></header>${chapterHtml.join('')}${sceneHtml.join('')}${captionHtml.join('')}<footer class="footer"><span>AI 视频创作台 · HyperFrames</span><span>${safe(manifest.contentSnapshot?.title || manifest.caseSnapshot.nameZh)}</span></footer><div class="progress"><i></i></div><audio id="master-audio" src="assets/audio/voice.mp3" data-start="0" data-duration="${totalDuration.toFixed(3)}" data-track-index="20" data-volume="1"></audio></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo('.progress i',{scaleX:0},{scaleX:1,duration:${totalDuration.toFixed(3)},ease:'none'},0);document.querySelectorAll('.shot:not(.logic-board)').forEach((el,i)=>{const s=+el.dataset.start,d=+el.dataset.duration,media=el.matches('video')?[el]:[...el.querySelectorAll('img,video')];tl.fromTo(el,{opacity:0},{opacity:1,duration:.24,ease:'power1.inOut'},s);media.forEach((m,j)=>tl.fromTo(m,{scale:1.015,x:(i+j)%2?-10:10},{scale:1.075,x:0,duration:d,ease:'none'},s))});document.querySelectorAll('.logic-board').forEach((board,boardIndex)=>{const s=+board.dataset.start,d=+board.dataset.duration;tl.fromTo(board,{opacity:0},{opacity:1,duration:.24,ease:'power1.inOut'},s);board.querySelectorAll('.logic-node').forEach((node,nodeIndex)=>{if(board.dataset.diagramType==='orbit'){const points=[[-285,-250],[285,-250],[-285,255],[285,255]],point=points[nodeIndex];tl.fromTo(node,{xPercent:-50,yPercent:-50,x:0,y:0,scale:.55,opacity:0},{x:point[0],y:point[1],scale:1,opacity:1,duration:.9,ease:'power3.out'},s+.35+nodeIndex*.09)}else tl.fromTo(node,{scale:.88,y:24,opacity:0},{scale:1,y:0,opacity:1,duration:.62,ease:'power3.out'},s+.32+nodeIndex*.18)});board.querySelectorAll('.logic-links path').forEach((path,pathIndex)=>{const len=path.getTotalLength();path.style.strokeDasharray=String(len);tl.fromTo(path,{strokeDashoffset:len},{strokeDashoffset:0,duration:.62,ease:'power2.out'},s+.55+pathIndex*.34)});if(board.dataset.diagramType==='funnel')board.querySelectorAll('.logic-node').forEach((node,nodeIndex)=>tl.fromTo(node,{scaleX:.15},{scaleX:1,duration:.75,ease:'power2.out',immediateRender:false},s+.4+nodeIndex*.17));if(board.dataset.diagramType==='orbit')tl.fromTo(board.querySelector('.logic-center'),{scale:.72,opacity:0},{scale:1,opacity:1,duration:.7,ease:'back.out(1.7)'},s+.2)});document.querySelectorAll('.caption,.chapter').forEach(el=>tl.fromTo(el,{opacity:0,y:14},{opacity:1,y:0,duration:.18,ease:'power2.out'},+el.dataset.start));window.__timelines['universal-video']=tl;<\/script></body></html>`;
  writeFileSync(join(projectDir, 'index.html'), html);
  writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { assets: 'assets' }, media: { autoProxy: true }, authoringSkill: 'general-video' }, null, 2));
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { check: 'hyperframes check', render: 'hyperframes render' }, dependencies: { hyperframes: '0.7.87' } }, null, 2));

  status('check', 50);
  const hyperframes = '/app/node_modules/.bin/hyperframes';
  const browserPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.HYPERFRAMES_BROWSER_PATH || '/usr/bin/chromium';
  const browserEnv = { ...process.env, HOME: '/work', PUPPETEER_EXECUTABLE_PATH: browserPath, HYPERFRAMES_BROWSER_PATH: browserPath };
  const checkLog = run(hyperframes, ['check', '--snapshots', '--samples', '13', '--at-transitions', '--timeout', '30000'], { cwd: projectDir, env: browserEnv });
  status('render', 62);
  // Keep the full 1080x1920 canvas and 30 fps, but use HyperFrames' cloud-safe
  // encoder preset. This prevents long portrait renders from starving the
  // container health endpoint; a separate archival preset can be added later.
  const renderedVideo = join(outputDir, 'video-rendered.mp4');
  const renderLog = run(hyperframes, ['render', '--quality', 'draft', '--output', renderedVideo], { cwd: projectDir, env: browserEnv });
  // Re-encode the audio explicitly after render. Besides normalizing social-video
  // loudness, this guarantees a conventional AAC-LC track in every download.
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', renderedVideo, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-af', `loudnorm=I=${manifest.quality.targetLufs}:LRA=7:TP=${manifest.quality.truePeak}`, '-metadata:s:a:0', 'language=zho', '-movflags', '+faststart', join(outputDir, 'video.mp4')]);

  status('technical-qa', 88);
  const videoInfo = probe(join(outputDir, 'video.mp4'));
  const videoStream = videoInfo.streams.find(item => item.codec_type === 'video'); const audioStream = videoInfo.streams.find(item => item.codec_type === 'audio');
  const blackLog = spawnSync('ffmpeg', ['-hide_banner', '-i', join(outputDir, 'video.mp4'), '-vf', 'blackdetect=d=0.35:pix_th=0.03', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).stderr || '';
  const blackFrames = (blackLog.match(/black_start:/g) || []).length;
  const loudLog = spawnSync('ffmpeg', ['-hide_banner', '-i', join(outputDir, 'video.mp4'), '-map', '0:a:0', '-af', `loudnorm=I=${manifest.quality.targetLufs}:LRA=7:TP=${manifest.quality.truePeak}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).stderr || '';
  const loudMatch = loudLog.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/); const loudness = loudMatch ? JSON.parse(loudMatch[0]) : {};
  const technicalChecks = {
    resolution: Number(videoStream?.width) === manifest.quality.width && Number(videoStream?.height) === manifest.quality.height,
    videoCodec: videoStream?.codec_name === 'h264', audioCodec: audioStream?.codec_name === 'aac',
    frameRate: String(videoStream?.r_frame_rate) === '30/1', audio: Boolean(audioStream), duration: Math.abs(Number(videoInfo.format?.duration) - totalDuration) < 0.5,
    durationRange: totalDuration >= manifest.quality.minDurationSeconds && totalDuration <= manifest.quality.maxDurationSeconds,
    media: new Set(accepted.map(item => item.hash)).size >= manifest.quality.minUniqueMedia, sceneDiversity: usedMediaHashes.size >= manifest.quality.minUniqueMedia, blackFrames: blackFrames === 0,
    loudness: Math.abs(Number(loudness.input_i || -99) - manifest.quality.targetLufs) <= 1.5, truePeak: Number(loudness.input_tp || 99) <= manifest.quality.truePeak + 0.5,
    diagrams: renderedDiagramBeats.size >= Math.min(3, Math.floor(manifest.script.beats.length / 2))
  };
  const passedCount = Object.values(technicalChecks).filter(Boolean).length;
  const qa = { schemaVersion: '1.0', passed: passedCount === Object.keys(technicalChecks).length, score: Math.round(passedCount / Object.keys(technicalChecks).length * 1000) / 10, technicalChecks, media: { accepted: accepted.map(({ id, url, caption, width, height, duration }) => ({ id, url, caption, width, height, duration })), rejected }, video: videoInfo, loudness, captions: { count: captions.length, expectedText: phrases.map(item => item.text).join('') }, logs: { check: checkLog.slice(-4000), render: renderLog.slice(-4000) } };
  writeFileSync(join(outputDir, 'qa.json'), JSON.stringify(qa, null, 2));
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', Math.max(1, totalDuration * .14).toFixed(2), '-i', join(outputDir, 'video.mp4'), '-frames:v', '1', '-q:v', '2', join(outputDir, 'poster.jpg')]);
  const times = [0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map(value => Math.max(.5, totalDuration * value));
  const inputs = []; times.forEach(value => inputs.push('-ss', value.toFixed(2), '-i', join(outputDir, 'video.mp4')));
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${times.map((_,i)=>`[${i}:v]scale=270:480[v${i}]`).join(';')};[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|270_0|540_0|0_480|270_480|540_480[out]`, '-map', '[out]', '-frames:v', '1', '-q:v', '3', join(outputDir, 'contact-sheet.jpg')]);
  if (!qa.passed) throw new Error(`TECHNICAL_QA_FAILED:${qa.score}`);
  status('succeeded', 100, { duration: Number(videoInfo.format.duration), score: qa.score, acceptedMedia: accepted.length, finishedAt: new Date().toISOString() });
} catch (error) {
  status('failed', 100, { error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
  console.error(error); process.exit(1);
}

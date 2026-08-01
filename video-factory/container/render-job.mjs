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
  const data = probe(file); const stream = data.streams.find(entry => entry.codec_type === 'video');
  if (!stream || Number(stream.width) < 640 || Number(stream.height) < 480) throw new Error(`too small ${stream?.width}x${stream?.height}`);
  if (item.type !== 'video') {
    const entropyText = run('identify', ['-format', '%[entropy]', `${file}[0]`]).trim();
    const entropy = Number(entropyText);
    if (Number.isFinite(entropy) && entropy < 0.10) throw new Error(`low entropy ${entropy}`);
  }
  return { ...item, local: `assets/media/${basename(file)}`, hash: createHash('sha256').update(bytes).digest('hex'), width: Number(stream.width), height: Number(stream.height), duration: Number(data.format?.duration || 0) };
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
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav]);
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
  const sceneHtml = []; const captionHtml = []; const chapterHtml = [];
  captions.forEach((caption, index) => {
    const beat = manifest.script.beats.find(item => item.id === caption.beatId);
    const candidates = (beat?.mediaIds || []).map(id => mediaById.get(id)).filter(Boolean);
    const item = candidates[index % Math.max(1, candidates.length)] || accepted[index % accepted.length];
    const timing = `data-start="${caption.start.toFixed(3)}" data-duration="${Math.max(caption.duration + manifest.voice.phrasePauseSeconds, 1).toFixed(3)}" data-track-index="${index % 2 ? 5 : 2}"`;
    const captionLabel = /公开展示|真实项目素材|项目主图/u.test(item.caption || '') ? '' : item.caption;
    if (item.type === 'video') sceneHtml.push(`<video id="shot-${index}" class="shot clip" ${timing} data-layout-allow-overflow src="${safe(item.local)}" muted playsinline></video>`);
    else sceneHtml.push(`<div id="shot-${index}" class="shot clip" ${timing} data-layout-allow-overflow><img src="${safe(item.local)}" alt="${safe(item.caption)}">${captionLabel ? `<span class="media-caption">${safe(captionLabel)}</span>` : ''}</div>`);
    captionHtml.push(`<div id="caption-${index}" class="caption clip" data-start="${caption.start.toFixed(3)}" data-duration="${Math.max(caption.duration, .5).toFixed(3)}" data-track-index="9">${safe(caption.text)}</div>`);
    if (index === 0 || captions[index - 1]?.beatId !== caption.beatId) chapterHtml.push(`<div id="chapter-${safe(caption.beatId)}" class="chapter clip" data-start="${caption.start.toFixed(3)}" data-duration="${captions.filter(x => x.beatId === caption.beatId).reduce((sum, x) => sum + x.duration + manifest.voice.phrasePauseSeconds, 0).toFixed(3)}" data-track-index="12"><span>${safe(caption.chapter)}</span><strong>${safe(caption.onScreen)}</strong></div>`);
  });
  const html = `<!doctype html><html lang="zh-CN" data-resolution="portrait"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080,height=1920"><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script><style>
  @font-face{font-family:"Noto Sans CJK SC";src:local("Noto Sans CJK SC");font-style:normal;font-weight:100 900}@font-face{font-family:"Noto Serif CJK SC";src:local("Noto Serif CJK SC");font-style:normal;font-weight:100 900}*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#f3f0e9}body{font-family:"Noto Sans CJK SC",sans-serif;color:#151515}#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:linear-gradient(rgba(20,20,20,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(20,20,20,.025) 1px,transparent 1px),#f3f0e9;background-size:48px 48px}.head{position:absolute;z-index:30;inset:0 0 auto;height:250px;padding:38px 52px;background:#111;color:#fff}.brand{font-size:24px;letter-spacing:.08em;color:#ddd}.brand b{color:#ee6b20}.head h1{margin:20px 0 0;max-width:920px;font-family:"Noto Serif CJK SC",serif;font-size:58px;line-height:1.08;letter-spacing:-.035em}.head h1 em{color:#ee6b20;font-style:normal}.chapter-zone{position:absolute;z-index:35;top:220px;left:38px;right:38px;height:82px}.chapter{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-radius:17px;background:#fffdf8;border:1px solid #d7d1c7;box-shadow:0 12px 30px rgba(0,0,0,.12)}.chapter span{font-size:23px;color:#c35215}.chapter strong{max-width:760px;font-size:28px;text-align:right}.stage{position:absolute;z-index:5;left:38px;right:38px;top:320px;height:1240px;border-radius:25px;overflow:hidden;background:#111;box-shadow:0 22px 55px rgba(0,0,0,.13)}.shot{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#111;object-fit:cover}.shot img{width:100%;height:100%;object-fit:cover}.shot:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 72%,rgba(0,0,0,.66))}.media-caption{position:absolute;z-index:3;left:30px;right:30px;bottom:26px;color:#fff;font-size:22px;text-shadow:0 2px 8px #000}.caption-zone{position:absolute;z-index:40;left:44px;right:44px;top:1590px;height:244px}.caption{position:absolute;inset:0;display:flex;align-items:center;padding:18px 16px;font-family:"Noto Serif CJK SC",serif;font-size:46px;font-weight:700;line-height:1.48}.footer{position:absolute;left:52px;right:52px;bottom:34px;display:flex;justify-content:space-between;color:#6d6d6d;font-size:18px}.progress{position:absolute;z-index:50;left:0;right:0;bottom:0;height:8px;background:#d7d1c7}.progress i{display:block;width:100%;height:100%;transform-origin:left;background:#ee6b20}
  </style></head><body><div id="root" data-composition-id="ai-shengyi-editorial" data-width="1080" data-height="1920" data-start="0" data-duration="${totalDuration.toFixed(3)}"><header class="head"><div class="brand">💡 AI<b>生意经</b> · 真实案例</div><h1>${safe(manifest.script.headline).replace(safe(manifest.caseSnapshot.revenue), `<em>${safe(manifest.caseSnapshot.revenue)}</em>`)}</h1></header><section class="chapter-zone">${chapterHtml.join('')}</section><main class="stage">${sceneHtml.join('')}</main><section class="caption-zone" data-layout-allow-caption-zone>${captionHtml.join('')}</section><footer class="footer"><span>AI生意经 · 每天拆解一个真实生意</span><span>${safe(manifest.caseSnapshot.nameZh)}</span></footer><div class="progress"><i></i></div><audio id="master-audio" src="assets/audio/voice.mp3" data-start="0" data-duration="${totalDuration.toFixed(3)}" data-track-index="20" data-volume="1"></audio></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo('.progress i',{scaleX:0},{scaleX:1,duration:${totalDuration.toFixed(3)},ease:'none'},0);document.querySelectorAll('.shot').forEach((el,i)=>{const s=+el.dataset.start,d=+el.dataset.duration,m=el.matches('img,video')?el:el.querySelector('img,video');tl.fromTo(el,{opacity:0},{opacity:1,duration:.24,ease:'power1.inOut'},s);if(m)tl.fromTo(m,{scale:1.02,x:i%2?-8:8},{scale:1.08,x:0,duration:d,ease:'none'},s)});document.querySelectorAll('.caption,.chapter').forEach(el=>tl.fromTo(el,{opacity:0,y:14},{opacity:1,y:0,duration:.18,ease:'power2.out'},+el.dataset.start));window.__timelines['ai-shengyi-editorial']=tl;<\/script></body></html>`;
  writeFileSync(join(projectDir, 'index.html'), html);
  writeFileSync(join(projectDir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { assets: 'assets' }, media: { autoProxy: true }, authoringSkill: 'general-video' }, null, 2));
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { check: 'hyperframes check', render: 'hyperframes render' }, dependencies: { hyperframes: '0.7.87' } }, null, 2));

  status('check', 50);
  const hyperframes = '/app/node_modules/.bin/hyperframes';
  const browserEnv = { ...process.env, HOME: '/work', PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium', HYPERFRAMES_BROWSER_PATH: '/usr/bin/chromium' };
  const checkLog = run(hyperframes, ['check', '--snapshots', '--samples', '13', '--at-transitions', '--timeout', '30000'], { cwd: projectDir, env: browserEnv });
  status('render', 62);
  // Standard uses CRF 18 with the medium H.264 preset: visually delivery-ready,
  // while avoiding the disproportionate CPU and restart risk of the slow preset.
  const renderLog = run(hyperframes, ['render', '--quality', 'standard', '--output', join(outputDir, 'video.mp4')], { cwd: projectDir, env: browserEnv });

  status('technical-qa', 88);
  const videoInfo = probe(join(outputDir, 'video.mp4'));
  const videoStream = videoInfo.streams.find(item => item.codec_type === 'video'); const audioStream = videoInfo.streams.find(item => item.codec_type === 'audio');
  const blackLog = spawnSync('ffmpeg', ['-hide_banner', '-i', join(outputDir, 'video.mp4'), '-vf', 'blackdetect=d=0.35:pix_th=0.03', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).stderr || '';
  const blackFrames = (blackLog.match(/black_start:/g) || []).length;
  const loudLog = spawnSync('ffmpeg', ['-hide_banner', '-i', join(outputDir, 'voice.mp3'), '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).stderr || '';
  const loudMatch = loudLog.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/); const loudness = loudMatch ? JSON.parse(loudMatch[0]) : {};
  const technicalChecks = {
    resolution: Number(videoStream?.width) === 1080 && Number(videoStream?.height) === 1920,
    videoCodec: videoStream?.codec_name === 'h264', audioCodec: audioStream?.codec_name === 'aac',
    frameRate: String(videoStream?.r_frame_rate) === '30/1', audio: Boolean(audioStream), duration: Math.abs(Number(videoInfo.format?.duration) - totalDuration) < 0.5,
    durationRange: totalDuration >= manifest.quality.minDurationSeconds && totalDuration <= manifest.quality.maxDurationSeconds,
    media: new Set(accepted.map(item => item.hash)).size >= manifest.quality.minUniqueMedia, blackFrames: blackFrames === 0,
    loudness: Math.abs(Number(loudness.input_i || -99) - manifest.quality.targetLufs) <= 1.5, truePeak: Number(loudness.input_tp || 99) <= manifest.quality.truePeak + 0.5
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

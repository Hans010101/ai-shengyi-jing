# AI 视频创作台

这是从“AI生意经视频工厂”演进而来的独立中文 AI 视频生产工作流。书籍摘录、文章、自由主题与 AI 生意经案例都是数据化来源；案例库不再是硬编码核心。完整架构、数据模型、限制、成本和部署说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 架构

- Workers + 静态后台：生产控制台与API
- Workflows：长任务、步骤状态和自动重试
- Workers AI：脚本生成、FLUX 漫画分镜与 Whisper 反向校对
- DeepSeek：脚本生成的备用通道
- Containers：HyperFrames、Chromium、FFmpeg和Edge Neural TTS
- R2：案例快照、脚本、音频、MP4、联系表和质检报告的短期中转缓存
- D1：任务、事件和模板版本
- 每日计划任务：自动挑选2个尚未生产、拥有3项以上素材的案例

二进制成片不进入Git仓库。云端成片默认在R2保留3天，用户可从生产台下载到本机，确认保存后立即点击“释放云端缓存”；每日计划任务也会自动清理到期文件。以每天2条、每条约100–150MB估算，3天滚动缓存通常低于1GB。

案例库直接读取`data/case_articles/{caseId}.json`，3646个案例均使用各自的详情事实与3–5份素材，不再只依赖5个正式样例组成的汇总文件。

## 质量门

1. 商业路线至少 3 项不同原始素材；漫画路线要求每个叙事段落有一幅独立生成且通过尺寸、解码和低熵检查的插画。
2. 脚本的每段事实绑定案例`evidenceIds`，素材绑定`mediaIds`。
3. 中文旁白按语义短句生成，字幕直接使用最终配音短句。
4. 1080×1920、30fps、H.264/AAC、含有效音轨。
5. 目标 -14 LUFS、True Peak 不高于 -1.5 dBTP。
6. 无连续黑帧，成片时长与音频一致。
7. Whisper反向转写与脚本文字达到阈值；不通过自动降速重做一次。

生产台默认支持一次导入 1–20 份 DOCX、Markdown 或 TXT 口播文案，一份文案对应一条任务。原稿路线不调用大模型改写文本，只做分段、分镜、配音和字幕。旧版 `.doc` 必须先另存为 `.docx`；单份直稿限制 100–760 字，对应约 30–180 秒。生产进度、失败重试、成片预览、本地下载和质检报告均继续保留。自动批量大小由`AUTO_BATCH_SIZE`配置，设为`0`即可暂停每日案例生产；缓存天数由`ARTIFACT_RETENTION_DAYS`配置。

三条路线由 `src/presets.ts` 和 D1 `template_versions` 同时版本化：`comic-engraving-v1`、`knowledge-director-v1`、`ai-shengyi-case-v1`。后端会重新解析并锁定视觉、品牌和媒体策略，前端不能把一种路线的参数注入另一种路线。

## 本地开发

需要Node.js 22+、Docker和Cloudflare账号。

```bash
npm install
npm test
npm run typecheck
npm run db:local
npm run dev
```

## 部署

独立生产台前端部署在 Cloudflare Pages：

- 固定入口：`https://ai-shengyi-video-studio.pages.dev`
- 生产 API：`https://ai-shengyi-video-factory.hans-pan007.workers.dev`
- GitHub 主分支更新 `video-factory/public/**` 后，由 `deploy-video-studio.yml` 自动发布前端

前端与生产后端分开发布，因此 R2 或容器尚未激活时，产品入口仍能稳定访问，并显示明确的后端状态。

首次部署前设置两个密钥：

```bash
npx wrangler secret put FACTORY_ADMIN_TOKEN
npx wrangler secret put INTERNAL_RENDER_TOKEN
npx wrangler secret put DEEPSEEK_API_KEY  # 可选
npm run deploy
npm run db:remote
```

生产后台对外可访问，但生产 API 仍然受保护。管理员自动化可携带 `X-Factory-Key`；网页端默认使用一次性设备激活码换取 30 天 HMAC 签名会话，长期生产密钥不会进入浏览器。激活码只在 D1 保存 SHA-256 摘要、使用一次后失效：

```bash
# 先生成高熵码，在本地计算 SHA-256；只把摘要、用途和过期时间写入 activation_codes。
npx wrangler d1 execute VIDEO_DB --remote --command \
  "INSERT INTO activation_codes(code_hash,label,expires_at,created_at) VALUES('<sha256>','owner-device','<expiry>','<now>')"
```

直接双击 `public/index.html` 只用于界面预览；案例搜索、设备激活和生产请求必须从固定 HTTPS 入口发起。不要为了支持 `file://` 而放宽 Worker CORS。

# AI 视频创作台：生产架构

## 产品边界

这是独立的通用中文视频生产工作流。AI 生意经现在是 `ai-shengyi-case` 来源连接器与 `ai-shengyi-case-v1` 模板，不再是核心数据模型。

信息架构：新建视频（内容导入 + 导演设定）、项目/版本、脚本与节奏、分镜/素材、声音与音乐、预览/渲染、任务与成片、模板/品牌预设、设置。当前 UI 已覆盖新建、来源、导演参数、任务阶段、质检、下载；脚本和分镜的逐项人工编辑属于下一增量，底层已由 `project_versions` 解耦。

## 标准生产管线

`解析 → 事实/主题提炼 → 脚本 → 节奏/timestamp → 分镜 → 素材审计/生成 → 配音 → 字幕对齐 → BGM/SFX → HyperFrames → 质量检查 → 自动修复一次 → Cloudflare Container 渲染 → R2 → 下载/TTL 清理`

- 编排：Cloudflare Workflows，步骤可重试且有事件记录。
- AI：非直稿脚本优先 Workers AI `@cf/meta/llama-3.1-8b-instruct-fast`；结构或额度失败后使用 DeepSeek；再次失败使用有来源约束的确定性脚本。直稿用 `direct-script-v1` 原字保真切分，不改写。漫画分镜用 Workers AI `@cf/black-forest-labs/flux-1-schnell`，每个叙事段落单独生成并冻结到 R2。ASR 用 `@cf/openai/whisper-large-v3-turbo`。
- 渲染：Cloudflare Containers 内运行 Edge Neural TTS、Chromium、FFmpeg、HyperFrames。通用知识输入不依赖临时图库，使用数据化知识图解；案例/真实混剪仍要求至少 3 份有效媒体。
- 存储：D1 保存项目、版本、任务与事件；R2 只保存中间产物和成片。默认 TTL 3 天。删除项目记录和释放成片是不同操作，避免 TTL 误删仍需保留的项目定义。

## 数据模型

- `projects`：用户意图与当前配置。
- `project_versions`：内容快照、脚本、分镜的不可变版本引用。
- `jobs`：一次生产尝试，含 source、options、质量状态和 R2 key。
- `job_events`：阶段日志。
- `template_versions`：数据化、版本化的生产路线；视觉、品牌、媒体策略与允许来源不可跨路线覆盖。
- R2 `jobs/{jobId}/attempt-{n}/...`：manifest、音频、MP4、封面、联系表、QA。

## 安全与成本

- 所有生产 API 需要鉴权：自动化使用恒定时间校验的 `X-Factory-Key`；网页端用一次性激活码兑换 30 天 HMAC 签名 Bearer 会话。D1 只保存激活码 SHA-256 摘要，激活码原文与长期密钥均不进入日志或 URL。
- 通用内容最多 16,000 字；直稿每份 100–760 字（约 30–180 秒）、每批 1–20 份，案例批量最多 50；服务端重新校验来源与生产路线兼容性。
- URL 导入只允许公开 HTTP(S) HTML，拒绝凭据、localhost、私网、link-local，禁自动重定向，10 秒超时，最大读取 1 MB，降低 SSRF 风险。
- DOCX/Markdown/TXT 在浏览器本地解析，文案原文不上传到第三方解析服务；旧版 `.doc` 明确要求另存为 `.docx`。PDF/EPUB 暂不接受，建议先整理为 DOCX/Markdown。
- 低成本默认：Workers AI、D1、R2 短暂缓存；容器是主要可变成本，应通过并发、每日预算和 30–60 秒默认时长控制。

## 环境变量与 Cloudflare 资源

密钥：`FACTORY_ADMIN_TOKEN`、`INTERNAL_RENDER_TOKEN`、可选 `DEEPSEEK_API_KEY`、可选 `PEXELS_API_KEY`。绑定：`AI`、`VIDEO_DB`、`VIDEO_BUCKET`、`VIDEO_WORKFLOW`、`VIDEO_RENDERER`、`ASSETS`。非密钥参数见 `wrangler.jsonc`。

## 已知真实限制

- 当前容器的声音主轨与字幕为真实产物，但 BGM/SFX 自动选择和真正的 side-chain ducking 尚未接入媒体目录；UI 选项已经进入 manifest，不能据此宣称混音已完成。
- `comic-engraving-v1` 已有独立的 Workers AI 插画、木刻画面、黄色字幕、慢推拉和路线专属质量门；`sand-art / scenery / satisfying` 尚未作为可选路线暴露，避免假选项。
- PDF/EPUB 尚未接入；DOCX、Markdown、TXT 已真实可用，旧版 `.doc` 需另存。
- 文章抓取不绕过登录、付费墙或 robots 限制。
- 书籍内容版权由上传者确认；输出质量报告保留素材来源字段，但没有自动法律结论。

## 部署与运营

依次运行 `npm test`、`npm run typecheck`、`npm run db:remote`、`npm run deploy`。Pages 前端由 GitHub Actions `deploy-video-studio.yml` 发布到固定地址。运营首周建议：默认 60 秒知识图解；每日人工抽检 10 条；跟踪每阶段失败率、容器分钟数、Workers AI token、R2 占用和下载率；在接入 BGM 前不要把“自动配乐”作为对外承诺。

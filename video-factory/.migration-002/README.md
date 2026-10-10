# 002 正式部署与 007 退役审计

002 账号已承接 Studio、Worker、D1、Workflow、Workers AI、R2、Durable Object 和 Container。本文记录只读运行验收、历史 R2 边界，以及删除 007 账号前仍需处理的依赖。

## 交接坐标

- Studio 源目录：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/public`
- Studio Pages 目标：账号 002 / 项目 `ai-shengyi-video-studio`；生成域名 `ai-shengyi-video-studio-5dw.pages.dev`；GitHub secret `VIDEO_STUDIO_CLOUDFLARE_API_TOKEN`
- 案例与素材数据源：账号 002 / `https://ai-shengyi-jing-etz.pages.dev/data/`，完整与 API-only 配置保持一致
- Worker/Container 配置：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/wrangler.jsonc`
- API-only 降级配置：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/wrangler.api.jsonc`
- 日常发布入口：GitHub Actions `deploy-video-studio.yml` 与 `deploy-video-factory.yml`；两者均固定使用 002 专用 token。
- `.migration-002/` 下的本地脚本与 dry-run 目录仅保留为历史迁移材料，不是日常发布入口，也未纳入 Git。

## 正式运行验收（2026-10-10）

- Worker `ai-shengyi-video-factory` 最新 CI Version ID：`10458053-0b31-4c44-ba4b-e2dcfb9a4bca`；`/` 与 `/api/health` 均返回 200，未带凭据访问 `/api/renderer/health` 返回 401。
- 使用现有 `FACTORY_ADMIN_TOKEN` 只读访问 `/api/renderer/health` 返回 200，renderer 返回 `ok: true`、`service: video-renderer`、`activeJobs: 0`。
- Container application ID：`a0352c7a-9c23-4517-ab53-5df810b794d3`；Durable Object namespace：`210f980342744814a916f436ee8d392e`；最大实例数为 3。
- 最新 CI 镜像 digest：`sha256:789bd0a2d8d67d3568287ad1ce884aa69a0d02f35b8f84cc26abc02555498818`。
- 最终 Worker 保留 Assets、3 个 secret，并已绑定 Workers AI、D1、R2 `VIDEO_BUCKET`、含 Container metadata 的 `VIDEO_RENDERER` Durable Object 和 `VIDEO_WORKFLOW`；`RENDERER_ENABLED=true`。
- Workflow instance 列表为 0；唯一 schedule 是 R2 过期产物清理 `15 1 * * *`，没有每日 DeepSeek 或自动视频生成任务。
- Container 的 `Dockerfile`、`entrypoint.sh`、`server.mjs`、`render-job.mjs`、`package.json` 共 5 个源文件哈希与推送 context 一致。
- 此处的基础 renderer 验收只做健康读取；真实固定 composition 与 R2 闭环见下一节。两轮都没有调用 Workers AI 或 DeepSeek，也没有写入业务 D1。

证据位于迁移证据目录：

- `video-final-deploy-002-20261010.json`
- `video-final-settings-002-20261010.json`
- `video-final-schedules-002-20261010.json`
- `video-final-runtime-checks-002-20261010.json`
- `video-container-created-002-20261010.json`
- `video-container-source-hashes-002-20261010.json`
- `video-renderer-health-002-20261010.json`

## 增量验收：真实渲染与 R2 闭环（2026-10-10）

本轮目标是使用一条明确标注为迁移验收的极短内部任务，验证 002 Container 渲染、R2 写入、Worker 取回和测试资源清理；约束是不调用任何可能产生费用的模型、不向外部渠道发布，也不改动或恢复 007 资源。

### 已完成的只读核对

- 完整配置和 API-only 配置的 `account_id` 均为 002（`a828bebda1f352216c7d7da425bad17a`），D1 均为 `4207e0bb-f795-45b3-bd7f-195b08c2865d`，R2 绑定均为 `VIDEO_BUCKET -> ai-shengyi-video-factory`；Worker 源码、migrations、测试与两份 Wrangler 配置没有 007 账号 ID 或跨账号 R2 endpoint。
- 新任务的所有文件引用都是当前 `VIDEO_BUCKET` 下的相对 key：`jobs/{jobId}/content-snapshot.json`、`script.json`、`attempt-{n}/...` 与最终 `video.mp4`、`voice.mp3`、海报、联系表和 QA。下载接口先查当前 D1 任务记录，再从当前 R2 binding 读取；不接受任务文件中自带的 bucket 或账号地址。
- 渲染实现仍是既有链路：Workflow 将 manifest 提交给 002 的 `VIDEO_RENDERER` Durable Object/Container，Container 使用固定的 HyperFrames `0.7.87` 生成画面、`edge-tts` 生成中文口播，并由 FFmpeg 完成响度和编码检查；没有新建第二套渲染框架。
- 对无外部素材的知识类短任务，现有 manifest 会把 `minUniqueMedia` 设为 0，并使用内置知识图解画面。媒体机会扫描结论是：本次验收无需第三方图片、视频、BGM 或版权素材，现成文字和内置图解足以覆盖渲染验证。
- R2 取回代码具备 HEAD、完整 GET 和 Range GET，删除接口会枚举并删除 `jobs/{jobId}/` 前缀后再删除 D1 任务与事件；这些是代码合同核对，不等同于本轮已产生并下载了一份新文件。

### 直接渲染入口与执行结果

进一步检查确认，Container 已有足够的内部接口：`POST /jobs` 接收固定 manifest，`GET /jobs/{jobId}` 查询状态，`GET /jobs/{jobId}/artifacts/video.mp4` 取回成片。它只校验 `jobId` 和非空 `script.beats`，不会调用 Workers AI 或 DeepSeek；因此无需给正式产品新增“验收模式”，也无需经过会自动回退 DeepSeek 的业务建单入口。一个临时 Worker 只要外部绑定正式 `VideoRenderer` Durable Object 和现有 R2，就能用唯一 DO 名称、唯一 `migration-acceptance/{runId}/video.mp4` key 完成固定单分镜渲染、R2 写入、读回哈希校验、精确删除和 `renderer.stop()`，正式 Worker 可以保持原样。

2026-10-10 已在账号 002 真实执行上述隔离方案，run ID 为 `20261010T021127Z-07b69eea`。固定 composition 通过现有 Container 和 Edge TTS 完成，状态 `succeeded`、进度 100%；成片时长 8.683 秒、大小 638,545 bytes。产物写入唯一测试 R2 key 后成功读回，写入与读回 SHA-256 均为 `7ccb83aa5064aef9a9171af0f2e38721e49ed7590a2a696101f73b37d6b81990`。

唯一测试 R2 key 已精确删除并经 HEAD 确认为不存在，测试 renderer 的 `stop()` 调用成功。临时 Worker 的 CLI 删除命令返回非零，但随后两次通过 002 Cloudflare API 查询该脚本均为不存在，并确认账号内没有任何 `accept-002-*` 临时 Worker；脱敏证据保留了 `originalCliDeleteReportedFailure` 原始异常，同时按 API 最终状态记录 `cleanup.ok=true`。默认 Wrangler 当前也已切换并核对为账号 002。

证据文件：`/Users/hans.pan/Library/Application Support/Dianjinshou/migration-002-20261009/video-render-002-acceptance-20261010T021127Z-07b69eea.json`。

仓库内未纳入 Git 的历史验收脚本 `accept-002.sh` 仍不能满足本轮合同：它检查旧 Studio 域名，调用会自动回退 DeepSeek 的业务建单入口，并且成功后只验证视频 HEAD 与 QA，不删除任务、D1 记录和 R2 前缀。本轮没有执行或修改该历史脚本。

### 验收结论与历史任务隔离

**本轮隔离渲染 / R2 写入、读回与清理已通过。** 通过范围严格限定为：真实 002 Container、Edge TTS 固定 composition、MP4 产出、R2 写入与读回哈希校验、唯一 key 删除，以及测试 renderer 和临时 Worker 清理。它没有经过业务 Workflow、D1、Workers AI、DeepSeek、ASR，也不是一条正式用户任务，因此不能替代正式业务建单到下载的端到端验收。

数据库里的 92 条旧失败任务继续作为历史记录单独处理：它们没有成片、海报、音频或 QA key，只有在提交渲染前可能写入的 manifest key；旧文件缺失不能用来判断 002 新链路成功或失败。本轮没有新增任务，因此也没有把任何旧失败记录误记成新任务回归结果。

## CI 发布凭据状态

两枚 002 专用 CI Token 已获批准、写入 GitHub Repository Secrets，并通过真实发布验收；有效期均截至 2027-10-10 22:00（北京时间）：

- `VIDEO_FACTORY_CLOUDFLARE_API_TOKEN`：Workers Scripts Edit、D1 Edit、Containers Edit、R2 Read、Workers AI Read。
- `VIDEO_STUDIO_CLOUDFLARE_API_TOKEN`：Cloudflare Pages Edit。

长期业务密钥继续使用既有 `VIDEO_FACTORY_ADMIN_TOKEN` 与 `VIDEO_FACTORY_INTERNAL_TOKEN`，值不进入仓库或日志。

## GitHub Actions 最终验收

- Video Studio：[run 38011245470](https://github.com/Hans010101/ai-shengyi-jing/actions/runs/38011245470)，结论 `success`；发布到 002 Pages 项目 `ai-shengyi-video-studio`，本次部署地址 `https://34237a41.ai-shengyi-video-studio-5dw.pages.dev`。
- Video Factory：[run 38011509322](https://github.com/Hans010101/ai-shengyi-jing/actions/runs/38011509322)，结论 `success`；测试、类型检查、D1 migration、secret 配置、Worker 与 Container 发布均成功。最终硬健康门输出 `rendererEnabled=true` 与 `renderer health=ok`，带管理员凭据的 `/api/renderer/health` 返回有效 renderer 健康结果。
- 工作流已移除“完整发布失败后回退 API-only 仍显示成功”的路径；完整发布或 renderer 健康检查失败都会令 Action 失败。
- 验收没有创建视频任务、调用 Workers AI/DeepSeek 或写入业务数据。

## 007 历史 R2 调查

- 迁移证据中没有视频 R2 对象级清单，也没有对象复制/校验记录。`full-ai-shengyi-video-factory-assets-manifest.json` 只包含 4 个 Worker 静态资源，不是视频 R2 清单。
- 源端、切换时源端、切换时目标端三份 D1 快照结果一致：共 135 个任务，43 个成功、92 个失败。43 个成功任务全部已有 `artifacts_deleted_at`，保留中的成功产物为 0；其保留期最晚到 2026-10-04，最晚清理记录为 2026-10-05。
- 92 个失败任务没有 `output_key`、`poster_key`、`audio_key` 或 `qa_key`，只保留 `manifest_key`。代码会在提交渲染前写入 manifest，因此该字段不能证明存在可下载成片；失败任务也会被输出接口拒绝。失败流程可能在 007 留下未发布的 manifest、脚本、快照或尝试产物，但它们不是有效发布成片。
- 007 控制台当前明确显示 R2 订阅已删除；临时恢复又被未结清账单阻止，因此无法执行对象级枚举。证据为 `007-r2-subscription-deleted-20261010.png`。用户已明确决定不支付 221.26 美元欠款、也不重开 007 R2；除非用户以后明确改变决定，否则旧 bucket 的物理对象状态保持未核查，不能声称历史对象已迁移。

当前结论：002 的 Worker、D1、R2、Workflow、Container 已独立运行，没有已发布历史成片继续依赖 007；007 是否仍有孤儿或失败任务中间件属于用户明确接受的未核查迁移边界。

## 删除 007 前的依赖核对（2026-10-10）

视频产品自身已经具备切离 007 的条件：

- Studio 正式入口为 `https://ai-shengyi-video-studio-5dw.pages.dev`，Pages 项目和发布工作流均固定到账号 002；界面不再把用户引回旧 Studio 域名。
- Factory 正式入口为 `https://ai-shengyi-video-factory.bitman001.workers.dev`，Workers AI、D1、R2、Workflow、Durable Object 与 Container 都通过 002 的 Wrangler 配置绑定；R2 没有跨账号 endpoint 或 007 bucket 引用。
- Container 镜像、应用和 Durable Object 均在 002，健康检查已通过；新任务不需要访问 007 才能进入生产管线。
- AI 生意经来源连接器使用 002 的 `ai-shengyi-jing-etz.pages.dev` 数据源，界面返回站点使用正式域名 `https://aishengyijing.asia`。
- 当前仓库的三条 Cloudflare 发布工作流均固定到 002；视频 Studio 与 Factory 使用各自的 002 专用 GitHub secret，不会自动回退到 007。

旧仓库 `/Users/hans.pan/Documents/project/ai-video-factory` 是历史 OpenMontage 手动部署源，仍含 007 的 Worker、D1、R2 和镜像地址。该仓库没有 GitHub Actions、没有项目任务文件，也没有发现对应的 launchd、运行进程或 Docker 容器；007 的在线 Worker 清单也没有同名服务，因此没有发现当前调用者。它仍是一次误执行 `wrangler deploy` 的风险，正式删除 007 前应归档或另做明确的部署禁用；本次未修改其中的用户工作区改动。

账号级结论与视频产品不同：当前还不能安全删除整个 007 账号。工作区仍有以下项目引用 007，必须逐项确认是迁移还是退役后再删除账号：

- `web3-intel-matrix` 的 Wrangler 账号仍为 007；
- `fundarb` 仍有旧 Worker、容器 registry 和 Access 域名；
- `geo-seo-system` 仍调用 007 的 cron Worker，并在部署配置中保留旧地址；
- `ai-baibaoxiang` 的默认 advisor endpoint 仍指向 007；
- `midas-trading` 的 Cloudflare 工作流仍检查 007 Worker。

以上是源代码引用审计，不等同于 Cloudflare 账号级资源清单；删除账号前仍需枚举 007 的 zones、DNS/custom domains、Workers、D1、KV、Queues、R2、Access 和 Pages，防止遗漏不在本机仓库中的依赖。

**结论：视频产品层面可切离 007 并在 002 上创建新任务；账号层面暂不可删除 007。** 本次按约束没有启动付费视频生成，因此“新任务最终产出成片”的业务验收仍沿用既有部署证据，不新增一条付费 E2E 证据。

## 后续发布与安全

- 只通过 GitHub Actions 和两枚 002 专用 Repository Secrets 发布；不要把历史迁移脚本当作日常部署入口。
- 不在报告、日志或仓库中保存 Cloudflare token、Factory 管理密钥或 DeepSeek key。
- 删除 007 前先完成上面的账号级资源清单和其他项目迁移；删除动作本身必须单独授权。

## 已验证的本地事实

- R2 bucket：`ai-shengyi-video-factory` 已在 002 创建；
- 目标 Worker secret：`DEEPSEEK_API_KEY`、`FACTORY_ADMIN_TOKEN`、`INTERNAL_RENDER_TOKEN` 已存在；
- 镜像构建完成，manifest list digest：`sha256:d54bdac54ca2c3368aa375523e18330462e492294c620b391ca6f4091179b5d5`；
- Workers AI 是脚本生成首选，DeepSeek 只在 Workers AI 失败后调用；两者都失败时使用确定性脚本；
- 每日 cron 只清理过期 R2 成片，不再自动创建 DeepSeek/视频任务。

# 002 正式部署交接

这套脚本完成 002 账号的 Worker、D1、Workflow、Workers AI、R2、Durable Object 和 Container 上线，并执行一条非 AI 生意经案例的书籍/漫画风真实生产验收。

## 交接坐标

- Studio 源目录：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/public`
- Studio Pages 目标：账号 002 / 项目 `ai-shengyi-video-studio`；生成域名 `ai-shengyi-video-studio-5dw.pages.dev`；GitHub secret `VIDEO_STUDIO_CLOUDFLARE_API_TOKEN`
- 案例与素材数据源：账号 002 / `https://ai-shengyi-jing-etz.pages.dev/data/`，完整与 API-only 配置保持一致
- Worker/Container 配置：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/wrangler.jsonc`
- API-only 降级配置：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/wrangler.api.jsonc`
- Worker dry-run 构建：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/.migration-002/worker-dry-run`
- 两阶段发布脚本：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/.migration-002/deploy-002.sh`
- 线上验收脚本：`/Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory/.migration-002/accept-002.sh`
- 已推送迁移与 CI 提交：`def20f27` 至 `d950dd68`；最新提交为 `d950dd68 fix: authenticate renderer deployment health check`。

## 正式运行验收（2026-10-10）

- Worker `ai-shengyi-video-factory` 最新 CI Version ID：`10458053-0b31-4c44-ba4b-e2dcfb9a4bca`；`/` 与 `/api/health` 均返回 200，未带凭据访问 `/api/renderer/health` 返回 401。
- 使用现有 `FACTORY_ADMIN_TOKEN` 只读访问 `/api/renderer/health` 返回 200，renderer 返回 `ok: true`、`service: video-renderer`、`activeJobs: 0`。
- Container application ID：`a0352c7a-9c23-4517-ab53-5df810b794d3`；Durable Object namespace：`210f980342744814a916f436ee8d392e`；最大实例数为 3。
- 最新 CI 镜像 digest：`sha256:789bd0a2d8d67d3568287ad1ce884aa69a0d02f35b8f84cc26abc02555498818`。
- 最终 Worker 保留 Assets、3 个 secret，并已绑定 Workers AI、D1、R2 `VIDEO_BUCKET`、含 Container metadata 的 `VIDEO_RENDERER` Durable Object 和 `VIDEO_WORKFLOW`；`RENDERER_ENABLED=true`。
- Workflow instance 列表为 0；唯一 schedule 是 R2 过期产物清理 `15 1 * * *`，没有每日 DeepSeek 或自动视频生成任务。
- Container 的 `Dockerfile`、`entrypoint.sh`、`server.mjs`、`render-job.mjs`、`package.json` 共 5 个源文件哈希与推送 context 一致。
- 本次 renderer 验收只做健康读取，没有调用模型、创建视频任务、激活设备或写入业务数据。

证据位于迁移证据目录：

- `video-final-deploy-002-20261010.json`
- `video-final-settings-002-20261010.json`
- `video-final-schedules-002-20261010.json`
- `video-final-runtime-checks-002-20261010.json`
- `video-container-created-002-20261010.json`
- `video-container-source-hashes-002-20261010.json`
- `video-renderer-health-002-20261010.json`

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

## 安全前置

先撤销或刷新之前出现在工具输出中的 OAuth access/refresh token。不要继续使用
`/Users/hans.pan/Documents/Codex/2026-10-06/task/.target-auth/.wrangler/config/copy002.toml`
里的旧 token。临时 Containers token 和 DeepSeek key 没有写入本目录。

设置一枚刷新后的 Workers Scripts + D1 权限 token；现有 Containers token 继续从迁移目录的 0600 文件读取：

```bash
cd /Users/hans.pan/Documents/project/ai-shengyi-jing/video-factory
export CLOUDFLARE_WORKERS_TOKEN='<fresh workers token>'
bash .migration-002/deploy-002.sh
```

部署脚本会：

1. 跑单测和 TypeScript 检查；
2. 应用 D1 migration；
3. 以 `--containers-rollout=none --keep-vars` 发布完整 Worker，保留已配置的独立 DeepSeek secret；
4. 推送已构建镜像 `migration-ai-shengyi-video-renderer:20261010`；
5. 通过 Containers API 创建或更新 `ai-shengyi-video-renderer`，若发现同名应用连接了其他 Durable Object 会安全退出，不做删除；
6. 验证镜像、DO namespace 和最大实例数。

## 验收

只读健康检查：

```bash
bash .migration-002/accept-002.sh
```

真实端到端验收会创建一条 30 秒、书籍输入、漫画风任务，并检查 MP4 与 QA 报告：

```bash
export FACTORY_ADMIN_TOKEN='<existing video factory admin token>'
bash .migration-002/accept-002.sh
```

证据写到 `.migration-002/evidence/`，不写入任何密钥。脚本不会删除 007 资源，也不会恢复历史渲染任务。

## 已验证的本地事实

- R2 bucket：`ai-shengyi-video-factory` 已在 002 创建；
- 目标 Worker secret：`DEEPSEEK_API_KEY`、`FACTORY_ADMIN_TOKEN`、`INTERNAL_RENDER_TOKEN` 已存在；
- 镜像构建完成，manifest list digest：`sha256:d54bdac54ca2c3368aa375523e18330462e492294c620b391ca6f4091179b5d5`；
- Workers AI 是脚本生成首选，DeepSeek 只在 Workers AI 失败后调用；两者都失败时使用确定性脚本；
- 每日 cron 只清理过期 R2 成片，不再自动创建 DeepSeek/视频任务。

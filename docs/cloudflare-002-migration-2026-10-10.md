# AI 生意经 Cloudflare 002 迁移记录

2026-10-10 北京时间核验。范围为官网、案例库、订阅与 AI API，以及本项目的采集和发布流水线；视频工厂及视频 CI 由独立任务维护。

状态为部分完成。002 已有可用的站点与 API，源码已消除官网接口对 007 Pages 的调用，但长期 CI 密钥和主域名迁移尚未完成，不能认定已独立承接。

## 入口与资源

| 用途 | 配置与状态 |
|---|---|
| 002 账号 | `a828bebda1f352216c7d7da425bad17a` |
| Pages 项目 | `ai-shengyi-jing`，直接上传项目，无 Git 直连 |
| 002 新入口 | https://ai-shengyi-jing-etz.pages.dev |
| 主域名 | https://aishengyijing.asia，仍待总迁移任务切换注册商 DNS 并完成 002 绑定 |
| 007 备用入口 | https://ai-shengyi-jing.pages.dev，保留过渡转接，不删除 |
| EdgeOne | https://ai-shengyi-jing-cn-vfh61o1a.edgeone.dev |
| 运行绑定 | Workers AI `AI`，已在 002 实际推理成功 |
| 生产 Secrets | `EDITORIAL_API_TOKEN`、`EDGEONE_PROXY_SECRET`、`RESEND_API_KEY`、`RESEND_SEGMENT_ID` 已迁移 |

官网案例数据保存在 GitHub，不使用 D1、KV、R2、Durable Objects、队列或 Cloudflare 定时任务。收藏与浏览记录保存在访客浏览器；无用户登录或 OAuth 回调。订阅联系人继续由现有 Resend 管理，不迁移或重建联系人。

## 数据和业务核验

- GitHub 基线 `045467c440306594d40b9a71187daf21ffad667d`，4,051 个唯一项目、4,051 篇详情，覆盖率 100%，全量质量检查通过。
- 10 月 9 日晚间采集实际新增 16 个项目、刷新 5 个旧案例；新项目积压和失败队列为零，仍有 1,520 条待分批复核的旧案例，不能称为历史复核全部结束。
- 迁移初始副本虽有完整索引，却缺少 `deployment.json`，且最新案例 `75b62dfa6fcb` 详情实际返回 404。本次从 GitHub 全量构建并发布后已恢复。
- 002 生产部署 `602ce2b6-194e-4feb-8a15-847d8e089dea` 成功，代码版本 `100452c666ce0dc84b82824a6d48a819e00e8dc7`。本次上传 102 个文件、复用 3,968 个已有文件。
- 四个入口的 `deployment.json` 均返回该版本；完整项目索引、完整文章汇总与 6 个分散抽样详情（含最新案例）均与本地构建 SHA-256 一致。全量 4,051 篇本地校验通过；未对线上每个独立详情逐一请求。
- 四个入口的首页、`?lang=en` 英文入口及案例页面（跟随 Pages 的规范化跳转）均可访问，语言切换资源存在；线上前端已包含 002 订阅地址。未重新进行浏览器视觉验收。
- 四个入口 `/api/advisor` 均实际返回 200 和非空 Workers AI 回答。002 编辑接口拒绝未授权请求，迁移后的正确密钥通过鉴权并返回输入校验结果。
- 修复过渡桥保留浏览器 Origin 导致主域名订阅误报 403 的问题，仅放行明确的本站域名，继续拒绝任意外部 Origin。主域名、007 备用入口、002 的非法邮箱测试均返回预期 400；EdgeOne 预检返回正确 CORS Origin。
- Resend API 可读取现有订阅分组，`aishengyijing.asia` 发信域名状态为 `verified`。未发送测试邮件或创建联系人，不能把输入校验成功当作实际投递验收。
- 案例数据库与文章汇总未发现 007 Pages、Workers 或 R2 域名素材链接。

## 发布路径

GitHub `main` 为唯一代码与成品数据源。每天北京时间 08:17、20:43 云端采集，保留双来源发现、旧案例复核、失败重试、质量门禁和巡检；不依赖用户电脑。77 项回归测试通过（52 项 Python、25 项 Node）。

官网 Actions 固定 002 Account ID，使用独立 Repository Secret `CLOUDFLARE_002_API_TOKEN`，构建一次公共成品后发布到 002 Pages 与 EdgeOne。该密钥必须具备 002 Pages 编辑权限；缺失时明确失败，禁止回退到 007。共享旧 Token、账号变量和视频工作流保持不动。

编辑接口、EdgeOne 顾问上游、EdgeOne 浏览器订阅地址均改为 002 Pages。巡检必需入口改为主域名、002 Pages、EdgeOne，007 备用入口不再是必需依赖。

本次 002 使用已有目标账号 OAuth 完成一次人工发布，没有刷新 OAuth 或把临时凭据写入 GitHub。Pages 不接受 Wrangler 配置中的 `account_id`，账号通过 `CLOUDFLARE_ACCOUNT_ID` 发布环境变量锁定。

Actions [37962891431](https://github.com/Hans010101/ai-shengyi-jing/actions/runs/37962891431) 已发布 EdgeOne；线上版本和实际顾问调用均核验成功。Cloudflare 自动发布仍受下述密钥缺失阻塞，不能将人工发布成功计为 CI 成功。

## 尚未闭环的依赖

1. `CLOUDFLARE_002_API_TOKEN` 尚未配置。长期自动发布无法验收；临时本机 OAuth 不写入 GitHub，也不视为永久 CI 权限。
2. 主域名和 www 仍绑定 007 Pages，注册商切换及 002 自定义域名激活由总迁移任务协调。邮件中的主域名链接也受此影响；Resend 域名验证本身正常。
3. EdgeOne 已切换到本次版本。工作流先发布 EdgeOne，再单独校验 002 密钥；002 未授权不会阻止 EdgeOne 切换，但整次工作流仍明确失败，不掩盖 Cloudflare 未自动发布。补齐密钥后须重新运行并验收完整流水线，自动巡检的有限重试不能修复缺失凭据。
4. 007 原入口作为历史备用保留，它本身仍需 007 可用；完成主域名切换后不应成为任何核心功能或部署的前提。

没有删除或清空 007 资源，没有整库覆盖 002 新数据，没有修改视频工厂、账号订阅、共享 OAuth、注册商验证码或其他项目资源。账号级前提由总迁移任务统一协调。

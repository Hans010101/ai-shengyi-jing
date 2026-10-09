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
- 迁移前四个入口均返回 4,051 条索引；002 缺少 `deployment.json`，需由最新仓库构建修复。
- 002 `/api/advisor` 实际返回非空 Workers AI 回答；编辑接口拒绝未授权请求，迁移后的正确密钥通过鉴权并返回输入校验结果。
- 002 订阅接口拒绝非法邮箱；EdgeOne 预检返回正确 CORS Origin。Resend API 可读取现有订阅分组，`aishengyijing.asia` 发信域名状态为 `verified`。未发送测试邮件或创建联系人。
- 案例数据库与文章汇总未发现 007 Pages、Workers 或 R2 域名素材链接。

## 发布路径

GitHub `main` 为唯一代码与成品数据源。每天北京时间 08:17、20:43 云端采集，保留双来源发现、旧案例复核、失败重试、质量门禁和巡检；不依赖用户电脑。75 项回归测试通过。

官网 Actions 固定 002 Account ID，使用独立 Repository Secret `CLOUDFLARE_002_API_TOKEN`，构建一次公共成品后发布到 002 Pages 与 EdgeOne。该密钥必须具备 002 Pages 编辑权限；缺失时明确失败，禁止回退到 007。共享旧 Token、账号变量和视频工作流保持不动。

编辑接口、EdgeOne 顾问上游、EdgeOne 浏览器订阅地址均改为 002 Pages。巡检必需入口改为主域名、002 Pages、EdgeOne，007 备用入口不再是必需依赖。

## 尚未闭环的依赖

1. `CLOUDFLARE_002_API_TOKEN` 尚未配置。长期自动发布无法验收；临时本机 OAuth 不写入 GitHub，也不视为永久 CI 权限。
2. 主域名和 www 仍绑定 007 Pages，注册商切换及 002 自定义域名激活由总迁移任务协调。邮件中的主域名链接也受此影响；Resend 域名验证本身正常。
3. EdgeOne 线上原顾问代理和订阅前端待本次 Actions 发布验证。工作流先发布 EdgeOne，再单独校验 002 密钥；002 未授权不会阻止 EdgeOne 切换，但整次工作流仍明确失败，不掩盖 Cloudflare 未自动发布。
4. 007 原入口作为历史备用保留，它本身仍需 007 可用；完成主域名切换后不应成为任何核心功能或部署的前提。

没有删除或清空 007 资源，没有整库覆盖 002 新数据，没有修改视频工厂、账号订阅、共享 OAuth、注册商验证码或其他项目资源。账号级前提由总迁移任务统一协调。

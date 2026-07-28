# AI生意经运维基线

最后更新：2026-07-26

## 生产基线

| 项目 | 配置 |
|---|---|
| GitHub 仓库 | `Hans010101/ai-shengyi-jing` |
| 默认/生产分支 | `main` |
| Cloudflare Pages 项目 | `ai-shengyi-jing` |
| 生产地址 | `https://ai-shengyi-jing.pages.dev` |
| EdgeOne Makers 项目 | `ai-shengyi-jing-cn` |
| EdgeOne 试运行区域 | 全球可用区（不含中国大陆） |
| 自定义域 | 暂无 |
| Pages Git 直连 | 未启用 |
| 发布方式 | GitHub Actions + Wrangler |
| 公共发布目录 | `dist/`（两个平台共用） |
| EdgeOne 发布目录 | `dist-edgeone/`（公共成品 + 转发函数） |
| 生产环境变量/绑定 | Workers AI binding：`AI`；Secret：`EDITORIAL_API_TOKEN` |

## 发布边界

`scripts/build_site.py` 只允许以下文件进入 `dist/`：

```text
index.html
case.html
assets/app.js
assets/case.js
assets/style.css
assets/case.css
data/projects.js
data/projects_live.json
data/case_articles.json
data/case_articles/<project-id>.json
deployment.json
```

任何新增的静态公开文件必须显式加入 `PUBLISH_PATHS` 或 `GENERATED_PATHS`，并通过测试确认。`functions/api/advisor.js` 与 `functions/api/editorial.js` 由 Cloudflare 单独编译，不会作为静态文件公开。EdgeOne 包只额外加入 `edge-functions/api/advisor.js`。禁止直接部署仓库根目录，因为仓库包含采集脚本、工作流、内容草稿和内部状态数据。

## 正常发布流程

```text
功能或数据变更
  → GitHub main
  → 数据校验
  → 公共静态成品只构建一次
  → Pages Function 编译与测试
  ├→ Wrangler 上传 dist/ 与 Cloudflare Function
  └→ EdgeOne CLI 上传 dist-edgeone/
```

普通维护通过 PR 合并到 `main` 触发。每日采集由 `每日项目采集` 工作流提交数据；该工作流完成后，`workflow_run` 事件会部署最新的 `main`。这样不依赖 GitHub Token 生成的提交再次触发 `push` 工作流。

## 部署前检查

```bash
python3 scripts/validate_data.py data/projects_live.json
python3 scripts/validate_case_catalog.py
python3 -m unittest discover -s tests -v
node --test tests/*.mjs
python3 scripts/build_site.py --output dist
python3 scripts/build_edgeone.py --source dist --output dist-edgeone
npx wrangler@4.113.0 pages functions build functions --outdir .wrangler/functions-build --project-directory . --build-output-directory dist
find dist -type f | sort
find dist-edgeone -type f | sort
```

验收要求：

- 数据 JSON 合法且项目 ID 唯一；
- 回归测试全部通过；
- Pages Function 编译成功，且 `AI` binding 配置存在；
- `dist/` 包含每个项目一份独立案例文件及其余公开资源，文件总数为项目数加 10；
- `dist-edgeone/` 包含完全相同的静态文件和唯一的 EdgeOne 转发函数；
- 不包含 `.github/`、`.wrangler/`、`pipeline/` 或内容草稿。

## AI 商业顾问

访客侧顾问不使用 DeepSeek。`POST /api/advisor` 通过 `wrangler.jsonc` 中的 `AI` binding 调用 Cloudflare Workers AI；当前模型为 `@cf/meta/llama-3.2-3b-instruct`。站点没有用户登录系统，所有访客都可直接调用。

若 Workers AI 绑定缺失、达到额度或推理服务暂时不可用，接口会返回可识别的错误，前端自动使用本地项目匹配与固定分析作为降级，不阻断页面功能。收藏与浏览记录仅保存在访客当前浏览器中。

访客侧顾问仍不使用 DeepSeek。DeepSeek 只作为后台案例编辑的降级模型，对应密钥是 `DEEPSEEK_API_KEY`，不得放入 Cloudflare Pages 前端或 Function 环境。

EdgeOne 不配置第二套 AI。其 `/api/advisor` 读取同源访客请求，用 `EDGEONE_PROXY_SECRET` 对正文和时间戳生成 HMAC 签名，再转发到 Cloudflare。Cloudflare 只接受原站同源浏览器请求或五分钟内签名有效的 EdgeOne 请求。两平台环境变量中的 `EDGEONE_PROXY_SECRET` 必须保持一致。

## 案例详情与编辑链路

- 所有项目按钮都进入 `case.html?id=<项目ID>`，并按需加载 `data/case_articles/<项目ID>.json`；
- 导航中的 `cases.html` 提供全量案例详情目录，分类来自 `projects_live.json` 的 `niche` 字段；目录只加载项目索引，点击后再按 ID 加载单篇详情；
- 全量案例生成器保留人工精修稿，其余稿件仅依据现有结构化事实生成 6—8 节中文商业文章；
- 图片只使用来源页公开主图、正文容器图片或项目官网公开素材的远程链接；广告、水印、HubSpot 标识、社交工具图标和相邻案例缩略图必须过滤；
- YouTube/Vimeo 视频必须同时具备真实观看地址、公开标题与封面，页面用可点击视频卡片展示；无法取得封面的失效视频直接删除；
- 媒体目标为每篇 3—5 个，但以来源实际公开素材为准，不使用无关占位图补数；
- `scripts/validate_case_catalog.py` 强制检查项目覆盖、中文标题、章节数、正文长度、媒体来源语境、视频元数据与已删除的界面文案；
- `POST /api/editorial` 是受 `EDITORIAL_API_TOKEN` 保护的后台接口，通过 `AI` binding 运行 Workers AI；
- 每日采集先调用该接口生成微信公众号风格原创稿，失败或额度不足时再调用 DeepSeek；
- 不采集需要登录或付费解锁的正文，不保存来源原文；
- 图片优先使用项目官网公开链接，视频允许官网文件及 YouTube/Vimeo 公开嵌入链接；
- 来源页公开插图只保存远程 URL，并标记为 `source-attributed` 和 `non-commercial-attributed`；页面图片带原页面回链，站点商业化前必须取得授权或移除；
- 每篇文章必须保留 Starter Story 事实来源链接和原创编辑声明。

## 每日采集

计划时间：每天 UTC 01:00，即中国标准时间 09:00。

采集状态由两个来源共同判断：

1. `data/projects_live.json` 中已有的项目 ID；
2. `pipeline/data/seen_ids.json` 中已处理的项目 ID。

数据库是最终事实来源。写入时新项目优先，并按 ID 去重。流水线必须同时提交数据库、`case_articles.json` 和 `seen_ids.json`。新项目会在结构化内容生成后进入案例编辑链路。
随后 `generate_case_catalog.py --missing-only` 只为缺失 ID 生成独立详情文件，避免每日重写历史案例。
新增案例抓取使用全局请求间隔与 429 自动退避；全量纠正历史素材时，运行 `generate_case_catalog.py --refresh-all-media --workers 8 --request-interval 0.08 --request-retries 2`，它只更新媒体、不重写文章正文。随后运行 `generate_case_catalog.py --normalize-local-media` 补齐来源语境并删除无法取得封面的失效视频。

## 故障处理

### Cloudflare 返回认证错误 10000

1. 确认 GitHub 中 Cloudflare Account ID、API Token 与编辑接口 Token 配置均存在；
2. 确认 Repository variable `CLOUDFLARE_ACCOUNT_ID` 和 Repository secret `CLOUDFLARE_API_TOKEN` 均可用；
3. Token 至少需要该账户的 Cloudflare Pages 编辑权限；
4. 确认 `wrangler.jsonc` 中存在 `AI` binding，并在功能分支手动触发部署工作流，先验证预览部署；
5. 不要在日志、仓库或 Issue 中粘贴 Token。

### 每日采集成功但生产数据未更新

1. 检查 `每日项目采集` 是否成功；
2. 检查随后产生的 `自动部署到 Cloudflare Pages` workflow run；
3. 确认部署工作流 checkout 的是最新 `main`；
4. 比较线上 `data/projects_live.json` 与仓库文件的项目数量。

### 数据出现重复 ID

```bash
python3 scripts/repair_project_data.py
python3 scripts/validate_data.py data/projects_live.json
```

修复后检查差异，只提交预期的数据和 `seen_ids.json` 变化。

## 回滚

优先使用 Git 回滚，避免让 Cloudflare 与仓库长期分叉：

1. 对问题提交创建 `git revert`；
2. 合并到 `main`；
3. 等待部署工作流完成；
4. 验证生产 URL 和数据库数量。

紧急情况下可在 Cloudflare Pages 中回滚到上一成功部署，但随后仍需在 GitHub 中修复并重新部署，使两边恢复一致。

## 密钥与权限

- 密钥只保存在 GitHub Actions Secrets 或 Cloudflare 的受控配置中；
- `EDGEONE_API_TOKEN` 只保存在 GitHub Actions Secret；
- `EDGEONE_PROXY_SECRET` 只保存在 Cloudflare Secret 与 EdgeOne 环境变量；
- Cloudflare Account ID 不是密钥，保存在 GitHub Repository variables 中；
- 仓库内只记录密钥名称，不记录值；
- `.wrangler/` 是本地缓存，已加入 `.gitignore`；
- 更新 Token 后必须通过一次预览部署验证权限。
- `EDITORIAL_API_TOKEN` 必须在 Cloudflare Pages Secret 与 GitHub Actions Secret 中保持同一个值。

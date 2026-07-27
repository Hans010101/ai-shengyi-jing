# 💡 AI生意经

发现全球可验证的盈利项目，以中国创业者视角拆解产品架构、商业闭环和落地路径。

- 生产站点：<https://ai-shengyi-jing.pages.dev>
- 国内镜像项目：EdgeOne Makers `ai-shengyi-jing-cn`
- 托管平台：Cloudflare Pages + EdgeOne Makers
- 生产分支：`main`
- 当前数据库：3,646 个已完成中文商业拆解的唯一项目
- 更新频率：每天 09:00（Asia/Shanghai）

## 项目组成

```text
.
├── index.html                       # 项目发现页
├── case.html                        # 站内案例详情页
├── assets/                          # 前端脚本与样式
├── functions/api/advisor.js         # Cloudflare Workers AI 顾问接口
├── functions/api/editorial.js       # 私有案例编辑接口
├── edge-functions/api/advisor.js    # EdgeOne 到 Cloudflare 顾问的签名转发
├── data/
│   ├── projects.js                  # 手工精选案例
│   ├── projects_live.json           # 全量项目数据库
│   ├── case_articles.json           # 5 篇人工精修基准稿
│   └── case_articles/               # 每个项目一个按需加载的案例详情
├── pipeline/
│   ├── scraper.py                   # 每日增量采集
│   ├── article_pipeline.py           # 案例采集与原创编辑
│   ├── bulk_scraper.py              # 全量批次采集
│   ├── project_store.py             # 数据去重与合并规则
│   └── data/seen_ids.json           # 已处理项目索引
├── scripts/
│   ├── build_site.py                # 生成最小公开发布目录
│   ├── build_edgeone.py             # 为 EdgeOne 添加平台适配层
│   ├── generate_case_catalog.py     # 批量生成并补充案例媒体
│   ├── validate_case_catalog.py     # 全量案例覆盖与质量检查
│   ├── validate_data.py             # 部署前数据校验
│   └── repair_project_data.py       # 去重并同步已处理索引
├── tests/                            # 维护回归测试
├── wrangler.jsonc                    # Pages 与 Workers AI 绑定配置
└── .github/workflows/               # CI、采集与部署工作流
```

`pipeline/`、旧版内容草稿、GitHub 工作流和本地缓存不会发布到生产站点。每个项目的正式案例稿及页面所需项目摘要保存为独立 JSON，用户打开详情页时只按 ID 加载当前文章，避免下载完整项目库和全部文章。`dist/` 由两个站共用且只构建一次，其中 `deployment.json` 标记当前 Git 提交。Cloudflare 另外编译 `functions/`；EdgeOne 发布包只在相同静态成品上增加 `edge-functions/api/advisor.js`，不运行第二套内容生成。

## 本地运行

要求 Python 3.11+ 和 Node.js 22+。

```bash
python3 scripts/validate_data.py data/projects_live.json
python3 scripts/validate_case_catalog.py
python3 -m unittest discover -s tests -v
node --test tests/*.mjs
python3 scripts/build_site.py --output dist
python3 scripts/build_edgeone.py --source dist --output dist-edgeone
npx wrangler@4.113.0 pages functions build functions --outdir .wrangler/functions-build --project-directory . --build-output-directory dist
python3 -m http.server 8080 --directory dist
```

静态页面可访问 <http://localhost:8080>。需要联调 AI 接口时，使用 Wrangler Pages 本地开发服务。

## AI 商业顾问

- 网页无需注册或登录，AI 顾问、收藏和浏览记录均可直接使用；
- 顾问通过 `AI` binding 调用 Cloudflare Workers AI，模型为 `@cf/meta/llama-3.2-3b-instruct`；
- EdgeOne 镜像的同源 `/api/advisor` 使用带时效 HMAC 签名的服务端转发，仍由同一个 Cloudflare Workers AI 接口回答；
- Workers AI 不可用或免费额度用尽时，前端自动降级到本地项目库分析；
- 收藏和浏览记录只保存在当前浏览器的 `localStorage`，不上传账户数据；
- `DEEPSEEK_API_KEY` 仅供后台内容采集与中文商业拆解使用，不参与访客侧 AI 顾问请求。

## 数据维护

所有项目的“案例详情”均指向站内页面。3,646 个项目均拥有独立的微信公众号风格案例文件，页面按项目 ID 加载，不再把访客直接带离本站。

批量案例目录可按以下方式重建。默认只使用现有中文结构化事实；增加 `--fetch-media` 后，会以受控并发发现来源页公开图片和可嵌入视频。5 篇人工精修基准稿默认不会被覆盖。

```bash
python3 scripts/generate_case_catalog.py --fetch-media --workers 4
python3 scripts/validate_case_catalog.py
```

每日采集只为新增项目补文件，避免重写全部历史案例：

```bash
python3 scripts/generate_case_catalog.py --missing-only --fetch-media --workers 2
```

案例编辑链路先调用 Cloudflare Workers AI；额度耗尽、超时或服务不可用时，才使用 DeepSeek。采集器只读取无需登录即可看到的公开事实，不绕过付费墙；文章不逐句翻译或复刻来源结构。媒体优先引用项目官网公开图片、来源页公开图片、官网视频和 YouTube/Vimeo 公开嵌入链接。第三方图片不下载到仓库，页面以带原页面回链的远程引用方式展示；若站点商业化，必须先取得授权或移除这类素材。

每日增量采集：

```bash
pip install requests beautifulsoup4 openai
export DEEPSEEK_API_KEY="..."
export EDITORIAL_API_TOKEN="..."
python3 pipeline/scraper.py
```

数据异常时可执行：

```bash
python3 scripts/repair_project_data.py
python3 scripts/validate_data.py data/projects_live.json
```

合并规则是“新记录优先、每个项目 ID 只保留一条”。采集器会同时参考数据库和 `seen_ids.json`，避免状态文件滞后导致重复写入。每条公开项目必须包含中文项目名、项目介绍、商业模式、产品架构、商业闭环和三步上手路径。

## 自动化流程

- `代码与数据检查`：PR 和 `main` 推送时执行数据校验、测试和公开产物边界检查。
- `每日项目采集`：每天采集新项目，提交数据库、草稿和 `seen_ids.json`。
- `自动部署到 Cloudflare 与 EdgeOne`：
  - 普通代码合并到 `main` 后部署；
  - 每日采集工作流成功完成后部署最新 `main`；
  - 公共静态成品只构建一次，再分别发布到两个平台；
  - 支持手动触发，用于预览或故障恢复。

部署依赖以下 GitHub Actions 配置：

- Repository variable：`CLOUDFLARE_ACCOUNT_ID`
- Repository secret：`CLOUDFLARE_API_TOKEN`
- Repository secret：`EDGEONE_API_TOKEN`
- Repository secret：`EDITORIAL_API_TOKEN`（调用私有案例编辑接口）
- Repository secret：`DEEPSEEK_API_KEY`（仅每日采集）

平台运行时还各自保存同一枚 `EDGEONE_PROXY_SECRET`，只用于 EdgeOne 顾问转发签名，不进入 GitHub。

完整运维流程、故障处理和回滚方式见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 合规说明

- 平台输出原创中文商业分析，不复制或改写受限文章全文。
- 数据采集应遵守来源网站条款、robots.txt 和合理请求频率。
- 每篇深度案例保留事实来源链接；第三方素材仅在获准范围内引用。
- 商业数据仅作研究参考，创业和投资决策需独立核验。

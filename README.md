# 💡 AI生意经

发现全球可验证的盈利项目，以中国创业者视角拆解产品架构、商业闭环和落地路径。

- 生产站点：<https://ai-shengyi-jing.pages.dev>
- 托管平台：Cloudflare Pages
- 生产分支：`main`
- 当前数据库：3,650 个唯一项目
- 更新频率：每天 09:00（Asia/Shanghai）

## 项目组成

```text
.
├── index.html                       # 单页站点
├── assets/                          # 前端脚本与样式
├── data/
│   ├── projects.js                  # 手工精选案例
│   └── projects_live.json           # 全量项目数据库
├── pipeline/
│   ├── scraper.py                   # 每日增量采集
│   ├── bulk_scraper.py              # 全量批次采集
│   ├── project_store.py             # 数据去重与合并规则
│   └── data/seen_ids.json           # 已处理项目索引
├── scripts/
│   ├── build_site.py                # 生成最小公开发布目录
│   ├── validate_data.py             # 部署前数据校验
│   └── repair_project_data.py       # 去重并同步已处理索引
├── tests/                            # 维护回归测试
└── .github/workflows/               # CI、采集与部署工作流
```

`pipeline/`、内容草稿、GitHub 工作流和本地缓存不会发布到生产站点。Cloudflare 只接收 `dist/` 中的 5 个公开文件。

## 本地运行

要求 Python 3.11+；站点本身不需要 Node.js 构建。

```bash
python3 scripts/validate_data.py data/projects_live.json
python3 -m unittest discover -s tests -v
python3 scripts/build_site.py --output dist
python3 -m http.server 8080 --directory dist
```

然后访问 <http://localhost:8080>。

## 数据维护

每日增量采集：

```bash
pip install requests beautifulsoup4 openai
export DEEPSEEK_API_KEY="..."
python3 pipeline/scraper.py
```

数据异常时可执行：

```bash
python3 scripts/repair_project_data.py
python3 scripts/validate_data.py data/projects_live.json
```

合并规则是“新记录优先、每个项目 ID 只保留一条”。采集器会同时参考数据库和 `seen_ids.json`，避免状态文件滞后导致重复写入。

## 自动化流程

- `代码与数据检查`：PR 和 `main` 推送时执行数据校验、测试和公开产物边界检查。
- `每日项目采集`：每天采集新项目，提交数据库、草稿和 `seen_ids.json`。
- `自动部署到 Cloudflare Pages`：
  - 普通代码合并到 `main` 后部署；
  - 每日采集工作流成功完成后部署最新 `main`；
  - 支持手动触发，用于预览或故障恢复。

部署依赖以下 GitHub Actions 配置：

- Repository variable：`CLOUDFLARE_ACCOUNT_ID`
- Repository secret：`CLOUDFLARE_API_TOKEN`
- Repository secret：`DEEPSEEK_API_KEY`

完整运维流程、故障处理和回滚方式见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 合规说明

- 平台输出原创中文商业分析，不复制原始文章全文。
- 数据采集应遵守来源网站条款、robots.txt 和合理请求频率。
- 商业数据仅作研究参考，创业和投资决策需独立核验。
